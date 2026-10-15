-- Pairs (data-model §2.1 "Пара, разрешения, заметки, анкета, связь"): card columns on profiles, coachings,
-- coaching_trainer_meta, data_shares, managed_client_claims, coaching_notes, intakes, contact_requests and the
-- pair-column fill trigger used by money and booking tables. Policies: 20261015123200_pairs_policies.sql.

-- profiles, part 2: cards. A card is a profile a trainer keeps for a client without an account; it has no
-- Telegram id and cannot sign in. The "deleted client" stub has neither a Telegram id nor a trainer.
alter table public.profiles
  add column managed_by_trainer_id uuid references public.trainer_profiles (user_id) on delete cascade,
  add column claimed_by            uuid references public.profiles (id) on delete set null,
  alter column telegram_id drop not null,
  add constraint profiles_identity_check
    check (id = private.deleted_client_id() or ((telegram_id is null) = (managed_by_trainer_id is not null))),
  add constraint profiles_not_own_card_check check (managed_by_trainer_id <> id);

comment on column public.profiles.telegram_id is
  'Stable Telegram identity; null only for cards and the deleted-client stub. Never granted to signed-in users.';
comment on column public.profiles.managed_by_trainer_id is 'Not null = a card kept by this trainer for a client without an account.';
comment on column public.profiles.claimed_by is 'Real user the card was merged into; set by the claim RPC just before the card is removed.';

create index profiles_managed_by_trainer_id_idx on public.profiles (managed_by_trainer_id)
  where managed_by_trainer_id is not null;

-- coachings: the trainer-client pair. Never deleted by users; it ends with status 'ended'.
create table public.coachings (
  id                      uuid primary key default gen_random_uuid(),
  trainer_id              uuid not null references public.trainer_profiles (user_id) on delete cascade,
  -- NO ACTION, not restrict: it still blocks deleting a client profile on its own (the account deletion job
  -- moves pairs to the stub first), and lets a trainer account delete cascade its cards and pairs in one statement.
  client_id               uuid not null references public.profiles (id),
  status                  public.coaching_status not null default 'active',
  source                  public.coaching_source not null,
  client_invite_id        uuid,
  trial_link_id           uuid,
  started_at              timestamptz not null default now(),
  ended_at                timestamptz,
  ended_by                uuid references public.profiles (id) on delete set null,
  end_reason              text check (char_length(end_reason) <= 500),
  self_book_on_debt       boolean not null default false,               -- "allow booking in debt" for this client (Q22)
  debt_limit_sessions     smallint check (debt_limit_sessions > 0),     -- null = no limit when self_book_on_debt
  client_reminder_offsets smallint[] not null check (private.valid_reminder_offsets(client_reminder_offsets)),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint coachings_not_self_check check (trainer_id <> client_id),
  constraint coachings_ended_check check ((status = 'ended') = (ended_at is not null)),
  -- Composite keys keep a pair from pointing at another trainer's links (tenant integrity).
  constraint coachings_client_invite_fkey foreign key (client_invite_id, trainer_id)
    references public.client_invites (id, trainer_id) on delete set null (client_invite_id),
  constraint coachings_trial_link_fkey foreign key (trial_link_id, trainer_id)
    references public.trial_links (id, trainer_id) on delete set null (trial_link_id),
  -- Targets of the composite foreign keys from pair-scoped tables.
  constraint coachings_id_trainer_id_key unique (id, trainer_id),
  constraint coachings_id_client_id_key unique (id, client_id),
  constraint coachings_id_trainer_id_client_id_key unique (id, trainer_id, client_id)
);

comment on table public.coachings is
  'A trainer-client pair. Created and ended by RPCs; ended pairs stay for history.';
comment on column public.coachings.client_reminder_offsets is
  'Minutes before a session; the client edits them. Copied from the trainer default when omitted.';
comment on column public.coachings.client_id is
  'The client profile (a real user, a card or the deleted-client stub). Moves to the stub when the client account is deleted.';

create index coachings_client_id_idx on public.coachings (client_id);
create index coachings_trainer_id_status_idx on public.coachings (trainer_id, status);
-- One pair per (trainer, client), except anonymized pairs that all point to the stub (data-model §1.6).
create unique index coachings_trainer_client_uniq on public.coachings (trainer_id, client_id)
  where client_id <> private.deleted_client_id();

create trigger coachings_set_updated_at
  before update on public.coachings
  for each row execute function public.set_updated_at();

-- Definer: the caller may not be able to read the trainer's profile under RLS.
-- NOT NULL is checked after BEFORE triggers, so callers may omit client_reminder_offsets.
create function private.coachings_fill_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_reminder_offsets is null then
    select t.default_client_reminder_offsets into new.client_reminder_offsets
    from public.trainer_profiles t
    where t.user_id = new.trainer_id;
  end if;
  return new;
end $$;

comment on function private.coachings_fill_defaults() is
  'Trigger: copies the trainer default reminder offsets into a new pair when none are given.';
revoke all on function private.coachings_fill_defaults() from public;

create trigger coachings_fill_defaults
  before insert on public.coachings
  for each row execute function private.coachings_fill_defaults();

-- Definer: the pair's 1:1 rows have no INSERT grant for anyone.
create function private.coachings_create_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.client_id and p.managed_by_trainer_id = new.trainer_id
  ) then
    -- A card: the trainer enters all data, and there is no client to ask for consent.
    insert into public.data_shares (coaching_id, nutrition, measurements, photos, steps, intake, workouts, intake_decided_at)
    values (new.id, true, true, true, true, true, true, now());
  else
    insert into public.data_shares (coaching_id) values (new.id);
  end if;
  insert into public.coaching_trainer_meta (coaching_id) values (new.id);
  return null;
end $$;

comment on function private.coachings_create_children() is
  'Trigger: creates data_shares and coaching_trainer_meta for a new pair; a card pair shares everything.';
revoke all on function private.coachings_create_children() from public;

create trigger coachings_create_children
  after insert on public.coachings
  for each row execute function private.coachings_create_children();

alter table public.coachings enable row level security;
revoke all on table public.coachings from anon, authenticated;

-- coaching_trainer_meta: what only the trainer sees about a pair. Column grants cannot show a column of
-- coachings to the trainer and hide it from the client, so these live in their own row (R9).
create table public.coaching_trainer_meta (
  coaching_id    uuid primary key references public.coachings (id) on delete cascade,
  client_alias   text check (char_length(client_alias) between 1 and 64),  -- how the trainer labels the client; hidden from the client
  archived_at    timestamptz,                                              -- trainer hid the client from the active list (PRD 2.5-2, PAIR-6)
  intake_seen_at timestamptz,                                              -- trainer last opened the intake; drives "changed since" (PRD 2.4-5)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.coaching_trainer_meta is
  'Trainer-only details of a pair (alias, archive mark, intake seen). Created with the pair by a trigger.';

create trigger coaching_trainer_meta_set_updated_at
  before update on public.coaching_trainer_meta
  for each row execute function public.set_updated_at();

alter table public.coaching_trainer_meta enable row level security;
revoke all on table public.coaching_trainer_meta from anon, authenticated;

-- data_shares: what the client lets the trainer see, one row per pair.
create table public.data_shares (
  coaching_id       uuid primary key references public.coachings (id) on delete cascade,
  nutrition         boolean not null default true,   -- diary, targets, water, goal, calculator inputs
  measurements      boolean not null default true,   -- weight and body measurements
  photos            boolean not null default false,  -- progress photos only by explicit consent (Q38)
  steps             boolean not null default true,   -- steps and sleep
  intake            boolean not null default false,  -- intake only by explicit consent when the pair starts (Q38)
  intake_decided_at timestamptz,                     -- when the client answered the consent step; null = not yet
  workouts          boolean not null default true,   -- the client's own workouts (Q38)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.data_shares is
  'Which data categories the client shares with the trainer of a pair. Created with the pair; the client edits it.';

create trigger data_shares_set_updated_at
  before update on public.data_shares
  for each row execute function public.set_updated_at();

alter table public.data_shares enable row level security;
revoke all on table public.data_shares from anon, authenticated;

-- managed_client_claims: "Is this <name>?" asked of the trainer when a real person joins while cards exist.
create table public.managed_client_claims (
  id                uuid primary key default gen_random_uuid(),
  trainer_id        uuid not null references public.trainer_profiles (user_id) on delete cascade,
  claimant_id       uuid not null references public.profiles (id) on delete cascade,     -- the real user
  -- Set null, not cascade: the merge deletes this pair and the decided claim must survive it (R8).
  -- The merge RPC marks the claim decided before it deletes the pair, because a pending claim needs its pair.
  new_coaching_id   uuid references public.coachings (id) on delete set null,
  managed_client_id uuid references public.profiles (id) on delete set null,             -- the card the trainer picked
  status            public.managed_client_claim_status not null default 'pending',
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint managed_client_claims_decided_check check ((status = 'pending') = (decided_at is null)),
  constraint managed_client_claims_pending_pair_check check (status <> 'pending' or new_coaching_id is not null)
);

comment on table public.managed_client_claims is
  'Request to the trainer to merge a card into a user who just joined. Written only by RPCs.';

create index managed_client_claims_trainer_id_idx on public.managed_client_claims (trainer_id) where status = 'pending';
create unique index managed_client_claims_one_pending_uniq on public.managed_client_claims (new_coaching_id)
  where status = 'pending';
create index managed_client_claims_claimant_id_idx on public.managed_client_claims (claimant_id);

alter table public.managed_client_claims enable row level security;
revoke all on table public.managed_client_claims from anon, authenticated;

-- coaching_notes: the trainer's notes about a pair, hidden from the client by default (Q38).
create table public.coaching_notes (
  id                uuid primary key default gen_random_uuid(),
  coaching_id       uuid not null references public.coachings (id) on delete cascade,
  author_id         uuid references public.profiles (id) on delete set null,  -- trainer (wave 3: or a delegate)
  session_id        uuid,                                                      -- FK added with sessions
  body              text not null check (char_length(body) between 1 and 5000),
  visible_to_client boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.coaching_notes is 'A trainer note about a pair, optionally tied to a session and shown to the client.';

create index coaching_notes_coaching_id_created_at_idx on public.coaching_notes (coaching_id, created_at desc);

create trigger coaching_notes_set_updated_at
  before update on public.coaching_notes
  for each row execute function public.set_updated_at();

alter table public.coaching_notes enable row level security;
revoke all on table public.coaching_notes from anon, authenticated;

-- intakes: versions of the client's intake form; the latest one counts.
create table public.intakes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  form_version text not null check (char_length(form_version) between 1 and 32),  -- question set version in code
  answers      jsonb not null check (jsonb_typeof(answers) = 'object'),           -- goals, health, injuries
  parq_answers jsonb not null check (jsonb_typeof(parq_answers) = 'object'),      -- PAR-Q: {q1: bool, ...}
  -- Computed, so the client cannot under-report it.
  parq_flagged boolean not null generated always as (private.parq_any_yes(parq_answers)) stored,
  submitted_at timestamptz not null default now()
);

comment on table public.intakes is 'One submitted version of a client intake form (goals, health, PAR-Q).';
comment on column public.intakes.parq_flagged is 'At least one PAR-Q answer is yes; computed by the database. The trainer sees a warning.';

create index intakes_user_id_submitted_at_idx on public.intakes (user_id, submitted_at desc);

alter table public.intakes enable row level security;
revoke all on table public.intakes from anon, authenticated;

-- contact_requests: "Ask to get in touch" (Q39).
create table public.contact_requests (
  id           uuid primary key default gen_random_uuid(),
  coaching_id  uuid not null references public.coachings (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status       public.contact_request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  updated_at   timestamptz not null default now(),
  constraint contact_requests_not_self_check check (requester_id <> recipient_id),
  constraint contact_requests_responded_check check ((status in ('accepted', 'declined')) = (responded_at is not null))
);

comment on table public.contact_requests is
  'A request from one side of a pair to share Telegram contacts with the other. Written only by RPCs.';
comment on column public.contact_requests.status is
  'expired is set by the RPC or dispatcher for pending requests older than 7 days; there is no database rule.';

create index contact_requests_recipient_id_status_idx on public.contact_requests (recipient_id, status);
create index contact_requests_requester_id_recipient_id_created_at_idx
  on public.contact_requests (requester_id, recipient_id, created_at desc);
create index contact_requests_coaching_id_idx on public.contact_requests (coaching_id);

create trigger contact_requests_set_updated_at
  before update on public.contact_requests
  for each row execute function public.set_updated_at();

alter table public.contact_requests enable row level security;
revoke all on table public.contact_requests from anon, authenticated;

-- BEFORE INSERT trigger for pair-scoped money and booking tables (passes, payments, bookings, ledger_entries):
-- a caller may give only coaching_id. Supplied values are kept; the composite foreign key then checks them.
-- Definer: the pair row may be hidden from the caller by RLS.
create function private.fill_pair_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_client_id uuid;
begin
  if new.trainer_id is null or new.client_id is null then
    select c.trainer_id, c.client_id into v_trainer_id, v_client_id
    from public.coachings c
    where c.id = new.coaching_id;
    new.trainer_id := coalesce(new.trainer_id, v_trainer_id);
    new.client_id := coalesce(new.client_id, v_client_id);
  end if;
  return new;
end $$;

comment on function private.fill_pair_columns() is
  'Trigger: fills trainer_id and client_id from the pair when the insert leaves them null.';
revoke all on function private.fill_pair_columns() from public;

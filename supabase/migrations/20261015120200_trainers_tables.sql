-- Trainers (data-model §2.1 "Тренер, инвайты, верификация" and client links): trainer_invites, trainer_profiles,
-- trainer_certificates, trainer_verifications, client_invites, trial_links. Policies: 20261015123100_trainers_policies.sql.

-- Token generators. They are column defaults, so trainers cannot choose their own tokens or codes.

-- 16 random bytes as base64url without padding: 22 characters (Postgres 17 has no base64url encoding).
create function private.gen_link_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
$$;

comment on function private.gen_link_token() is 'Random 22-character base64url token for client invite and trial links.';
revoke all on function private.gen_link_token() from public;
grant execute on function private.gen_link_token() to authenticated, service_role;

-- Definer, because the caller's RLS hides other trainers' codes and the code must be unique across all of them.
-- The alphabet has 32 characters (no 0, O, 1, I), so a random byte modulo 32 is uniform.
create function private.gen_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(c_alphabet, get_byte(v_bytes, i) % 32 + 1, 1);
    end loop;
    exit when not exists (select 1 from public.client_invites ci where ci.code = v_code);
  end loop;
  return v_code;
end $$;

comment on function private.gen_invite_code() is
  'Random 6-character trainer code without look-alike characters, not used by any client invite yet.';
revoke all on function private.gen_invite_code() from public;
grant execute on function private.gen_invite_code() to authenticated, service_role;

-- trainer_invites: the code gives a privilege, so only its hash is stored.
create table public.trainer_invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   bytea not null unique check (octet_length(code_hash) = 32),   -- sha256 of the code; the code is shown once
  code_hint   text not null check (char_length(code_hint) between 1 and 8), -- last characters, for search in the admin panel
  note        text check (char_length(note) <= 200),                        -- who it was given to
  created_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz default now() + interval '14 days',
  redeemed_by uuid unique references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- The data model pairs redeemed_by and redeemed_at both ways. redeemed_by is cleared when the redeeming
  -- account is deleted, and the strict pair check would then block that deletion, so only one direction is
  -- enforced: a redeemer always has a redemption time; a time without a redeemer means the account is gone.
  constraint trainer_invites_redeemed_check check (redeemed_by is null or redeemed_at is not null),
  constraint trainer_invites_redeemed_or_revoked_check check (redeemed_at is null or revoked_at is null)
);

comment on table public.trainer_invites is
  'Invite that lets a user become a trainer. Created and revoked by admin RPCs, redeemed by an RPC.';
comment on column public.trainer_invites.code_hash is 'sha256 of the invite code. Never granted to signed-in users.';

alter table public.trainer_invites enable row level security;
revoke all on table public.trainer_invites from anon, authenticated;

-- trainer_profiles: having a row makes the user a trainer, whatever the verification status (decisions Q55).
create table public.trainer_profiles (
  user_id                         uuid primary key references public.profiles (id) on delete cascade,
  slug                            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,31}$'),  -- showcase address
  headline                        text check (char_length(headline) <= 120),
  bio                             text check (char_length(bio) <= 2000),
  specialties                     text[] not null default '{}',
  city                            text,
  works_offline                   boolean not null default true,
  works_online                    boolean not null default false,
  is_public                       boolean not null default true,
  verification_status             public.verification_status not null default 'not_submitted',
  verified_at                     timestamptz,
  default_currency                public.currency_code not null default 'RUB',
  cancellation_deadline_hours     smallint not null default 24 check (cancellation_deadline_hours between 0 and 168),
  default_client_reminder_offsets smallint[] not null default '{1440,60}'
                                  check (private.valid_reminder_offsets(default_client_reminder_offsets)),
  min_booking_notice_minutes      smallint not null default 120 check (min_booking_notice_minutes between 0 and 10080),
  trainer_invite_id               uuid unique references public.trainer_invites (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint trainer_profiles_verified_at_check check (verified_at is null or verification_status = 'verified')
);

comment on table public.trainer_profiles is
  'Trainer side of an account: showcase data and scheduling defaults. Deleting the row removes every pair, pass, '
  'payment and ledger row of the trainer, so only account deletion does it; taking trainer status away never does.';
comment on column public.trainer_profiles.is_public is
  'Showcase reachable by link/QR; verification does not affect it (decisions Q55).';
comment on column public.trainer_profiles.verification_status is
  'Current verification state, synced from trainer_verifications. not_submitted until documents are sent.';
comment on column public.trainer_profiles.cancellation_deadline_hours is 'Free cancellation until this many hours before a session; applies to all clients.';
comment on column public.trainer_profiles.default_client_reminder_offsets is 'Minutes before a session; copied to each new pair.';
comment on column public.trainer_profiles.min_booking_notice_minutes is 'Clients cannot book a slot that starts sooner than this many minutes from now.';
comment on column public.trainer_profiles.trainer_invite_id is 'Invite the trainer joined with; set by the redeem RPC.';

create trigger trainer_profiles_set_updated_at
  before update on public.trainer_profiles
  for each row execute function public.set_updated_at();

alter table public.trainer_profiles enable row level security;
revoke all on table public.trainer_profiles from anon, authenticated;

-- trainer_certificates: files in bucket certificates, at most 5 per trainer (PRD 2.2-4).
create table public.trainer_certificates (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainer_profiles (user_id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  issuer       text,
  issued_on    date,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint trainer_certificates_storage_path_check check (split_part(storage_path, '/', 1) = trainer_id::text)
);

comment on table public.trainer_certificates is 'A certificate or diploma a trainer uploaded for verification.';
comment on column public.trainer_certificates.storage_path is
  'Object name inside bucket certificates, starting with the trainer id folder (no bucket prefix).';

create index trainer_certificates_trainer_id_idx on public.trainer_certificates (trainer_id);

create trigger trainer_certificates_set_updated_at
  before update on public.trainer_certificates
  for each row execute function public.set_updated_at();

-- Definer: it counts every row of the trainer whatever RLS shows, and locks the profile so that two
-- parallel uploads cannot both pass the count. FOR NO KEY UPDATE, not FOR UPDATE: it still serializes the
-- uploads, but does not wait for every insert elsewhere that holds the profile row's FK KEY SHARE lock.
-- The lock-then-count only works in READ COMMITTED (or SERIALIZABLE): under REPEATABLE READ the count would use
-- the old snapshot, so that isolation level is refused.
create function private.trainer_certificates_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'unsupported_isolation' using errcode = 'P0001',
      detail = 'certificates are added in read committed or serializable transactions';
  end if;
  perform 1 from public.trainer_profiles t where t.user_id = new.trainer_id for no key update;
  if (select count(*) from public.trainer_certificates c where c.trainer_id = new.trainer_id) >= 5 then
    raise exception 'certificate_limit' using errcode = 'P0001',
      detail = 'a trainer keeps at most 5 certificates';
  end if;
  return new;
end $$;

comment on function private.trainer_certificates_limit() is 'Trigger: refuses a 6th certificate for the same trainer.';
revoke all on function private.trainer_certificates_limit() from public;

create trigger trainer_certificates_limit
  before insert on public.trainer_certificates
  for each row execute function private.trainer_certificates_limit();

alter table public.trainer_certificates enable row level security;
revoke all on table public.trainer_certificates from anon, authenticated;

-- trainer_verifications: history of decisions, append-only. The current state lives in trainer_profiles.
create table public.trainer_verifications (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles (user_id) on delete cascade,
  decision   public.verification_status not null check (decision <> 'not_submitted'),  -- pending = documents (re)submitted
  reason     text check (char_length(reason) <= 1000),                                  -- required for rejected
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trainer_verifications_rejected_reason_check check (decision <> 'rejected' or reason is not null)
);

comment on table public.trainer_verifications is
  'One verification event of a trainer (submission or admin decision). Append-only; written by RPCs.';

create index trainer_verifications_trainer_id_created_at_idx on public.trainer_verifications (trainer_id, created_at desc);

create trigger trainer_verifications_append_only
  before update or delete on public.trainer_verifications
  for each row execute function private.enforce_append_only('{}', '{decided_by}', 'true');

create trigger trainer_verifications_no_truncate
  before truncate on public.trainer_verifications
  for each statement execute function private.forbid_truncate();

-- Definer: the trainer has no UPDATE grant on these columns.
create function private.trainer_verifications_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trainer_profiles t
  set verification_status = new.decision,
      verified_at = case when new.decision = 'verified' then new.created_at end
  where t.user_id = new.trainer_id;
  return null;
end $$;

comment on function private.trainer_verifications_sync_status() is
  'Trigger: copies the latest verification decision into trainer_profiles.';
revoke all on function private.trainer_verifications_sync_status() from public;

create trigger trainer_verifications_sync_status
  after insert on public.trainer_verifications
  for each row execute function private.trainer_verifications_sync_status();

alter table public.trainer_verifications enable row level security;
revoke all on table public.trainer_verifications from anon, authenticated;

-- An archived link stays archived (SHOP-3). Shared by client_invites and trial_links.
create function private.keep_archived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'archived' using errcode = 'P0001',
      detail = pg_catalog.format('archived rows of %I.%I cannot be restored', tg_table_schema, tg_table_name);
  end if;
  return new;
end $$;

comment on function private.keep_archived() is 'Trigger: once archived_at is set it cannot be changed or cleared.';
revoke all on function private.keep_archived() from public;

-- client_invites: links and codes that make a user the trainer's client. Tokens are addresses, not secrets.
create table public.client_invites (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  token       text not null unique default private.gen_link_token() check (token ~ '^[A-Za-z0-9_-]{22}$'),
  code        text not null unique default private.gen_invite_code() check (code ~ '^[A-Z0-9]{6}$'),
  label       text check (char_length(label) <= 64),
  max_uses    integer check (max_uses > 0),
  uses_count  integer not null default 0,
  expires_at  timestamptz,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint client_invites_uses_check check (uses_count >= 0 and (max_uses is null or uses_count <= max_uses)),
  constraint client_invites_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.client_invites is 'A trainer link or code (QR, "enter the trainer code") that makes a user their client.';
comment on column public.client_invites.token is 'Link token (startapp parameter), generated by the database.';
comment on column public.client_invites.code is 'Six-character trainer code, generated by the database.';
comment on column public.client_invites.uses_count is 'How many clients joined with it; counted by the join RPC.';

create index client_invites_trainer_id_idx on public.client_invites (trainer_id);

create trigger client_invites_keep_archived
  before update of archived_at on public.client_invites
  for each row execute function private.keep_archived();

alter table public.client_invites enable row level security;
revoke all on table public.client_invites from anon, authenticated;

-- trial_links: a link to book a trial session with the trainer.
create table public.trial_links (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainer_profiles (user_id) on delete cascade,
  token        text not null unique default private.gen_link_token() check (token ~ '^[A-Za-z0-9_-]{22}$'),
  title        text not null check (char_length(title) between 1 and 120),
  description  text check (char_length(description) <= 2000),
  duration_min smallint not null default 60 check (duration_min between 15 and 240),
  price_minor  bigint not null default 0 check (price_minor >= 0),  -- 0 = free trial
  currency     public.currency_code not null,
  location_id  uuid,                                                 -- FK added with locations; null = any slot location
  mode         public.session_mode,                                  -- null = as in the slot
  max_uses     integer check (max_uses > 0),
  uses_count   integer not null default 0,
  expires_at   timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint trial_links_uses_check check (uses_count >= 0 and (max_uses is null or uses_count <= max_uses)),
  constraint trial_links_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.trial_links is 'A trainer link for booking a trial session, with its length and price.';
comment on column public.trial_links.token is 'Link token, generated by the database.';
comment on column public.trial_links.price_minor is 'Price in minor units of currency; 0 = free.';
comment on column public.trial_links.duration_min is 'Trial session length in minutes.';

create index trial_links_trainer_id_idx on public.trial_links (trainer_id);

create trigger trial_links_keep_archived
  before update of archived_at on public.trial_links
  for each row execute function private.keep_archived();

alter table public.trial_links enable row level security;
revoke all on table public.trial_links from anon, authenticated;

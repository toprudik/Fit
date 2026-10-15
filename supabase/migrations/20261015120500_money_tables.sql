-- Money (data-model §2.1 "Деньги"): packages, passes, pass_freezes, payments, payment_links. The ledger and
-- the pass delete guard come with bookings in 20261015120600_bookings_ledger_tables.sql.
-- Policies: 20261015123400_money_policies.sql.

-- packages: what the trainer sells; the set of live packages is the price grid.
create table public.packages (
  id               uuid primary key default gen_random_uuid(),
  trainer_id       uuid not null references public.trainer_profiles (user_id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 120),
  sessions_count   smallint not null check (sessions_count between 1 and 200),  -- 1 = drop-in session
  price_minor      bigint not null check (price_minor >= 0),
  currency         public.currency_code not null,
  validity_days    smallint check (validity_days between 1 and 730),            -- null = no expiry
  applies_to       public.package_applies_to not null default 'any',
  is_public        boolean not null default true,                               -- shown in the showcase grid
  sort_order       smallint not null default 0,
  price_updated_at timestamptz not null default now(),                          -- hint "prices unchanged for 12 months" (W2)
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Target of the composite foreign key from passes.
  constraint packages_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.packages is 'A pack of sessions a trainer sells; archived instead of deleted.';
comment on column public.packages.price_minor is 'Price of the whole pack in minor units of currency.';
comment on column public.packages.validity_days is 'Days a pass from this pack is valid; null = no expiry.';
comment on column public.packages.price_updated_at is 'Last change of price_minor or sessions_count; set by a trigger.';

create index packages_trainer_id_idx on public.packages (trainer_id) where archived_at is null;
-- One drop-in price per currency and session type among live packages.
create unique index packages_one_drop_in on public.packages (trainer_id, currency, applies_to)
  where sessions_count = 1 and archived_at is null;

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

create function private.packages_touch_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price_minor is distinct from old.price_minor or new.sessions_count is distinct from old.sessions_count then
    new.price_updated_at := now();
  end if;
  return new;
end $$;

comment on function private.packages_touch_price() is 'Trigger: stamps price_updated_at when the price or the session count changes.';
revoke all on function private.packages_touch_price() from public;

create trigger packages_touch_price
  before update of price_minor, sessions_count on public.packages
  for each row execute function private.packages_touch_price();

alter table public.packages enable row level security;
revoke all on table public.packages from anon, authenticated;

-- passes: a pack sold to the client of a pair. The balance is not stored: it is the sum of the ledger.
create table public.passes (
  id             uuid primary key default gen_random_uuid(),
  coaching_id    uuid not null,
  -- NO ACTION: the account deletion job moves the pair to the stub, and the pair key cascades the new id here.
  client_id      uuid not null references public.profiles (id),
  trainer_id     uuid not null references public.trainer_profiles (user_id) on delete cascade,
  package_id     uuid,
  title          text not null check (char_length(title) between 1 and 120),  -- snapshot
  sessions_total smallint not null check (sessions_total between 1 and 200),  -- snapshot; the balance is in the ledger
  price_minor    bigint not null check (price_minor >= 0),
  currency       public.currency_code not null,
  applies_to     public.package_applies_to not null default 'any',
  is_drop_in     boolean not null default false,                             -- drop-in session = pass of 1
  starts_on      date not null,                                              -- sale date in the trainer time zone
  expires_at     timestamptz,                                                -- base expiry without freezes; null = none
  status         public.pass_status not null default 'active',
  cancelled_at   timestamptz,
  cancel_reason  text check (char_length(cancel_reason) <= 500),
  note           text check (char_length(note) <= 500),
  sold_by        uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint passes_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint passes_drop_in_check check (not is_drop_in or sessions_total = 1),
  -- The pass belongs to exactly this pair, trainer and client; a client id change on the pair cascades here.
  constraint passes_pair_fkey foreign key (coaching_id, trainer_id, client_id)
    references public.coachings (id, trainer_id, client_id)
    on update cascade on delete cascade deferrable initially immediate,
  constraint passes_package_fkey foreign key (package_id, trainer_id)
    references public.packages (id, trainer_id) on delete set null (package_id),
  -- Target of the composite foreign keys from bookings, ledger_entries and payments.
  constraint passes_id_coaching_id_key unique (id, coaching_id)
);

comment on table public.passes is
  'A pass (pack of sessions) sold to the client of a pair. Created by an RPC; its balance is the ledger sum.';
comment on column public.passes.price_minor is 'Price in minor units of currency (snapshot of the package).';
comment on column public.passes.expires_at is
  'Exclusive end instant without freezes: start of the day after the last valid day in the trainer time zone.';
comment on column public.passes.sold_by is 'Who created the pass; stamped from the signed-in caller.';

create index passes_coaching_id_idx on public.passes (coaching_id);
create index passes_client_id_idx on public.passes (client_id);
create index passes_trainer_id_created_at_idx on public.passes (trainer_id, created_at);
create index passes_package_id_idx on public.passes (package_id);

create trigger passes_fill_pair
  before insert on public.passes
  for each row execute function private.fill_pair_columns();

create trigger passes_set_updated_at
  before update on public.passes
  for each row execute function public.set_updated_at();

create trigger passes_stamp_sold_by
  before insert on public.passes
  for each row execute function private.stamp_actor('sold_by');

alter table public.passes enable row level security;
revoke all on table public.passes from anon, authenticated;

-- pass_freezes: days a pass is paused; each frozen day moves the expiry by one day.
create table public.pass_freezes (
  id         uuid primary key default gen_random_uuid(),
  pass_id    uuid not null references public.passes (id) on delete cascade,
  period     daterange not null check (not isempty(period) and lower_inc(period) and not upper_inf(period)),
  reason     text check (char_length(reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Its gist index also serves lookups and the cascade by pass_id.
  constraint pass_freezes_no_overlap_excl exclude using gist (pass_id with =, period with &&)
);

comment on table public.pass_freezes is 'A freeze of a pass over local dates of the trainer time zone.';
comment on column public.pass_freezes.period is 'Frozen local dates, [first, day after last); always bounded.';
comment on column public.pass_freezes.created_by is 'Who added the freeze; stamped from the signed-in caller.';

create trigger pass_freezes_set_updated_at
  before update on public.pass_freezes
  for each row execute function public.set_updated_at();

create trigger pass_freezes_stamp_created_by
  before insert on public.pass_freezes
  for each row execute function private.stamp_actor('created_by');

alter table public.pass_freezes enable row level security;
revoke all on table public.pass_freezes from anon, authenticated;

-- payments: money the client paid (or got back). Mistakes are voided and entered again, never deleted (R26).
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  coaching_id  uuid not null,
  client_id    uuid not null references public.profiles (id),                -- NO ACTION, as on passes
  trainer_id   uuid not null references public.trainer_profiles (user_id) on delete cascade,
  pass_id      uuid,                                                         -- which pass it pays; null = on account
  direction    public.payment_direction not null default 'in',
  amount_minor bigint not null check (amount_minor > 0),
  currency     public.currency_code not null,
  method       public.payment_method not null,
  paid_at      timestamptz not null,                                         -- income (W2) is counted by this date
  status       public.payment_status not null,
  reported_by  uuid references public.profiles (id) on delete set null,      -- the client who said "I paid"
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  voided_at    timestamptz,
  void_reason  text check (char_length(void_reason) <= 500),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payments_voided_check check ((status = 'voided') = (voided_at is not null)),
  constraint payments_confirmed_check check (status <> 'confirmed' or confirmed_at is not null),
  constraint payments_voided_reason_check check (status <> 'voided' or void_reason is not null),
  constraint payments_pair_fkey foreign key (coaching_id, trainer_id, client_id)
    references public.coachings (id, trainer_id, client_id)
    on update cascade on delete cascade deferrable initially immediate,
  constraint payments_pass_fkey foreign key (pass_id, coaching_id)
    references public.passes (id, coaching_id) on delete set null (pass_id) deferrable initially immediate
);

comment on table public.payments is
  'A payment between the client and the trainer of a pair, reported by the client or entered by the trainer.';
comment on column public.payments.amount_minor is 'Amount in minor units of currency; always positive, direction gives the sign.';
comment on column public.payments.reported_by is 'Stamped from the signed-in caller when the row is inserted as reported.';
comment on column public.payments.confirmed_by is 'Stamped from the signed-in caller when the payment is confirmed.';

create index payments_coaching_id_paid_at_idx on public.payments (coaching_id, paid_at);
create index payments_trainer_id_paid_at_idx on public.payments (trainer_id, paid_at) where status = 'confirmed';
create index payments_pass_id_idx on public.payments (pass_id);
create index payments_client_id_idx on public.payments (client_id);

-- Definer: the pass may be hidden from the caller by RLS. The pass is looked up within the pair only, so a
-- pass of another pair is left to the foreign key (23503) and its currency is never revealed.
create function private.payments_check_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency public.currency_code;
begin
  if new.pass_id is not null then
    select p.currency into v_currency
    from public.passes p
    where p.id = new.pass_id and p.coaching_id = new.coaching_id;
    if found and v_currency is distinct from new.currency then
      raise exception 'currency_mismatch' using errcode = 'P0001',
        detail = 'a payment for a pass must be in the pass currency';
    end if;
  end if;
  return new;
end $$;

comment on function private.payments_check_currency() is 'Trigger: a payment tied to a pass must use the pass currency.';
revoke all on function private.payments_check_currency() from public;

create trigger payments_check_currency
  before insert or update of pass_id, currency on public.payments
  for each row execute function private.payments_check_currency();

create trigger payments_fill_pair
  before insert on public.payments
  for each row execute function private.fill_pair_columns();

-- Lifecycle for every role (R93). Insert as reported or confirmed; then reported -> confirmed | voided and
-- confirmed -> voided. voided is final. An update that keeps the status is not a transition.
-- Invoker: it only stamps and checks the row itself.
create function private.payments_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'reported' then
      new.reported_by := coalesce(auth.uid(), new.reported_by);
    elsif new.status = 'confirmed' then
      new.confirmed_by := coalesce(auth.uid(), new.confirmed_by);
      new.confirmed_at := coalesce(new.confirmed_at, now());
    else
      raise exception 'invalid_transition' using errcode = 'P0001',
        detail = pg_catalog.format('payments: cannot be created as %s', new.status);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'reported' and new.status = 'confirmed' then
    new.confirmed_by := coalesce(auth.uid(), new.confirmed_by);
    new.confirmed_at := now();
  elsif old.status in ('reported', 'confirmed') and new.status = 'voided' then
    new.voided_at := now();
  else
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = pg_catalog.format('payments: %s -> %s is not allowed', old.status, new.status);
  end if;
  return new;
end $$;

comment on function private.payments_lifecycle() is
  'Trigger: payment status machine (reported -> confirmed | voided, confirmed -> voided) with author and time stamps.';
revoke all on function private.payments_lifecycle() from public;

create trigger payments_lifecycle
  before insert or update of status on public.payments
  for each row execute function private.payments_lifecycle();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;

-- payment_links: where the client can pay the trainer (SBP, self-employed page, bank).
create table public.payment_links (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 64),
  url         text not null check (url ~ '^https://'),
  kind        public.payment_link_kind not null default 'other',
  sort_order  smallint not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.payment_links is 'A link where the trainer takes payments; shown to the trainer clients.';

create index payment_links_trainer_id_idx on public.payment_links (trainer_id) where archived_at is null;

create trigger payment_links_set_updated_at
  before update on public.payment_links
  for each row execute function public.set_updated_at();

alter table public.payment_links enable row level security;
revoke all on table public.payment_links from anon, authenticated;

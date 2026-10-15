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

create index packages_trainer_id_idx on public.packages (trainer_id);
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
  cancelled_by   uuid references public.profiles (id) on delete set null,
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
comment on column public.passes.cancelled_by is 'Who cancelled the pass; stamped from the signed-in caller on cancel.';

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

-- The cancel_pass RPC runs with the caller's claims, so the canceller is stamped like the seller.
create function private.passes_stamp_cancelled_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_by := coalesce(auth.uid(), new.cancelled_by);
  end if;
  return new;
end $$;

comment on function private.passes_stamp_cancelled_by() is
  'Trigger: writes auth.uid() into cancelled_by when a pass is cancelled by a signed-in caller.';
revoke all on function private.passes_stamp_cancelled_by() from public;

create trigger passes_stamp_cancelled_by
  before update of status on public.passes
  for each row execute function private.passes_stamp_cancelled_by();

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
  voided_by    uuid references public.profiles (id) on delete set null,
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
comment on column public.payments.voided_by is
  'Stamped from the signed-in caller when the payment is voided: the trainer, or the client withdrawing a report.';

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
    new.voided_by := coalesce(auth.uid(), new.voided_by);
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

create index payment_links_trainer_id_idx on public.payment_links (trainer_id);

create trigger payment_links_set_updated_at
  before update on public.payment_links
  for each row execute function public.set_updated_at();

alter table public.payment_links enable row level security;
revoke all on table public.payment_links from anon, authenticated;

-- money_events: who changed a pass, a freeze or a payment, when, what and why (PRD line 27, decisions Q21
-- «История с причинами», PRD 2.8-13). Bookings have booking_events and the ledger is its own history; passes,
-- freezes and payments are written directly by users too, so BEFORE triggers on them fill this table for every writer.
-- Append-only. pass_id, payment_id and freeze_id carry no foreign key: the history outlives a deleted pass or
-- freeze. client_id and coaching_id move with the pair (account deletion, card merge), like the ledger (R28).
create table public.money_events (
  id          bigint generated always as identity primary key,
  coaching_id uuid not null,
  client_id   uuid not null references public.profiles (id),               -- NO ACTION, as on passes
  trainer_id  uuid not null,
  pass_id     uuid,
  payment_id  uuid,
  freeze_id   uuid,
  action      public.money_event_action not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  public.actor_role not null,
  reason      text check (char_length(reason) <= 500),
  old_values  jsonb check (old_values is null or jsonb_typeof(old_values) = 'object'),
  new_values  jsonb check (new_values is null or jsonb_typeof(new_values) = 'object'),
  created_at  timestamptz not null default now(),
  constraint money_events_subject_check check (
    case
      when action in ('pass_created', 'pass_changed', 'pass_cancelled', 'pass_deleted')
        then pass_id is not null and payment_id is null and freeze_id is null
      when action in ('freeze_added', 'freeze_changed', 'freeze_removed')
        then pass_id is not null and freeze_id is not null and payment_id is null
      else payment_id is not null and freeze_id is null
    end),
  constraint money_events_pair_fkey foreign key (coaching_id, trainer_id, client_id)
    references public.coachings (id, trainer_id, client_id)
    on update cascade on delete cascade deferrable initially immediate
);

comment on table public.money_events is
  'One change of a pass, a freeze or a payment with its actor and reason. Append-only; written only by the '
  'triggers on passes, pass_freezes and payments.';
comment on column public.money_events.pass_id is 'Pass the change belongs to (also for a freeze, and a payment for a pass); no FK.';
comment on column public.money_events.payment_id is 'Payment the change belongs to; no FK.';
comment on column public.money_events.freeze_id is 'Freeze the change belongs to; no FK, so a removed freeze keeps its history.';
comment on column public.money_events.actor_id is 'Who made the change: auth.uid() at the time; null for server jobs.';
comment on column public.money_events.reason is
  'Why: the setting fit.change_reason of the writing transaction (RPCs set it), else the void, cancel or '
  'freeze reason of the row.';
comment on column public.money_events.old_values is 'Changed columns before the change (the whole row for a removal).';
comment on column public.money_events.new_values is 'Changed columns after the change (the whole row for a creation).';

create index money_events_coaching_id_created_at_idx on public.money_events (coaching_id, created_at);
create index money_events_client_id_idx on public.money_events (client_id);
create index money_events_pass_id_idx on public.money_events (pass_id) where pass_id is not null;
create index money_events_payment_id_idx on public.money_events (payment_id) where payment_id is not null;
create index money_events_actor_id_idx on public.money_events (actor_id) where actor_id is not null;

create trigger money_events_append_only
  before update or delete on public.money_events
  for each row execute function private.enforce_append_only('{client_id,coaching_id}', '{actor_id}', 'true');

create trigger money_events_no_truncate
  before truncate on public.money_events
  for each statement execute function private.forbid_truncate();

alter table public.money_events enable row level security;
revoke all on table public.money_events from anon, authenticated;
revoke all on sequence public.money_events_id_seq from anon, authenticated;

-- Writes one money_events row for a change of a pass, freeze or payment. BEFORE, not AFTER: the BEFORE triggers
-- of a cascade run at pg_trigger_depth() > 1, while its AFTER triggers are queued to the outer statement (depth
-- 1), so only BEFORE can skip cascades (a pair or trainer deletion, a pair moving to another client), which are
-- not user actions; a pair delete would remove the rows anyway. The trigger names sort after the stamping
-- triggers, so the row is recorded as it will be stored (an error later in the statement rolls the event back
-- too). A pass expiry changes only with a reason (fit.change_reason), for every role, because it moves what the
-- client paid for (PRD 2.8-8). Definer: nobody may write money_events directly.
create function private.money_events_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb := case when tg_op in ('UPDATE', 'DELETE') then pg_catalog.to_jsonb(old) end;
  v_new       jsonb := case when tg_op in ('INSERT', 'UPDATE') then pg_catalog.to_jsonb(new) end;
  v_row       jsonb := coalesce(v_new, v_old);
  v_uid       uuid := auth.uid();
  v_reason    text := nullif(pg_catalog.current_setting('fit.change_reason', true), '');
  v_pass      public.passes;
  v_action    public.money_event_action;
  v_changed   text[];
  v_old_vals  jsonb;
  v_new_vals  jsonb;
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(pg_catalog.array_agg(k.key), '{}') into v_changed
    from pg_catalog.jsonb_each(v_new) k
    where k.key <> 'updated_at' and k.value is distinct from (v_old -> k.key);
    if pg_catalog.cardinality(v_changed) = 0 then
      return new;
    end if;
    select pg_catalog.jsonb_object_agg(c, v_old -> c), pg_catalog.jsonb_object_agg(c, v_new -> c)
    into v_old_vals, v_new_vals
    from pg_catalog.unnest(v_changed) c;
  else
    v_old_vals := v_old;
    v_new_vals := v_new;
  end if;

  if tg_table_name = 'passes' then
    v_action := case tg_op
      when 'INSERT' then 'pass_created'
      when 'DELETE' then 'pass_deleted'
      else case when new.status = 'cancelled' and old.status <> 'cancelled' then 'pass_cancelled' else 'pass_changed' end
    end;
    if tg_op = 'UPDATE' and new.expires_at is distinct from old.expires_at and v_reason is null then
      raise exception 'reason_required' using errcode = 'P0001',
        detail = 'the expiry of a pass changes only with a reason (fit.change_reason)';
    end if;
    v_reason := coalesce(v_reason, case when v_action = 'pass_cancelled' then v_row ->> 'cancel_reason' end);
    insert into public.money_events (coaching_id, client_id, trainer_id, pass_id, action, actor_id, actor_role,
                                     reason, old_values, new_values)
    values ((v_row ->> 'coaching_id')::uuid, (v_row ->> 'client_id')::uuid, (v_row ->> 'trainer_id')::uuid,
            (v_row ->> 'id')::uuid, v_action, v_uid,
            private.money_actor_role(v_uid, (v_row ->> 'trainer_id')::uuid, (v_row ->> 'client_id')::uuid),
            v_reason, v_old_vals, v_new_vals);

  elsif tg_table_name = 'pass_freezes' then
    select * into v_pass from public.passes p where p.id = (v_row ->> 'pass_id')::uuid;
    if not found then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    v_action := case tg_op when 'INSERT' then 'freeze_added' when 'DELETE' then 'freeze_removed' else 'freeze_changed' end;
    insert into public.money_events (coaching_id, client_id, trainer_id, pass_id, freeze_id, action, actor_id,
                                     actor_role, reason, old_values, new_values)
    values (v_pass.coaching_id, v_pass.client_id, v_pass.trainer_id, v_pass.id, (v_row ->> 'id')::uuid, v_action,
            v_uid, private.money_actor_role(v_uid, v_pass.trainer_id, v_pass.client_id),
            coalesce(v_reason, v_row ->> 'reason'), v_old_vals, v_new_vals);

  else
    v_action := case tg_op
      when 'INSERT' then 'payment_created'
      else case
        when new.status = 'voided' and old.status <> 'voided' then 'payment_voided'
        when new.status = 'confirmed' and old.status <> 'confirmed' then 'payment_confirmed'
        else 'payment_changed'
      end
    end;
    v_reason := coalesce(v_reason, case when v_action = 'payment_voided' then v_row ->> 'void_reason' end);
    insert into public.money_events (coaching_id, client_id, trainer_id, pass_id, payment_id, action, actor_id,
                                     actor_role, reason, old_values, new_values)
    values ((v_row ->> 'coaching_id')::uuid, (v_row ->> 'client_id')::uuid, (v_row ->> 'trainer_id')::uuid,
            (v_row ->> 'pass_id')::uuid, (v_row ->> 'id')::uuid, v_action, v_uid,
            private.money_actor_role(v_uid, (v_row ->> 'trainer_id')::uuid, (v_row ->> 'client_id')::uuid),
            v_reason, v_old_vals, v_new_vals);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

comment on function private.money_events_record() is
  'Trigger: writes a money_events row for every direct change of a pass, freeze or payment; a pass expiry '
  'needs a reason.';
revoke all on function private.money_events_record() from public;

-- The role of the actor in the pair, for money_events.actor_role.
create function private.money_actor_role(p_actor uuid, p_trainer uuid, p_client uuid)
returns public.actor_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor is null then 'system'
    when p_actor = p_trainer then 'trainer'
    when p_actor = p_client then 'client'
    when exists (select 1 from public.user_roles r where r.user_id = p_actor and r.role = 'admin') then 'admin'
    else 'delegate'
  end::public.actor_role
$$;

comment on function private.money_actor_role(uuid, uuid, uuid) is
  'The actor_role of a money change: system without a caller, trainer or client of the pair, admin, else delegate.';
revoke all on function private.money_actor_role(uuid, uuid, uuid) from public;

-- "write_money_event" sorts after every other BEFORE trigger of these tables (fill, guard, lifecycle, set,
-- stamp), so the stamps (sold_by, cancelled_by, voided_by, voided_at) are already in the row.
create trigger passes_write_money_event
  before insert or update or delete on public.passes
  for each row execute function private.money_events_record();

create trigger pass_freezes_write_money_event
  before insert or update or delete on public.pass_freezes
  for each row execute function private.money_events_record();

create trigger payments_write_money_event
  before insert or update or delete on public.payments
  for each row execute function private.money_events_record();

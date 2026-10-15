-- Bookings and the ledger (data-model §2.1 "Записи", "Журнал списаний" and §3): bookings, booking_events,
-- ledger_entries, the booking status machine, seat capacity checks and the pass delete guard.
-- Policies: 20261015123500_bookings_ledger_policies.sql.

-- bookings: one client of a pair on one session. Written only by RPCs and jobs.
create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null,
  coaching_id          uuid not null,
  client_id            uuid not null references public.profiles (id),             -- NO ACTION, as on passes
  trainer_id           uuid not null references public.trainer_profiles (user_id) on delete cascade,
  status               public.booking_status not null,
  source               public.booking_source not null,
  reserved_pass_id     uuid,                                                      -- pass the booking was confirmed against (hint)
  requested_at         timestamptz,
  confirmed_at         timestamptz,
  decided_by           uuid references public.profiles (id) on delete set null,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles (id) on delete set null,
  cancelled_by_role    public.actor_role,
  cancel_reason        text check (char_length(cancel_reason) <= 500),
  rescheduled_to_id    uuid,
  attendance_marked_by uuid references public.profiles (id) on delete set null,   -- null = marked automatically
  attendance_marked_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bookings_requested_check check (status <> 'requested' or requested_at is not null),
  constraint bookings_confirmed_check check (status <> 'confirmed' or confirmed_at is not null),
  constraint bookings_cancelled_check
    check (status not in ('cancelled', 'late_cancelled') or (cancelled_at is not null and cancelled_by_role is not null)),
  constraint bookings_late_cancel_check check (status <> 'late_cancelled' or cancelled_by_role = 'client'),
  constraint bookings_trainer_cancel_reason_check
    check (cancelled_by_role is distinct from 'trainer' or cancel_reason is not null),   -- PRD 2.6.5-4
  constraint bookings_not_rescheduled_to_self_check check (rescheduled_to_id <> id),
  -- No check may require rescheduled_to_id: the new booking can be removed and the column is then cleared.
  constraint bookings_pair_fkey foreign key (coaching_id, trainer_id, client_id)
    references public.coachings (id, trainer_id, client_id)
    on update cascade on delete cascade deferrable initially immediate,
  constraint bookings_session_fkey foreign key (session_id, trainer_id)
    references public.sessions (id, trainer_id) on delete cascade,
  constraint bookings_reserved_pass_fkey foreign key (reserved_pass_id, coaching_id)
    references public.passes (id, coaching_id) on delete set null (reserved_pass_id) deferrable initially immediate,
  constraint bookings_rescheduled_to_fkey foreign key (rescheduled_to_id, coaching_id)
    references public.bookings (id, coaching_id) on delete set null (rescheduled_to_id) deferrable initially immediate,
  -- Target of the composite foreign keys from ledger_entries and later tables (milestones, workout_logs).
  constraint bookings_id_coaching_id_key unique (id, coaching_id)
);

comment on table public.bookings is
  'A client of a pair booked on a session; status requested = a booking request. Written only by RPCs and jobs.';
comment on column public.bookings.reserved_pass_id is 'Pass with a free session that the booking was confirmed against; a hint, the charge picks the pass.';
comment on column public.bookings.rescheduled_to_id is 'The new booking that replaced this one (status rescheduled); cleared if it is deleted.';

-- One live booking per pair and session. Keyed on the pair, not the client: anonymized clients all point
-- to the stub and may share a group session (R29). late_cancelled still blocks a second booking.
create unique index bookings_one_live_per_pair_uniq on public.bookings (session_id, coaching_id)
  where status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled');
-- One live trial booking per pair (R39); "never twice" is enforced by the trial booking RPC.
create unique index bookings_one_trial_per_pair_uniq on public.bookings (coaching_id)
  where source = 'trial' and status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled');
create index bookings_session_id_status_idx on public.bookings (session_id, status);
create index bookings_client_id_status_idx on public.bookings (client_id, status);
create index bookings_coaching_id_created_at_idx on public.bookings (coaching_id, created_at desc);
create index bookings_trainer_id_status_idx on public.bookings (trainer_id, status) where status = 'requested';
create index bookings_reserved_pass_id_idx on public.bookings (reserved_pass_id) where reserved_pass_id is not null;
create index bookings_rescheduled_to_id_idx on public.bookings (rescheduled_to_id) where rescheduled_to_id is not null;

create trigger bookings_fill_pair
  before insert on public.bookings
  for each row execute function private.fill_pair_columns();

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- Status machine for every role (R93). An update that keeps the status is not checked, so moving a booking
-- to another pair or client passes.
create function private.bookings_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('requested', 'confirmed', 'attended') then
      raise exception 'invalid_transition' using errcode = 'P0001',
        detail = pg_catalog.format('bookings: cannot be created as %s', new.status);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if not (
       (old.status = 'requested' and new.status in ('confirmed', 'declined', 'expired', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('cancelled', 'late_cancelled', 'rescheduled', 'attended', 'no_show'))
    or (old.status = 'attended' and new.status in ('no_show', 'cancelled'))
    or (old.status = 'no_show' and new.status in ('attended', 'cancelled'))
  ) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = pg_catalog.format('bookings: %s -> %s is not allowed', old.status, new.status);
  end if;
  return new;
end $$;

comment on function private.bookings_status_transition() is
  'Trigger: booking status machine; insert as requested, confirmed or attended, then only the allowed moves.';
revoke all on function private.bookings_status_transition() from public;

create trigger bookings_status_transition
  before insert or update of status on public.bookings
  for each row execute function private.bookings_status_transition();

-- Seats (R18): requested, confirmed, attended and no_show take a seat; late_cancelled frees it.
-- AFTER, so the new row is counted. Locking the session row serializes parallel bookings of one session.
-- Definer: it counts every booking of the session, not only the ones the caller can see.
create function private.bookings_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity smallint;
  v_occupied integer;
begin
  if new.status not in ('requested', 'confirmed', 'attended', 'no_show') then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('requested', 'confirmed', 'attended', 'no_show')
     and old.session_id = new.session_id then
    return null;   -- already held a seat on this session
  end if;

  select s.capacity into v_capacity from public.sessions s where s.id = new.session_id for update;
  if not found then
    return null;   -- the foreign key reports a missing session
  end if;
  select count(*) into v_occupied
  from public.bookings b
  where b.session_id = new.session_id and b.status in ('requested', 'confirmed', 'attended', 'no_show');
  if v_occupied > v_capacity then
    raise exception 'session_full' using errcode = 'P0001',
      detail = pg_catalog.format('the session has %s seats', v_capacity);
  end if;
  return null;
end $$;

comment on function private.bookings_check_capacity() is
  'Trigger: refuses a booking that would take more seats than the session capacity.';
revoke all on function private.bookings_check_capacity() from public;

create trigger bookings_check_capacity
  after insert or update of status, session_id on public.bookings
  for each row execute function private.bookings_check_capacity();

alter table public.bookings enable row level security;
revoke all on table public.bookings from anon, authenticated;

-- A session cannot shrink below the seats already taken (PRD 2.6.3-4). The UPDATE already holds the
-- session row lock, so a parallel booking waits in bookings_check_capacity. Definer: counts every booking.
create function private.sessions_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occupied integer;
begin
  if new.capacity < old.capacity then
    select count(*) into v_occupied
    from public.bookings b
    where b.session_id = new.id and b.status in ('requested', 'confirmed', 'attended', 'no_show');
    if new.capacity < v_occupied then
      raise exception 'capacity_below_occupied' using errcode = 'P0001',
        detail = pg_catalog.format('%s seats are taken', v_occupied);
    end if;
  end if;
  return new;
end $$;

comment on function private.sessions_check_capacity() is
  'Trigger: refuses a capacity lower than the number of bookings that hold a seat.';
revoke all on function private.sessions_check_capacity() from public;

create trigger sessions_check_capacity
  before update of capacity on public.sessions
  for each row execute function private.sessions_check_capacity();

-- booking_events: why and by whom each booking changed (Q21). Append-only.
create table public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  public.actor_role not null,
  reason      text check (char_length(reason) <= 500),
  payload     jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),  -- e.g. {old_starts_at, new_starts_at}
  created_at  timestamptz not null default now()
);

comment on table public.booking_events is 'One change of a booking with its actor and reason. Append-only; written by RPCs and jobs.';
comment on column public.booking_events.payload is
  'Details of the change, for example old and new start times, or the cancellation deadline hours and deadline_at (R19).';

create index booking_events_booking_id_id_idx on public.booking_events (booking_id, id);

create trigger booking_events_append_only
  before update or delete on public.booking_events
  for each row execute function private.enforce_append_only('{}', '{actor_id}', 'true');

create trigger booking_events_no_truncate
  before truncate on public.booking_events
  for each statement execute function private.forbid_truncate();

alter table public.booking_events enable row level security;
revoke all on table public.booking_events from anon, authenticated;
revoke all on sequence public.booking_events_id_seq from anon, authenticated;

-- ledger_entries: the only source of pass balances and debt (data-model §3). Append-only: client_id and
-- coaching_id may move (account deletion, card merge), created_by may only be cleared, rows leave only
-- through FK cascades (R28).
create table public.ledger_entries (
  id               uuid primary key default gen_random_uuid(),
  coaching_id      uuid not null,
  client_id        uuid not null references public.profiles (id),                 -- NO ACTION, as on passes
  trainer_id       uuid not null references public.trainer_profiles (user_id) on delete cascade,
  entry_type       public.ledger_entry_type not null,
  pass_id          uuid,                                                          -- null on a debt charge
  booking_id       uuid,
  related_entry_id uuid,                                                          -- waiver, settlement, reversal -> charge
  sessions_delta   integer not null,
  amount_minor     bigint not null default 0,
  currency         public.currency_code,
  charge_reason    public.charge_reason,
  occurred_at      timestamptz not null,                                          -- charge: session start; else created_at
  note             text check (char_length(note) <= 500),
  created_by       uuid references public.profiles (id) on delete set null,       -- null = system
  created_at       timestamptz not null default now(),
  constraint ledger_entries_type_check check (
    case entry_type
      when 'grant' then sessions_delta > 0 and pass_id is not null
      when 'charge' then sessions_delta = -1 and charge_reason is not null
      when 'waiver' then sessions_delta = 1 and related_entry_id is not null
      when 'settlement' then sessions_delta = -1 and pass_id is not null and related_entry_id is not null
      when 'settlement_reversal' then sessions_delta = 1 and pass_id is not null and related_entry_id is not null
      when 'refund' then sessions_delta < 0 and pass_id is not null
      when 'adjustment' then sessions_delta <> 0 and note is not null and pass_id is not null
      else false
    end),
  -- Revenue sign (R84): charge and settlement earn, waiver and reversal give back, the rest carry no money.
  constraint ledger_entries_amount_sign_check check (
    case
      when entry_type in ('grant', 'refund', 'adjustment') then amount_minor = 0
      when entry_type in ('charge', 'settlement') then amount_minor >= 0
      when entry_type in ('waiver', 'settlement_reversal') then amount_minor <= 0
      else false
    end),
  constraint ledger_entries_charge_reason_check check (charge_reason is null or entry_type = 'charge'),
  constraint ledger_entries_currency_check check (amount_minor = 0 or currency is not null),
  constraint ledger_entries_charge_booking_check check (entry_type <> 'charge' or charge_reason = 'manual' or booking_id is not null),
  -- A manual charge (debt re-charge, R84) explains itself and has no booking.
  constraint ledger_entries_manual_charge_check
    check (charge_reason is distinct from 'manual' or (note is not null and booking_id is null)),
  constraint ledger_entries_pair_fkey foreign key (coaching_id, trainer_id, client_id)
    references public.coachings (id, trainer_id, client_id)
    on update cascade on delete cascade deferrable initially immediate,
  constraint ledger_entries_pass_fkey foreign key (pass_id, coaching_id)
    references public.passes (id, coaching_id) on delete cascade deferrable initially immediate,
  constraint ledger_entries_booking_fkey foreign key (booking_id, coaching_id)
    references public.bookings (id, coaching_id) on delete cascade deferrable initially immediate,
  constraint ledger_entries_related_entry_fkey foreign key (related_entry_id, coaching_id)
    references public.ledger_entries (id, coaching_id) deferrable initially immediate,
  constraint ledger_entries_id_coaching_id_key unique (id, coaching_id)
);

comment on table public.ledger_entries is
  'Append-only session ledger of a pair: grants, charges, waivers, settlements. Written only by RPCs and jobs.';
comment on column public.ledger_entries.sessions_delta is 'Change of the pass balance in sessions; the balance is the sum per pass.';
comment on column public.ledger_entries.amount_minor is
  'Money attributed to the row in minor units of currency, revenue sign: charge > 0, waiver < 0 (R84).';
comment on column public.ledger_entries.related_entry_id is
  'The charge this waiver, settlement or settlement_reversal refers to.';
comment on column public.ledger_entries.created_by is 'Who wrote the row; stamped from the signed-in caller, null = system.';

create unique index ledger_one_charge_per_booking on public.ledger_entries (booking_id) where entry_type = 'charge';
create unique index ledger_one_waiver_per_charge on public.ledger_entries (related_entry_id) where entry_type = 'waiver';
-- One settlement per charge, and one reversal per charge (R34): a reversal only follows a final waiver.
create unique index ledger_one_settlement_per_charge on public.ledger_entries (related_entry_id)
  where entry_type = 'settlement';
create unique index ledger_one_reversal_per_charge_uniq on public.ledger_entries (related_entry_id)
  where entry_type = 'settlement_reversal';
create index ledger_entries_pass_id_idx on public.ledger_entries (pass_id);
create index ledger_entries_coaching_id_occurred_at_idx on public.ledger_entries (coaching_id, occurred_at);
create index ledger_entries_trainer_id_occurred_at_idx on public.ledger_entries (trainer_id, occurred_at);
create index ledger_entries_client_id_idx on public.ledger_entries (client_id);
create index ledger_entries_booking_id_idx on public.ledger_entries (booking_id) where booking_id is not null;
create index ledger_entries_related_entry_id_idx on public.ledger_entries (related_entry_id)
  where related_entry_id is not null;

create trigger ledger_entries_fill_pair
  before insert on public.ledger_entries
  for each row execute function private.fill_pair_columns();

create trigger ledger_entries_stamp_created_by
  before insert on public.ledger_entries
  for each row execute function private.stamp_actor('created_by');

create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function private.enforce_append_only('{client_id,coaching_id}', '{created_by}', 'true');

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function private.forbid_truncate();

-- Rules that span rows (data-model §3, R84). Runs AFTER INSERT, not BEFORE: checks, unique indexes and
-- foreign keys then report their own errors first, and only a structurally valid row reaches these rules.
-- The new row is visible here, so the pass sum already includes it. Rows of another pair are looked up within
-- the pair only, so the trigger reveals nothing about them. Definer: it reads rows the caller may not see.
create function private.ledger_entries_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass_currency public.currency_code;
  v_pass_found    boolean := false;
  v_charge        public.ledger_entries;
  v_settlement    public.ledger_entries;
  v_starts_at     timestamptz;
  v_balance       bigint;
begin
  -- 1. Lock the pass: parallel rows of one pass are checked one after another.
  if new.pass_id is not null then
    select p.currency into v_pass_currency
    from public.passes p
    where p.id = new.pass_id and p.coaching_id = new.coaching_id
    for update;
    v_pass_found := found;
  end if;

  if new.entry_type in ('waiver', 'settlement', 'settlement_reversal') then
    -- 2. They refer to a charge of the same pair.
    select * into v_charge
    from public.ledger_entries e
    where e.id = new.related_entry_id and e.coaching_id = new.coaching_id;
    if not found or v_charge.entry_type <> 'charge' then
      raise exception 'ledger_invalid' using errcode = 'P0001',
        detail = pg_catalog.format('%s must refer to a charge of the same pair', new.entry_type);
    end if;

    -- 3. Only a debt charge (no pass) is settled from a new pass.
    if new.entry_type = 'settlement' and v_charge.pass_id is not null then
      raise exception 'ledger_invalid' using errcode = 'P0001',
        detail = 'settlement must refer to a debt charge without a pass';
    end if;

    -- 4. A waiver mirrors its charge.
    if new.entry_type = 'waiver'
       and (new.pass_id is distinct from v_charge.pass_id
            or new.amount_minor <> -v_charge.amount_minor
            or (new.amount_minor <> 0 and new.currency is distinct from v_charge.currency)) then
      raise exception 'ledger_invalid' using errcode = 'P0001',
        detail = 'waiver must have the pass, the opposite amount and the currency of its charge';
    end if;

    -- 5. A reversal mirrors the settlement of the same charge.
    if new.entry_type = 'settlement_reversal' then
      select * into v_settlement
      from public.ledger_entries e
      where e.related_entry_id = v_charge.id and e.coaching_id = new.coaching_id and e.entry_type = 'settlement';
      if not found
         or new.pass_id is distinct from v_settlement.pass_id
         or new.amount_minor <> -v_settlement.amount_minor then
        raise exception 'ledger_invalid' using errcode = 'P0001',
          detail = 'settlement_reversal must have the pass and the opposite amount of the settlement of its charge';
      end if;
    end if;
  end if;

  -- 6. Money on a pass is in the pass currency.
  if v_pass_found and new.amount_minor <> 0 and new.currency is distinct from v_pass_currency then
    raise exception 'ledger_invalid' using errcode = 'P0001',
      detail = 'an amount on a pass must be in the pass currency';
  end if;

  -- 7. A booking charge happens at the session start.
  if new.entry_type = 'charge' and new.booking_id is not null then
    select s.starts_at into v_starts_at
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.id = new.booking_id and b.coaching_id = new.coaching_id;
    if found and new.occurred_at is distinct from v_starts_at then
      raise exception 'ledger_invalid' using errcode = 'P0001',
        detail = 'a booking charge must occur at the session start';
    end if;
  end if;

  -- 8. A pass balance never goes below zero.
  if v_pass_found and new.sessions_delta < 0 then
    select coalesce(sum(e.sessions_delta), 0) into v_balance
    from public.ledger_entries e
    where e.pass_id = new.pass_id;
    if v_balance < 0 then
      raise exception 'pass_overdrawn' using errcode = 'P0001',
        detail = 'the pass has no sessions left for this row';
    end if;
  end if;

  return null;
end $$;

comment on function private.ledger_entries_validate() is
  'Trigger: cross-row ledger rules (what a waiver, settlement or reversal may refer to, currencies, charge time, no overdraft).';
revoke all on function private.ledger_entries_validate() from public;

create trigger ledger_entries_validate
  after insert on public.ledger_entries
  for each row execute function private.ledger_entries_validate();

alter table public.ledger_entries enable row level security;
revoke all on table public.ledger_entries from anon, authenticated;

-- A pass may be deleted only while nothing but its grant points at it (R27); the grant then leaves through
-- the FK cascade, which the ledger append-only trigger allows. A pair delete (cascade) always passes.
-- Definer: it must see every ledger row and payment of the pass.
create function private.passes_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.ledger_entries e where e.pass_id = old.id and e.entry_type <> 'grant')
     or exists (select 1 from public.payments p where p.pass_id = old.id) then
    raise exception 'pass_in_use' using errcode = 'P0001',
      detail = 'a pass with ledger rows other than its grant, or with payments, cannot be deleted';
  end if;
  return old;
end $$;

comment on function private.passes_delete_guard() is
  'Trigger: a pass can be deleted directly only when the ledger has just its grant and no payment refers to it.';
revoke all on function private.passes_delete_guard() from public;

create trigger passes_delete_guard
  before delete on public.passes
  for each row execute function private.passes_delete_guard();

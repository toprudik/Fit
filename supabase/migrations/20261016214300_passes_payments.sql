-- Passes and payments (PRD wave-1 §2.8 rules 4–16, MONEY-4..10; data-model §3.3, §3.4; screens.md "Абонементы",
-- "Оплаты", "Деньги"). The tables, their grants and guards are in 20261015120500_money_tables.sql and
-- 20261015123400_money_policies.sql: freezes, payments, title and note edits and the delete of an unused pass
-- are direct writes under those policies. What spans several tables, or needs a reason, goes through the RPCs
-- here: create_pass (the pass, its grant row, the debt it settles and an optional payment), cancel_pass (the
-- refund row) and change_pass_expiry (with a reason). The share and pass-choice helpers are what the charge
-- RPCs of the bookings will use too.

-- Helpers ------------------------------------------------------------------------------------------------------

-- Whether a pass "for" applies_to may pay for a session of this kind (PRD 2.8-6): any fits all, a trial counts as
-- personal. A manual debt charge has no session, so its kind is null and every pass fits it.
create function private.pass_fits_kind(p_applies_to public.package_applies_to, p_kind public.session_kind)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind is null
    or p_applies_to = 'any'
    or (p_applies_to = 'personal' and p_kind in ('personal', 'trial'))
    or (p_applies_to = 'group' and p_kind = 'group')
$$;

comment on function private.pass_fits_kind(public.package_applies_to, public.session_kind) is
  'True when a pass for applies_to may pay for a session of this kind (trial counts as personal; null kind fits all).';
revoke all on function private.pass_fits_kind(public.package_applies_to, public.session_kind) from public;

-- The fair share of the k-th net session of a pass (data-model §3.4): floor(price*k/N) - floor(price*(k-1)/N),
-- so the N shares add up to the price exactly. Past N (an adjustment added sessions) a session earns nothing.
create function private.pass_share_minor(p_price bigint, p_total integer, p_k integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_k < 1 or p_k > p_total or p_total < 1 then 0::bigint
    else (p_price * p_k) / p_total - (p_price * (p_k - 1)) / p_total
  end
$$;

comment on function private.pass_share_minor(bigint, integer, integer) is
  'Fair share in minor units of the k-th of N sessions of a pass of this price; the N shares add up to the price.';
revoke all on function private.pass_share_minor(bigint, integer, integer) from public;

-- The share the next session taken from this pass earns: k = 1 + its charges that are not waived and its
-- settlements that are not reversed. Read with the pass row locked by the caller, so parallel writers agree on k.
create function private.pass_next_share(p_pass_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select private.pass_share_minor(
    p.price_minor,
    p.sessions_total,
    1 + (
      select count(*)::integer
      from public.ledger_entries e
      where e.pass_id = p.id
        and (
          (e.entry_type = 'charge' and not exists (
            select 1 from public.ledger_entries w where w.related_entry_id = e.id and w.entry_type = 'waiver'))
          or (e.entry_type = 'settlement' and not exists (
            select 1 from public.ledger_entries r
            where r.related_entry_id = e.related_entry_id and r.entry_type = 'settlement_reversal'))
        )))
  from public.passes p
  where p.id = p_pass_id
$$;

comment on function private.pass_next_share(uuid) is
  'Minor units the next session taken from this pass earns: its fair share for k = 1 + unwaived charges and '
  'unreversed settlements.';
revoke all on function private.pass_next_share(uuid) from public;

-- The pass a session of this kind at p_at is taken from (PRD 2.8-7, data-model §3.4): an active pass of the
-- pair (not cancelled, with a session left, not expired and not frozen at p_at, in the trainer time zone) that
-- fits the kind; the nearest expiry first (no expiry last), then the oldest. p_prefer wins when it qualifies
-- (the booking's reserved pass). Null when none qualifies: the session then goes into debt.
create function private.pick_pass(
  p_coaching_id uuid,
  p_kind public.session_kind,
  p_at timestamptz,
  p_prefer uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pb.pass_id
  from public.pass_balances pb
  join public.passes p on p.id = pb.pass_id
  join public.profiles tr on tr.id = p.trainer_id
  where pb.coaching_id = p_coaching_id
    and p.status = 'active'
    and pb.remaining > 0
    and (pb.effective_expires_at is null or pb.effective_expires_at > p_at)
    and (p_at at time zone tr.time_zone)::date >= p.starts_on
    and not exists (
      select 1 from public.pass_freezes f
      where f.pass_id = p.id and (p_at at time zone tr.time_zone)::date <@ f.period)
    and private.pass_fits_kind(p.applies_to, p_kind)
  order by pb.pass_id = p_prefer desc nulls last, pb.effective_expires_at asc nulls last, p.starts_on, p.created_at, p.id
  limit 1
$$;

comment on function private.pick_pass(uuid, public.session_kind, timestamptz, uuid) is
  'The pass of the pair a session of this kind at this instant is taken from (PRD 2.8-7), p_prefer first when '
  'it qualifies; null when none does.';
revoke all on function private.pick_pass(uuid, public.session_kind, timestamptz, uuid) from public;

-- Writes a settlement from this pass for every open debt charge of its pair that the pass fits, oldest first,
-- while the pass has sessions left (data-model §3.4, PRD 2.8-9, MONEY-7). Each settlement earns the pass share
-- of that session; the charge keeps its amount. The caller holds the pass row. Returns how many were settled.
create function private.settle_debt(p_pass_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass    public.passes;
  v_left    integer;
  v_charge  record;
  v_settled integer := 0;
begin
  select * into v_pass from public.passes p where p.id = p_pass_id for no key update;
  if not found or v_pass.status <> 'active' then
    return 0;
  end if;
  select coalesce(sum(e.sessions_delta), 0)::integer into v_left from public.ledger_entries e where e.pass_id = v_pass.id;

  for v_charge in
    select ch.id, s.kind
    from public.ledger_entries ch
    left join public.bookings b on b.id = ch.booking_id
    left join public.sessions s on s.id = b.session_id
    where ch.coaching_id = v_pass.coaching_id and ch.entry_type = 'charge' and ch.pass_id is null
      and not exists (
        select 1 from public.ledger_entries w where w.related_entry_id = ch.id and w.entry_type in ('waiver', 'settlement'))
    order by ch.occurred_at, ch.created_at, ch.id
    for update of ch
  loop
    exit when v_left <= 0;
    continue when not private.pass_fits_kind(v_pass.applies_to, v_charge.kind);
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, related_entry_id, sessions_delta,
                                       amount_minor, currency, occurred_at)
    values (v_pass.coaching_id, 'settlement', v_pass.id, v_charge.id, -1,
            private.pass_next_share(v_pass.id), v_pass.currency, pg_catalog.now());
    v_left := v_left - 1;
    v_settled := v_settled + 1;
  end loop;
  return v_settled;
end $$;

comment on function private.settle_debt(uuid) is
  'Settles the open debt charges of the pair that this pass fits, oldest first, while it has sessions left; '
  'returns how many.';
revoke all on function private.settle_debt(uuid) from public;

-- The exclusive end of a pass valid through p_last_day in the trainer time zone (PRD 2.8-4: until the end of
-- that day): the start of the next local day.
create function private.pass_end_instant(p_last_day date, p_time_zone text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_last_day + 1)::timestamp) at time zone p_time_zone
$$;

comment on function private.pass_end_instant(date, text) is
  'Start of the local day after p_last_day in this time zone: the exclusive end of a pass valid through that day.';
revoke all on function private.pass_end_instant(date, text) from public;

-- create_pass ---------------------------------------------------------------------------------------------------

-- The trainer sells a pass to the client of a live pair (PRD 2.8-4): from a live package of theirs (a snapshot of
-- its title, sessions, price, currency, type and validity) or a custom one (title, sessions, price, currency,
-- optional validity and type). A 1-session pass is a drop-in. It starts on p_starts_on (default: today in the
-- trainer time zone) and, with a validity of D days, is valid through starts_on + D - 1. In one transaction it
-- writes the grant row, settles the pair's open debt that the pass fits (oldest first) and, with p_payment_minor,
-- records a confirmed incoming payment for the pass (screens.md 4.5 "Отметить оплату" with a package).
-- Returns the pass id and how many debt sessions it settled.
create function public.create_pass(
  p_coaching_id    uuid,
  p_package_id     uuid default null,
  p_title          text default null,
  p_sessions       integer default null,
  p_price_minor    bigint default null,
  p_currency       text default null,
  p_validity_days  integer default null,
  p_applies_to     public.package_applies_to default null,
  p_starts_on      date default null,
  p_note           text default null,
  p_payment_minor  bigint default null,
  p_payment_method public.payment_method default null,
  p_paid_at        timestamptz default null
)
returns table (pass_id uuid, settled integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_pair     public.coachings;
  v_package  public.packages;
  v_tz       text;
  v_title    text;
  v_sessions integer;
  v_price    bigint;
  v_currency public.currency_code;
  v_days     integer;
  v_applies  public.package_applies_to;
  v_starts   date;
  v_note     text := nullif(pg_catalog.btrim(p_note), '');
  v_pass     uuid;
  v_settled  integer;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for share;
  if not found or not private.is_coaching_trainer(v_pair.id, 'passes') then
    raise exception 'coaching_not_found' using errcode = 'P0001';
  end if;
  if v_pair.status = 'ended' then
    raise exception 'coaching_ended' using errcode = 'P0001';
  end if;
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_pair.trainer_id;

  if p_package_id is not null then
    select pk.* into v_package
    from public.packages pk
    where pk.id = p_package_id and pk.trainer_id = v_pair.trainer_id and pk.archived_at is null;
    if not found then
      raise exception 'package_not_found' using errcode = 'P0001';
    end if;
    v_title := v_package.title;
    v_sessions := v_package.sessions_count;
    v_price := v_package.price_minor;
    v_currency := v_package.currency;
    v_days := v_package.validity_days;
    v_applies := v_package.applies_to;
  else
    v_title := nullif(pg_catalog.btrim(p_title), '');
    v_sessions := p_sessions;
    v_price := p_price_minor;
    v_days := p_validity_days;
    v_applies := coalesce(p_applies_to, 'any');
    if v_title is null or pg_catalog.char_length(v_title) > 120
       or v_sessions is null or v_sessions not between 1 and 200
       or v_price is null or v_price < 0
       or p_currency is null
       or (v_days is not null and v_days not between 1 and 730) then
      raise exception 'pass_invalid' using errcode = '22023';
    end if;
    v_currency := p_currency::public.currency_code;
  end if;

  if pg_catalog.char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if p_payment_minor is not null and (p_payment_minor <= 0 or p_payment_method is null) then
    raise exception 'payment_invalid' using errcode = '22023';
  end if;

  v_starts := coalesce(p_starts_on, (pg_catalog.now() at time zone v_tz)::date);
  insert into public.passes (coaching_id, package_id, title, sessions_total, price_minor, currency, applies_to,
                             is_drop_in, starts_on, expires_at, note)
  values (v_pair.id, v_package.id, v_title, v_sessions, v_price, v_currency, v_applies, v_sessions = 1, v_starts,
          case when v_days is not null then private.pass_end_instant(v_starts + v_days - 1, v_tz) end, v_note)
  returning id into v_pass;

  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
  values (v_pair.id, 'grant', v_pass, v_sessions, 0, pg_catalog.now());

  v_settled := private.settle_debt(v_pass);

  if p_payment_minor is not null then
    insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status)
    values (v_pair.id, v_pass, 'in', p_payment_minor, v_currency, p_payment_method,
            coalesce(p_paid_at, pg_catalog.now()), 'confirmed');
  end if;

  return query select v_pass, v_settled;
end $$;

comment on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz) is
  'The trainer sells a pass to the client of a live pair, from a package or custom: the pass, its grant, the '
  'settlement of the debt it fits and an optional confirmed payment, in one transaction. Returns the pass id '
  'and the settled debt sessions. Raises coaching_not_found, coaching_ended, package_not_found, pass_invalid, '
  'note_too_long or payment_invalid.';
revoke all on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz) from public, anon;
grant execute on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer,
  public.package_applies_to, date, text, bigint, public.payment_method, timestamptz) to authenticated;

-- cancel_pass ---------------------------------------------------------------------------------------------------

-- The trainer cancels ("Аннулировать") a pass that cannot be deleted (PRD 2.8-16, MONEY-10): the rest of its
-- sessions leaves through a refund row (amount 0; money goes back as a payment with direction refund), the pass
-- becomes cancelled with the reason, and future confirmed bookings reserved on it lose the reservation, so their
-- charge picks a pass by the usual rule. History and payments stay. Cancelling a cancelled pass changes nothing.
create function public.cancel_pass(p_pass_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_pass   public.passes;
  v_left   integer;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.* into v_pass from public.passes p where p.id = p_pass_id for no key update;
  if not found or not private.is_coaching_trainer(v_pass.coaching_id, 'passes') then
    raise exception 'pass_not_found' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if v_pass.status = 'cancelled' then
    return;
  end if;

  select coalesce(sum(e.sessions_delta), 0)::integer into v_left from public.ledger_entries e where e.pass_id = v_pass.id;
  if v_left > 0 then
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
    values (v_pass.coaching_id, 'refund', v_pass.id, -v_left, 0, pg_catalog.now(), v_reason);
  end if;

  update public.bookings b
  set reserved_pass_id = null
  from public.sessions s
  where b.reserved_pass_id = v_pass.id and s.id = b.session_id and b.status = 'confirmed'
    and s.starts_at > pg_catalog.now();

  perform pg_catalog.set_config('fit.change_reason', v_reason, true);
  update public.passes p
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancel_reason = v_reason
  where p.id = v_pass.id;
  perform pg_catalog.set_config('fit.change_reason', '', true);
end $$;

comment on function public.cancel_pass(uuid, text) is
  'The trainer cancels a pass with a reason: a refund row takes the remaining sessions, future reservations on '
  'it are dropped, history and payments stay (PRD 2.8-16). Raises pass_not_found, reason_required or '
  'reason_too_long.';
revoke all on function public.cancel_pass(uuid, text) from public, anon;
grant execute on function public.cancel_pass(uuid, text) to authenticated;

-- change_pass_expiry --------------------------------------------------------------------------------------------

-- The trainer moves the last valid day of a pass that is not cancelled (PRD 2.8-8, MONEY-5: an expired pass can be
-- extended and then works again), or removes the expiry with null. The day is a local date in the trainer time
-- zone; freezes still move it on top. The reason goes into money_events (money_events_record requires one).
create function public.change_pass_expiry(p_pass_id uuid, p_last_day date, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_pass   public.passes;
  v_tz     text;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.* into v_pass from public.passes p where p.id = p_pass_id for no key update;
  if not found or not private.is_coaching_trainer(v_pass.coaching_id, 'passes') then
    raise exception 'pass_not_found' using errcode = 'P0001';
  end if;
  if v_pass.status = 'cancelled' then
    raise exception 'pass_cancelled' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if p_last_day is not null and p_last_day < v_pass.starts_on then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_pass.trainer_id;

  perform pg_catalog.set_config('fit.change_reason', v_reason, true);
  update public.passes p
  set expires_at = case when p_last_day is not null then private.pass_end_instant(p_last_day, v_tz) end
  where p.id = v_pass.id;
  perform pg_catalog.set_config('fit.change_reason', '', true);
end $$;

comment on function public.change_pass_expiry(uuid, date, text) is
  'The trainer sets the last valid day (trainer time zone) of a pass that is not cancelled, or removes the expiry '
  'with null; the reason lands in money_events. Raises pass_not_found, pass_cancelled, reason_required, '
  'reason_too_long or invalid_range.';
revoke all on function public.change_pass_expiry(uuid, date, text) from public, anon;
grant execute on function public.change_pass_expiry(uuid, date, text) to authenticated;

-- "Я оплатил" -> the trainer ---------------------------------------------------------------------------------

-- A client's report of a payment only tells the trainer (screens.md rule 15): the balance does not move until the
-- trainer confirms it. AFTER INSERT, so the row is stored before the message is queued; one message per report.
create function private.payments_notify_reported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.profiles;
  v_title  text;
begin
  if new.status <> 'reported' then
    return null;
  end if;
  select p.* into v_client from public.profiles p where p.id = new.client_id;
  select ps.title into v_title from public.passes ps where ps.id = new.pass_id;
  perform private.enqueue_notification(
    'payment_reported',
    pg_catalog.format('payment_reported:%s', new.id),
    pg_catalog.jsonb_build_object('coaching_id', new.coaching_id, 'payment_id', new.id, 'amount_minor', new.amount_minor,
                                  'currency', new.currency, 'pass_title', v_title,
                                  'first_name', v_client.first_name, 'last_name', v_client.last_name),
    new.trainer_id);
  return null;
end $$;

comment on function private.payments_notify_reported() is
  'Trigger: a payment the client reported queues payment_reported for the trainer of the pair.';
revoke all on function private.payments_notify_reported() from public;

create trigger payments_notify_reported
  after insert on public.payments
  for each row execute function private.payments_notify_reported();

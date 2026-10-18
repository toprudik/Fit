-- QA fixes for money and bookings, found by breaking the product on purpose (docs/qa/production-readiness.md).
-- Each function is redefined from its latest body; only the lines named in its comment change.
--
--   1. cancel_session: a client who checked in early by QR (attended) is cancelled too, and every charge already
--      posted on the cancelled sessions (that check-in, a late cancellation) is waived: PRD 2.6.5, "a session the
--      trainer cancels is never charged". Before, the client kept paying for a session that did not happen.
--   2. booking_auto_confirm: two bookings of one pair at the same moment both reserved the last session of a pass.
--      The decision now takes a per-pair transaction lock and is volatile, so the second waits and then sees the
--      first booking. An advisory lock, because preview screens call it in read-only transactions.
--   3. withdraw_booking_request, expire_booking_requests: a withdrawn or expired trial request left its session
--      scheduled and its slot booked (only kind 'personal' was dropped). Now every non-group request is dropped,
--      as cancel_my_booking already does.
--   4. trial_slots: a slot held by a waitlist offer was still offered and bookable on the trial page.
--   5. correct_payment + revoke_referral: correcting a qualifying payment voided both referral bonuses for good.
--      The correction now moves the referral to the new payment instead.

-- 1. cancel_session (20261016204500_schedule_sessions.sql).
create or replace function public.cancel_session(p_session_id uuid, p_reason text, p_following boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_client record;
begin
  v_session := private.own_future_session(p_session_id);
  if v_reason is null or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  p_following := coalesce(p_following, false) and v_session.recurrence_id is not null;
  select pg_catalog.array_agg(x.id) into v_ids from private.session_scope(v_session, p_following) x;

  -- К5 first, while the bookings are still live: one message per client listing the cancelled dates.
  for v_client in
    select b.client_id, pg_catalog.jsonb_agg(s.starts_at order by s.starts_at) as dates
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.session_id = any (v_ids) and b.status in ('requested', 'confirmed', 'attended')
    group by b.client_id
  loop
    perform private.enqueue_notification(
      'booking_cancelled_by_trainer',
      pg_catalog.format('booking_cancelled_by_trainer:%s:%s', v_session.id, v_client.client_id),
      pg_catalog.jsonb_build_object('session_id', v_session.id, 'dates', v_client.dates, 'reason', v_reason)
        || private.trainer_name(v_session.trainer_id),
      v_client.client_id,
      p_session_id => v_session.id);
  end loop;

  with live as (
    select b.id, b.status from public.bookings b
    where b.session_id = any (v_ids) and b.status in ('requested', 'confirmed', 'attended')
    for update of b
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'trainer',
        cancel_reason = v_reason
    from live l
    where b.id = l.id
    returning b.id, l.status as from_status
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  select x.id, x.from_status, 'cancelled', v_user, 'trainer', v_reason, '{}' from cancelled x;

  -- A slot the session was booked on goes with it; the template may offer that time again.
  with freed as (
    update public.sessions s
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = v_reason,
        slot_id = null
    from public.sessions old
    where s.id = any (v_ids) and old.id = s.id
    returning old.slot_id
  )
  delete from public.slots sl using freed f where sl.id = f.slot_id;

  -- A check-in (attended before the start) or a late cancellation was charged already: the trainer cancelled,
  -- so the charge goes back (the pass gets the session back, or the debt shrinks).
  perform private.waive_entry(e.id, v_reason)
  from public.ledger_entries e
  join public.bookings b on b.id = e.booking_id
  where b.session_id = any (v_ids) and e.entry_type = 'charge'
    and not exists (select 1 from public.ledger_entries w where w.related_entry_id = e.id and w.entry_type = 'waiver');

  if p_following then
    update public.recurrences r set ended_at = pg_catalog.now() where r.id = v_session.recurrence_id;
  end if;
  return pg_catalog.cardinality(v_ids);
end $$;

-- 2. booking_auto_confirm (20261016221900_client_bookings.sql).
create or replace function private.booking_auto_confirm(p_coaching uuid, p_kind public.session_kind, p_starts_at timestamptz)
returns table (confirmed boolean, pass_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_day date;
  v_pass uuid;
  v_debt integer;
begin
  -- One decision per pair at a time: a concurrent booking of the same pair waits here until this transaction
  -- ends, and its queries below then see the session this one reserved.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('booking_auto_confirm:' || p_coaching::text, 0));
  select c.* into v_pair from public.coachings c where c.id = p_coaching;
  if v_pair.id is null then
    return query select false, null::uuid;
    return;
  end if;
  v_day := (p_starts_at at time zone private.trainer_zone(v_pair.trainer_id))::date;

  select pb.pass_id into v_pass
  from public.pass_balances pb
  join public.passes p on p.id = pb.pass_id
  where pb.coaching_id = p_coaching
    and p.status = 'active'
    and pb.available >= 1
    and p.applies_to in ('any', case when p_kind = 'group' then 'group' else 'personal' end::public.package_applies_to)
    and p.starts_on <= v_day
    and (pb.effective_expires_at is null or pb.effective_expires_at > p_starts_at)
    and not exists (select 1 from public.pass_freezes f where f.pass_id = p.id and f.period @> v_day)
  order by pb.effective_expires_at nulls last, p.starts_on, p.created_at
  limit 1;
  if v_pass is not null then
    return query select true, v_pass;
    return;
  end if;

  if v_pair.self_book_on_debt then
    select cb.debt_sessions into v_debt from public.coaching_balances cb where cb.coaching_id = p_coaching;
    if coalesce(v_debt, 0) < coalesce(v_pair.debt_limit_sessions, 2147483647) then
      return query select true, null::uuid;
      return;
    end if;
  end if;
  return query select false, null::uuid;
end $$;

-- 3. withdraw_booking_request (20261016221900_client_bookings.sql).
create or replace function public.withdraw_booking_request(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or v_booking.client_id <> v_user or v_booking.status <> 'requested' then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;

  update public.bookings b
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'client'
  where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking.id, 'requested', 'cancelled', v_user, 'client', '{"withdrawn": true}');
  if v_session.kind <> 'group' then
    perform private.drop_request_session(v_session.id, v_user, null);
  end if;

  perform private.enqueue_notification(
    'booking_cancelled_by_client',
    'booking_cancelled_by_client:' || v_booking.id,
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking.id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'request', true)
      || private.person_name(v_booking.client_id),
    v_booking.trainer_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
end $$;

-- 3. expire_booking_requests (20261016221900_client_bookings.sql).
create or replace function private.expire_booking_requests()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.client_id, b.trainer_id, s.id as session_id, s.kind, s.starts_at
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.status = 'requested' and s.starts_at <= pg_catalog.now()
    order by s.starts_at
    for update of b skip locked
  loop
    update public.bookings b set status = 'expired' where b.id = v_row.id;
    insert into public.booking_events (booking_id, from_status, to_status, actor_role, payload)
    values (v_row.id, 'requested', 'expired', 'system', '{}');
    if v_row.kind <> 'group' then
      perform private.drop_request_session(v_row.session_id, null, null);
    end if;
    perform private.enqueue_notification(
      'booking_expired',
      'booking_expired:' || v_row.id,
      pg_catalog.jsonb_build_object('booking_id', v_row.id, 'session_id', v_row.session_id, 'starts_at', v_row.starts_at)
        || private.trainer_name(v_row.trainer_id),
      v_row.client_id,
      p_booking_id => v_row.id,
      p_session_id => v_row.session_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 4. trial_slots (20261016234300_trial_booking.sql).
create or replace function private.trial_slots(p_link public.trial_links)
returns setof public.slots
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.slots s
  join public.trainer_profiles t on t.user_id = s.trainer_id
  where s.trainer_id = p_link.trainer_id
    and s.status = 'open'
    and s.allow_trial
    and s.starts_at >= pg_catalog.now() + pg_catalog.make_interval(mins => t.min_booking_notice_minutes)
    and s.starts_at < pg_catalog.now() + interval '14 days'
    and s.ends_at - s.starts_at >= pg_catalog.make_interval(mins => p_link.duration_min)
    and (p_link.mode is null or s.mode = p_link.mode)
    and (p_link.location_id is null or s.location_id = p_link.location_id)
    and not private.slot_held(s.id, auth.uid())
  order by s.starts_at
$$;

-- 5. correct_payment (20261017133641_correct_payment.sql).
create or replace function public.correct_payment(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_paid_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.payments;
  v_new uuid;
begin
  select * into v_old from public.payments p
  -- RLS shows the pair's payments to its trainer, a delegate with the payments scope and the client; the
  -- client's own insert policy would refuse a confirmed payment anyway, this only gives the same answer.
  where p.id = p_payment_id and p.status = 'confirmed' and p.client_id is distinct from (select auth.uid())
  for update;
  if v_old.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002',
      detail = 'only a confirmed payment of the trainer''s pair can be corrected';
  end if;

  insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status, note)
  values (v_old.coaching_id, v_old.pass_id, v_old.direction, p_amount_minor, v_old.currency, p_method, p_paid_at,
          'confirmed', v_old.note)
  returning id into v_new;

  -- revoke_referral reads this: a corrected payment hands its referral to the new one instead of voiding it.
  perform pg_catalog.set_config('dafit.payment_correction', v_new::text, true);
  update public.payments set status = 'voided', void_reason = p_reason where id = v_old.id;
  perform pg_catalog.set_config('dafit.payment_correction', '', true);
  return v_new;
end $$;

-- 5. revoke_referral (20261017174813_referral_bonus_active_pass.sql).
create or replace function private.revoke_referral(p_payment public.payments)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_bonus    public.bonuses;
  v_left     integer;
  v_bonus_pass boolean;
  v_correction uuid := nullif(pg_catalog.current_setting('dafit.payment_correction', true), '')::uuid;
begin
  -- correct_payment voids a payment while entering its replacement: the referral moves to the new payment.
  if v_correction is not null and exists (
    select 1 from public.payments p
    where p.id = v_correction and p.coaching_id = p_payment.coaching_id and p.direction = 'in' and p.status = 'confirmed'
  ) then
    update public.referrals r set qualifying_payment_id = v_correction
    where r.qualifying_payment_id = p_payment.id and r.status = 'qualified';
    return;
  end if;

  select r.* into v_referral from public.referrals r
  where r.qualifying_payment_id = p_payment.id and r.status = 'qualified'
    and r.qualified_at > pg_catalog.now() - interval '14 days'
  for update;
  if v_referral.id is null then
    return;
  end if;

  for v_bonus in
    select b.* from public.bonuses b
    where b.referral_id = v_referral.id and b.status in ('granted', 'pending')
    for update
  loop
    if v_bonus.status = 'pending' or v_bonus.pass_id is null then
      update public.bonuses b set status = 'void', voided_at = pg_catalog.now() where b.id = v_bonus.id;
      continue;
    end if;

    select p.is_bonus into v_bonus_pass from public.passes p where p.id = v_bonus.pass_id for no key update;
    if v_bonus_pass then
      continue when exists (select 1 from public.ledger_entries e
                            where e.pass_id = v_bonus.pass_id and e.entry_type in ('charge', 'settlement'));
      select coalesce(pg_catalog.sum(e.sessions_delta), 0)::integer into v_left
      from public.ledger_entries e where e.pass_id = v_bonus.pass_id;
      if v_left > 0 then
        insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
        select p.coaching_id, 'refund', p.id, -v_left, 0, pg_catalog.now(), 'payment_voided'
        from public.passes p where p.id = v_bonus.pass_id;
      end if;
      update public.bookings b
      set reserved_pass_id = null
      from public.sessions s
      where b.reserved_pass_id = v_bonus.pass_id and s.id = b.session_id and b.status = 'confirmed'
        and s.starts_at > pg_catalog.now();
      update public.passes p
      set status = 'cancelled', cancelled_at = pg_catalog.now(), cancel_reason = 'payment_voided'
      where p.id = v_bonus.pass_id and p.status = 'active';
    else
      -- Sessions of the pass that are neither used nor booked, at most the bonus.
      select least(v_bonus.sessions, greatest(pb.available, 0)) into v_left
      from public.pass_balances pb join public.passes p on p.id = pb.pass_id
      where pb.pass_id = v_bonus.pass_id and p.status = 'active';
      continue when coalesce(v_left, 0) = 0;
      insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
      select p.coaching_id, 'adjustment', p.id, -v_left, 0, pg_catalog.now(), 'referral_bonus_voided'
      from public.passes p where p.id = v_bonus.pass_id;
    end if;
    update public.bonuses b set status = 'void', voided_at = pg_catalog.now() where b.id = v_bonus.id;
  end loop;

  update public.referrals r
  set status = 'void', voided_at = pg_catalog.now(), void_reason = 'payment_voided'
  where r.id = v_referral.id;
end $$;

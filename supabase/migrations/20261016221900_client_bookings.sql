-- Client bookings and booking requests (PRD wave-1 §2.6.4, §2.6.5-6, data-model §3.5). Trial bookings, group
-- sessions, client cancellations with a charge and the ledger come with their own items.
--
--   * private.booking_auto_confirm: the one place that decides confirmed or requested for a client booking and
--     which pass the booking is reserved against. It only reads; the money item may refine the rule here.
--   * booking_preview / book_slot: the client books a free slot of a trainer of a live pair. A personal session
--     is created on the slot, which becomes booked; the booking is confirmed at once (Т1 to the trainer) or is
--     a request that holds the slot (Т2 with a button to decide).
--   * decide_booking: the trainer confirms a request (К2) or declines it (К3); a decline frees the slot.
--   * withdraw_booking_request: the client takes back a request at any time without consequences (2.6.5-6).
--   * A pg_cron job turns requests left unanswered when the session starts into expired (К4, 2.6.4-5).

-- The client's name for the trainer's notifications, in the keys private.trainer_name uses.
create function private.person_name(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select pg_catalog.jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name)
                   from public.profiles p where p.id = p_user), '{}'::jsonb)
$$;

revoke all on function private.person_name(uuid) from public;

-- Auto-confirmation (data-model §3.5). A pass fits when it is not cancelled, has a free session (available ≥ 1),
-- covers the kind (a trial counts as personal), has started by the session's local date, is not expired at the
-- start and is not frozen on that date; the nearest expiry wins, then the oldest. Without one, the booking is
-- confirmed on debt when the trainer allowed it for this client and the debt is under the limit. Otherwise
-- confirmed is false and the booking is a request. Read-only, so a screen may ask it before booking.
create function private.booking_auto_confirm(p_coaching uuid, p_kind public.session_kind, p_starts_at timestamptz)
returns table (confirmed boolean, pass_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_day date;
  v_pass uuid;
  v_debt integer;
begin
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

comment on function private.booking_auto_confirm(uuid, public.session_kind, timestamptz) is
  'Decides a client booking (data-model §3.5): confirmed with the pass to reserve, confirmed on allowed debt '
  '(pass_id null), or not confirmed = a booking request. Read-only.';
revoke all on function private.booking_auto_confirm(uuid, public.session_kind, timestamptz) from public;

-- The caller's live pair with the trainer, or not_your_trainer.
create function private.own_live_pair(p_trainer uuid)
returns public.coachings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
begin
  select c.* into v_pair from public.coachings c
  where c.trainer_id = p_trainer and c.client_id = auth.uid() and c.status in ('trial', 'active');
  if v_pair.id is null then
    raise exception 'not_your_trainer' using errcode = '42501';
  end if;
  return v_pair;
end $$;

revoke all on function private.own_live_pair(uuid) from public;

-- An open future slot of a trainer the caller has a live pair with, past the trainer's booking notice; raises
-- slot_unavailable or too_late. book_slot locks the slot first.
create function private.bookable_slot(p_slot_id uuid)
returns public.slots
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_notice integer;
begin
  select s.* into v_slot from public.slots s where s.id = p_slot_id;
  if v_slot.id is null or v_slot.status <> 'open' or v_slot.starts_at <= pg_catalog.now()
     or not (v_slot.trainer_id = any (private.client_trainer_ids(true))) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  select t.min_booking_notice_minutes into v_notice from public.trainer_profiles t where t.user_id = v_slot.trainer_id;
  if v_slot.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => coalesce(v_notice, 0)) then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  return v_slot;
end $$;

revoke all on function private.bookable_slot(uuid) from public;

-- What booking this slot would give, for the confirm sheet: confirmed or a request, and the pass it would use
-- with the sessions left on it after this booking. Raises slot_unavailable or too_late.
create function public.booking_preview(p_slot_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_pair public.coachings;
  v_decision record;
begin
  v_slot := private.bookable_slot(p_slot_id);
  v_pair := private.own_live_pair(v_slot.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'personal', v_slot.starts_at);
  return query
    select v_decision.confirmed, p.title, pb.available - 1
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;

comment on function public.booking_preview(uuid) is
  'Client: whether booking this slot would be confirmed, and the pass it would use with the sessions left after it.';
revoke all on function public.booking_preview(uuid) from public, anon;
grant execute on function public.booking_preview(uuid) to authenticated;

-- The client books a free slot (PRD 2.6.4): a personal session on the slot, which becomes booked, and a
-- booking that is confirmed or a request (data-model §3.5). The trainer gets Т1 or Т2. Returns the booking and
-- its status. Raises slot_unavailable or too_late.
create function public.book_slot(p_slot_id uuid)
returns table (booking_id uuid, status public.booking_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_slot public.slots;
  v_pair public.coachings;
  v_decision record;
  v_url text;
  v_session_id uuid;
  v_booking_id uuid;
  v_status public.booking_status;
  v_location text;
begin
  perform 1 from public.slots s where s.id = p_slot_id for update;   -- one booking per slot at a time
  v_slot := private.bookable_slot(p_slot_id);
  v_pair := private.own_live_pair(v_slot.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'personal', v_slot.starts_at);
  v_status := case when v_decision.confirmed then 'confirmed' else 'requested' end::public.booking_status;

  if v_slot.mode = 'online' then
    select i.meeting_url into v_url from public.week_template_items i where i.id = v_slot.template_item_id;
  end if;
  insert into public.sessions (trainer_id, kind, starts_at, ends_at, location_id, mode, meeting_url, capacity, slot_id)
  values (v_slot.trainer_id, 'personal', v_slot.starts_at, v_slot.ends_at, v_slot.location_id, v_slot.mode, v_url, 1,
          v_slot.id)
  returning id into v_session_id;
  update public.slots s set status = 'booked' where s.id = v_slot.id;

  insert into public.bookings
    (session_id, coaching_id, client_id, trainer_id, status, source, reserved_pass_id, requested_at, confirmed_at)
  values
    (v_session_id, v_pair.id, v_pair.client_id, v_pair.trainer_id, v_status, 'client_slot', v_decision.pass_id,
     pg_catalog.now(), case when v_decision.confirmed then pg_catalog.now() end)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, v_status, v_client, 'client',
          case when v_decision.confirmed
            then pg_catalog.jsonb_build_object('auto_confirmed', true, 'pass_id', v_decision.pass_id)
            else '{}'::jsonb end);

  select l.name into v_location from public.locations l where l.id = v_slot.location_id;
  perform private.enqueue_notification(
    case when v_decision.confirmed then 'booking_created' else 'booking_requested' end::public.notification_type,
    pg_catalog.format('%s:%s', case when v_decision.confirmed then 'booking_created' else 'booking_requested' end, v_booking_id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking_id, 'session_id', v_session_id, 'starts_at', v_slot.starts_at, 'mode', v_slot.mode,
      'location', v_location, 'debt', v_decision.confirmed and v_decision.pass_id is null)
      || private.person_name(v_pair.client_id),
    v_pair.trainer_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session_id);

  return query select v_booking_id, v_status;
end $$;

comment on function public.book_slot(uuid) is
  'Client: books a free slot of a trainer of a live pair; the booking is confirmed when a pass or allowed debt '
  'covers it, otherwise it is a request that holds the slot. Returns the booking and its status.';
revoke all on function public.book_slot(uuid) from public, anon;
grant execute on function public.book_slot(uuid) to authenticated;

-- A session of a request that ended without a session (declined, withdrawn, expired) is cancelled and its slot
-- is offered again, unless the time has passed, a closed day now covers it or another session took it.
create function private.drop_request_session(p_session_id uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_slot public.slots;
begin
  update public.sessions s
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = p_actor, cancel_reason = p_reason
  where s.id = p_session_id and s.status = 'scheduled'
  returning s.* into v_session;
  if v_session.slot_id is null then
    return;
  end if;
  select sl.* into v_slot from public.slots sl where sl.id = v_session.slot_id for update;
  if v_slot.id is null or v_slot.status <> 'booked' then
    return;
  end if;
  if v_slot.starts_at > pg_catalog.now()
     and not exists (
       select 1 from public.slots c
       where c.trainer_id = v_slot.trainer_id and c.status = 'closed'
         and tstzrange(c.starts_at, c.ends_at) && tstzrange(v_slot.starts_at, v_slot.ends_at))
     and not exists (
       select 1 from public.sessions x
       where x.trainer_id = v_slot.trainer_id and x.status = 'scheduled' and x.id <> v_session.id
         and tstzrange(x.starts_at, x.ends_at) && tstzrange(v_slot.starts_at, v_slot.ends_at)) then
    update public.slots sl set status = 'open' where sl.id = v_slot.id;
  else
    update public.sessions s set slot_id = null where s.id = v_session.id;
    delete from public.slots sl where sl.id = v_slot.id;
  end if;
end $$;

revoke all on function private.drop_request_session(uuid, uuid, text) from public;

-- The trainer answers a booking request (PRD 2.6.4): confirm (К2; the booking is reserved against a pass if one
-- fits by now, otherwise the session goes to debt when charged) or decline with an optional reason (К3; the
-- slot is offered again). Returns the new status. Raises request_not_found or invalid_reason.
create function public.decide_booking(p_booking_id uuid, p_accept boolean, p_reason text default null)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_decision record;
  v_status public.booking_status;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or not private.acts_for_trainer(v_booking.trainer_id, 'schedule')
     or v_booking.status <> 'requested' then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_session.starts_at <= pg_catalog.now() then
    raise exception 'request_not_found' using errcode = 'P0001', detail = 'the session has started';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if coalesce(p_accept, false) then
    v_status := 'confirmed';
    select * into v_decision from private.booking_auto_confirm(v_booking.coaching_id, v_session.kind, v_session.starts_at);
    update public.bookings b
    set status = 'confirmed', confirmed_at = pg_catalog.now(), decided_by = v_user, reserved_pass_id = v_decision.pass_id
    where b.id = v_booking.id;
  else
    v_status := 'declined';
    update public.bookings b set status = 'declined', decided_by = v_user, cancel_reason = v_reason
    where b.id = v_booking.id;
    perform private.drop_request_session(v_session.id, v_user, v_reason);
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, 'requested', v_status, v_user, 'trainer', v_reason, '{}');

  perform private.enqueue_notification(
    case when v_status = 'confirmed' then 'booking_confirmed' else 'booking_declined' end::public.notification_type,
    pg_catalog.format('%s:%s', v_status, v_booking.id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking.id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'reason', v_reason)
      || private.trainer_name(v_booking.trainer_id),
    v_booking.client_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
  return v_status;
end $$;

comment on function public.decide_booking(uuid, boolean, text) is
  'Trainer: confirms or declines a booking request before the session starts; the client gets one message and a '
  'declined request frees its slot. Returns the new status.';
revoke all on function public.decide_booking(uuid, boolean, text) from public, anon;
grant execute on function public.decide_booking(uuid, boolean, text) to authenticated;

-- The client takes back a request (PRD 2.6.5-6): no charge, the slot is offered again, and the trainer, who got
-- Т2, gets booking_cancelled_by_client. Raises request_not_found.
create function public.withdraw_booking_request(p_booking_id uuid)
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
  if v_session.kind = 'personal' then
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

comment on function public.withdraw_booking_request(uuid) is
  'Client: takes back a booking request without consequences; the slot is offered again and the trainer is told.';
revoke all on function public.withdraw_booking_request(uuid) from public, anon;
grant execute on function public.withdraw_booking_request(uuid) to authenticated;

-- Requests still unanswered when their session starts expire (PRD 2.6.4-5); the client gets К4. Every five
-- minutes, so a request expires at most five minutes after the start.
create function private.expire_booking_requests()
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
    if v_row.kind = 'personal' then
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

comment on function private.expire_booking_requests() is
  'Job: requests unanswered by the session start become expired, their personal session is cancelled and the '
  'client gets booking_expired. Returns how many expired.';
revoke all on function private.expire_booking_requests() from public;
select cron.schedule('booking-requests-expire', '*/5 * * * *', 'select private.expire_booking_requests()');

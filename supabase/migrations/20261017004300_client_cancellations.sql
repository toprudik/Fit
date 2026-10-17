-- Client cancellations and reschedules, paid trials and the trial pair becoming active (PRD 2.6.5, 2.6.6, 2.3-6;
-- data-model §3.3 "Правило дедлайна", §2.1 pair statuses rule 8).
--   * cancel_my_booking: free until the trainer's deadline, later a late cancellation that takes a session (К8);
--   * reschedule_preview / reschedule_my_booking: before the deadline, the old booking becomes rescheduled and
--     a new one is made on a free slot by the booking rules; the trainer gets one message;
--   * post_charge: a trial never takes a session from a pass; a paid trial is charged from a drop-in pass of the
--     link's price, made when the trial is charged;
--   * a trial pair becomes active after an attended trial or a pass sale.

-- When a free cancellation of this booking ends: the session start minus the trainer's current deadline
-- (R19, R20: no snapshot, one rule per trainer). The boundary itself is still free.
create function private.cancel_deadline(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s.starts_at - pg_catalog.make_interval(hours => t.cancellation_deadline_hours)
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.trainer_profiles t on t.user_id = b.trainer_id
  where b.id = p_booking_id
$$;

comment on function private.cancel_deadline(uuid) is
  'End of free cancellation for a booking: session start minus the trainer''s cancellation_deadline_hours.';
revoke all on function private.cancel_deadline(uuid) from public;

-- A confirmed future booking of the caller, locked, with a scheduled session. Raises booking_not_found.
create function private.own_client_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.client_id = auth.uid() and b.status = 'confirmed'
  for update;
  if v_booking.id is null or not exists (
    select 1 from public.sessions s
    where s.id = v_booking.session_id and s.status = 'scheduled' and s.starts_at > pg_catalog.now()
  ) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  return v_booking;
end $$;

revoke all on function private.own_client_booking(uuid) from public;

-- The client cancels a confirmed booking before the start (PRD 2.6.5). Until the deadline it is free; after it
-- the booking is late_cancelled and takes a session now (К8 to the client). A late cancellation needs p_late,
-- the client's yes to "Будет списано 1 занятие" (2.6.5-3); without it the call raises late_cancel and changes
-- nothing. A personal or trial session is cancelled with it and its slot is offered again; a group keeps going
-- with one seat more. The trainer gets Т3. Returns the new status. Raises booking_not_found, late_cancel or
-- invalid_reason.
create function public.cancel_my_booking(p_booking_id uuid, p_reason text default null, p_late boolean default false)
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
  v_deadline timestamptz;
  v_late boolean;
  v_status public.booking_status;
  v_charge uuid;
begin
  v_booking := private.own_client_booking(p_booking_id);
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id for update;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  v_deadline := private.cancel_deadline(v_booking.id);
  v_late := pg_catalog.now() > v_deadline;
  if v_late and not coalesce(p_late, false) then
    raise exception 'late_cancel' using errcode = 'P0001', detail = 'the free cancellation has ended';
  end if;
  v_status := case when v_late then 'late_cancelled' else 'cancelled' end::public.booking_status;

  update public.bookings b
  set status = v_status, cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'client',
      cancel_reason = v_reason
  where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, 'confirmed', v_status, v_user, 'client', v_reason,
          pg_catalog.jsonb_build_object(
            'deadline_at', v_deadline,
            'deadline_hours', (select t.cancellation_deadline_hours from public.trainer_profiles t
                               where t.user_id = v_booking.trainer_id)));

  if v_late then
    v_charge := private.post_charge(v_booking.id, 'late_cancel');
    if v_charge is not null then
      perform private.notify_charge(v_charge, 'charge_posted');
    end if;
  end if;
  if v_session.kind <> 'group' then
    perform private.drop_request_session(v_session.id, v_user, v_reason);
  end if;

  perform private.enqueue_notification(
    'booking_cancelled_by_client',
    'booking_cancelled_by_client:' || v_booking.id,
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking.id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'late', v_late,
      'reason', v_reason)
      || private.person_name(v_booking.client_id),
    v_booking.trainer_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
  return v_status;
end $$;

comment on function public.cancel_my_booking(uuid, text, boolean) is
  'Client: cancels a confirmed booking before the start; free until the trainer''s deadline, later a late '
  'cancellation that takes a session (needs p_late). Returns the new status.';
revoke all on function public.cancel_my_booking(uuid, text, boolean) from public, anon;
grant execute on function public.cancel_my_booking(uuid, text, boolean) to authenticated;

-- A booking the client may move (PRD 2.6.5): confirmed, personal, not a trial, before the deadline, and a free
-- slot of the same trainer that is not its own. Raises booking_not_found, deadline_passed or slot_unavailable.
create function private.reschedulable(p_booking_id uuid, p_slot_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_slot public.slots;
begin
  v_booking := private.own_client_booking(p_booking_id);
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_session.kind <> 'personal' or v_booking.source = 'trial' then
    raise exception 'booking_not_found' using errcode = 'P0002', detail = 'only a personal booking can be moved';
  end if;
  if pg_catalog.now() > private.cancel_deadline(v_booking.id) then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  v_slot := private.bookable_slot(p_slot_id);
  if v_slot.trainer_id <> v_booking.trainer_id or v_slot.id = v_session.slot_id then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  return v_booking;
end $$;

revoke all on function private.reschedulable(uuid, uuid) from public;

-- What moving the booking to this slot would give, as booking_preview does, but with the old booking's pass
-- reservation freed first: the old booking is marked rescheduled inside a block that is always rolled back.
create function public.reschedule_preview(p_booking_id uuid, p_slot_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_slot public.slots;
  v_confirmed boolean;
  v_pass uuid;
  v_left integer;
begin
  v_booking := private.reschedulable(p_booking_id, p_slot_id);
  select s.* into v_slot from public.slots s where s.id = p_slot_id;
  begin
    update public.bookings b set status = 'rescheduled' where b.id = v_booking.id;
    select d.confirmed, d.pass_id into v_confirmed, v_pass
    from private.booking_auto_confirm(v_booking.coaching_id, 'personal', v_slot.starts_at) d;
    select pb.available - 1 into v_left from public.pass_balances pb where pb.pass_id = v_pass;
    raise exception 'preview_rollback';
  exception when raise_exception then
    if sqlerrm <> 'preview_rollback' then
      raise;
    end if;
  end;
  return query select v_confirmed, (select p.title from public.passes p where p.id = v_pass), v_left;
end $$;

comment on function public.reschedule_preview(uuid, uuid) is
  'Client: whether moving a booking to this slot would be confirmed, and the pass it would use, counting the old '
  'booking as moved.';
revoke all on function public.reschedule_preview(uuid, uuid) from public, anon;
grant execute on function public.reschedule_preview(uuid, uuid) to authenticated;

-- The client moves a booking before the deadline (PRD 2.6.5): the old booking becomes rescheduled, its session
-- is cancelled and its slot offered again, and book_slot makes the new booking by the booking rules (confirmed
-- or a request). The trainer gets one message instead of book_slot's: booking_rescheduled for a confirmed
-- booking, or Т2 with rescheduled_from for a request. Returns the new booking and its status. Raises
-- booking_not_found, deadline_passed, slot_unavailable or too_late.
create function public.reschedule_my_booking(p_booking_id uuid, p_slot_id uuid)
returns table (booking_id uuid, status public.booking_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
  v_new uuid;
  v_status public.booking_status;
begin
  perform 1 from public.slots s where s.id = p_slot_id for update;
  v_booking := private.reschedulable(p_booking_id, p_slot_id);
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id for update;

  update public.bookings b
  set status = 'rescheduled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'client'
  where b.id = v_booking.id;
  perform private.drop_request_session(v_session.id, v_user, null);

  select r.booking_id, r.status into v_new, v_status from public.book_slot(p_slot_id) r;
  update public.bookings b set rescheduled_to_id = v_new where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking.id, 'confirmed', 'rescheduled', v_user, 'client',
          pg_catalog.jsonb_build_object('rescheduled_to', v_new, 'deadline_at', private.cancel_deadline(v_booking.id)));

  -- book_slot queued Т1 or Т2 for the new booking; it becomes the one message about the move.
  update public.notification_outbox o
  set payload = o.payload || pg_catalog.jsonb_build_object('rescheduled_from', v_session.starts_at),
      type = case when v_status = 'confirmed' then 'booking_rescheduled' else o.type end,
      dedupe_key = case when v_status = 'confirmed' then 'booking_rescheduled:' || v_booking.id else o.dedupe_key end
  where o.booking_id = v_new and o.type in ('booking_created', 'booking_requested') and o.status = 'pending';

  return query select v_new, v_status;
end $$;

comment on function public.reschedule_my_booking(uuid, uuid) is
  'Client: moves a confirmed personal booking to another free slot before the deadline; the new booking follows '
  'the booking rules and the trainer gets one message. Returns the new booking and its status.';
revoke all on function public.reschedule_my_booking(uuid, uuid) from public, anon;
grant execute on function public.reschedule_my_booking(uuid, uuid) to authenticated;

-- Charges: a trial never takes a session from a pass. A free trial creates no ledger row; a paid one is charged
-- from a drop-in pass of the link's price and currency (data-model §3.3 "Платное пробное"), made here, so a
-- trial that is withdrawn or declined leaves nothing to pay. Otherwise unchanged from 20261016235100_charges.
create or replace function private.post_charge(p_booking_id uuid, p_reason public.charge_reason)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_link    public.trial_links;
  v_charge  uuid;
  v_pass    uuid;
  v_left    integer;
  v_amount  bigint;
  v_currency public.currency_code;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_session from public.sessions s where s.id = v_booking.session_id;
  select e.id into v_charge from public.ledger_entries e where e.booking_id = p_booking_id and e.entry_type = 'charge';
  if v_charge is not null then
    return v_charge;
  end if;

  if v_booking.source = 'trial' then
    select l.* into v_link from public.trial_links l
    where l.id = coalesce(v_session.trial_link_id,
                          (select c.trial_link_id from public.coachings c where c.id = v_booking.coaching_id));
    if coalesce(v_link.price_minor, 0) = 0 then
      return null;
    end if;
    perform pg_catalog.set_config('dafit.trial_drop_in', 'on', true);
    insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, applies_to, is_drop_in,
                               starts_on)
    values (v_booking.coaching_id, v_link.title, 1, v_link.price_minor, v_link.currency, 'personal', true,
            (v_session.starts_at at time zone private.trainer_zone(v_booking.trainer_id))::date)
    returning id into v_pass;
    perform pg_catalog.set_config('dafit.trial_drop_in', 'off', true);
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
    values (v_booking.coaching_id, 'grant', v_pass, 1, 0, pg_catalog.now());
  else
    -- Two charges may pick the same last session of a pass at once: lock the pass, check it still has one, and
    -- pick again otherwise. Each statement in READ COMMITTED sees what the other transaction committed meanwhile.
    for i in 1..3 loop
      v_pass := private.pick_pass(v_booking.coaching_id, v_session.kind, v_session.starts_at, v_booking.reserved_pass_id);
      exit when v_pass is null;
      perform 1 from public.passes p where p.id = v_pass for no key update;
      select coalesce(sum(e.sessions_delta), 0)::integer into v_left from public.ledger_entries e where e.pass_id = v_pass;
      exit when v_left > 0;
      v_pass := null;
    end loop;
  end if;

  if v_pass is not null then
    select private.pass_next_share(v_pass), p.currency into v_amount, v_currency from public.passes p where p.id = v_pass;
  else
    select d.amount_minor, d.currency into v_amount, v_currency from private.drop_in_price(v_booking.trainer_id, v_session.kind) d;
  end if;

  insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, sessions_delta, amount_minor, currency,
                                     charge_reason, occurred_at)
  values (v_booking.coaching_id, 'charge', v_pass, v_booking.id, -1, coalesce(v_amount, 0),
          case when coalesce(v_amount, 0) = 0 and v_pass is null then null else v_currency end,
          p_reason, v_session.starts_at)
  returning id into v_charge;
  return v_charge;
end $$;

comment on function private.post_charge(uuid, public.charge_reason) is
  'Charges a booking once: its reserved pass, the pass the choice rule picks, or debt at the drop-in price; a '
  'free trial is not charged, a paid one is charged from a drop-in pass of the link''s price. Returns the charge '
  '(null for a free trial).';

-- A trial pair becomes active after an attended trial or a pass sale (data-model §2.1, rule 8). The drop-in
-- pass of a paid trial does not count: post_charge makes it also for a no-show or a late cancellation.
create function private.activate_trial_pair(p_coaching_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.coachings c set status = 'active' where c.id = p_coaching_id and c.status = 'trial'
$$;

revoke all on function private.activate_trial_pair(uuid) from public;

create function private.passes_activate_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('dafit.trial_drop_in', true), 'off') <> 'on' then
    perform private.activate_trial_pair(new.coaching_id);
  end if;
  return null;
end $$;

comment on function private.passes_activate_pair() is 'Trigger: a pass sale makes a trial pair active.';
revoke all on function private.passes_activate_pair() from public;

create trigger passes_activate_pair
  after insert on public.passes
  for each row execute function private.passes_activate_pair();

create function private.bookings_activate_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.activate_trial_pair(new.coaching_id);
  return null;
end $$;

comment on function private.bookings_activate_pair() is 'Trigger: an attended trial makes its trial pair active.';
revoke all on function private.bookings_activate_pair() from public;

create trigger bookings_activate_pair
  after insert or update of status on public.bookings
  for each row
  when (new.status = 'attended' and new.source = 'trial')
  execute function private.bookings_activate_pair();

-- Pairs that are still trial although their trial was attended or a pass was sold before this migration.
update public.coachings c set status = 'active'
where c.status = 'trial'
  and (exists (select 1 from public.bookings b where b.coaching_id = c.id and b.source = 'trial' and b.status = 'attended')
       or exists (select 1 from public.passes p where p.coaching_id = c.id and not p.is_drop_in));

-- The trainer takes one participant off a future group session (PRD 2.6.3-4, 2.6.5): the rest of the group keeps
-- its seats. As with cancel_session (20261016204500_schedule_sessions.sql) the booking is cancelled by the trainer,
-- never charged, the reason is required, and the client gets booking_cancelled_by_trainer, here with booking_only so
-- the text speaks of their booking and not the whole session. The freed seat goes to the waitlist through the
-- bookings trigger of 20261017003700_waitlist.sql. An assistant with the schedule scope may do it too; its row in
-- booking_events is marked delegate by the trigger of 20261017090713_delegations.sql.

create function public.cancel_participant(p_booking_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_booking public.bookings;
  v_session public.sessions;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_booking.id is null or v_session.kind <> 'group' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now() or v_booking.status not in ('requested', 'confirmed')
     or not private.can_manage_session(v_session.id, 'schedule') then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.bookings b
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'trainer',
      cancel_reason = v_reason
  where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, v_booking.status, 'cancelled', v_user, 'trainer', v_reason, '{}');

  perform private.enqueue_notification(
    'booking_cancelled_by_trainer',
    pg_catalog.format('booking_cancelled_by_trainer:booking:%s', v_booking.id),
    pg_catalog.jsonb_build_object('session_id', v_session.id, 'dates', pg_catalog.jsonb_build_array(v_session.starts_at),
                                  'reason', v_reason, 'booking_only', true)
      || private.trainer_name(v_session.trainer_id),
    v_booking.client_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
end $$;

comment on function public.cancel_participant(uuid, text) is
  'Trainer: cancels one participant''s booking on a future group session without a charge, with a reason; the '
  'client is told and the seat goes to the waitlist.';
revoke all on function public.cancel_participant(uuid, text) from public, anon;
grant execute on function public.cancel_participant(uuid, text) to authenticated;

-- К2 says how a confirmed request is paid (PRD wave-1 §3 К2): decide_booking adds to the booking_confirmed payload
-- 'pay' = 'pass' (with 'pass_title'), 'single' for a one-session pass, or 'debt' when no pass fits; a trial keeps
-- no 'pay', its price comes from the trial link. The body is that of 20261016234300_trial_booking.sql.

create or replace function public.decide_booking(p_booking_id uuid, p_accept boolean, p_reason text default null)
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
  v_pass uuid;
  v_status public.booking_status;
  v_pay jsonb := '{}'::jsonb;
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
    if v_session.kind <> 'trial' then
      select d.pass_id into v_pass
      from private.booking_auto_confirm(v_booking.coaching_id, v_session.kind, v_session.starts_at) d;
    end if;
    update public.bookings b
    set status = 'confirmed', confirmed_at = pg_catalog.now(), decided_by = v_user, reserved_pass_id = v_pass
    where b.id = v_booking.id;
    if v_session.kind <> 'trial' then
      v_pay := coalesce(
        (select pg_catalog.jsonb_build_object(
                  'pay', case when p.is_drop_in or p.sessions_total = 1 then 'single' else 'pass' end, 'pass_title', p.title)
         from public.passes p where p.id = v_pass),
        '{"pay": "debt"}');
    end if;
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
      || v_pay || private.trainer_name(v_booking.trainer_id),
    v_booking.client_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
  return v_status;
end $$;

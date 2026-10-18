-- The trainer marks a booking as a single session (PRD wave-1 §2.8-12, §2.6.4-6): when assigning a session or
-- confirming a request, instead of the pass rule or debt. It gets its own drop-in pass of one session at the
-- drop-in price, valid on the session's day only and reserved for the booking, so the charge comes off it by the
-- usual rules (late cancellation and no-show too). The payment is marked on that pass separately. It settles no
-- old debt, unlike a pass sale.

-- The drop-in pass of a confirmed future booking that is not charged yet; the caller holds the booking row and
-- has checked the trainer. Raises booking_not_single or pass_invalid. Returns the pass.
create function private.make_single(p_booking public.bookings, p_title text, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_tz text;
  v_day date;
  v_amount bigint;
  v_currency public.currency_code;
  v_pass uuid;
begin
  select s.* into v_session from public.sessions s where s.id = p_booking.session_id;
  if p_booking.status <> 'confirmed' or v_session.kind = 'trial' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now()
     or exists (select 1 from public.ledger_entries e where e.booking_id = p_booking.id and e.entry_type = 'charge')
     or exists (select 1 from public.passes p where p.id = p_booking.reserved_pass_id and p.is_drop_in) then
    raise exception 'booking_not_single' using errcode = 'P0001';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) > 120 then
    raise exception 'pass_invalid' using errcode = '22023';
  end if;

  v_tz := private.trainer_zone(p_booking.trainer_id);
  v_day := (v_session.starts_at at time zone v_tz)::date;
  select d.amount_minor, d.currency into v_amount, v_currency from private.drop_in_price(p_booking.trainer_id, v_session.kind) d;
  insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, applies_to, is_drop_in,
                             starts_on, expires_at)
  values (p_booking.coaching_id, v_title, 1, coalesce(v_amount, 0), v_currency,
          case when v_session.kind = 'group' then 'group' else 'personal' end::public.package_applies_to, true, v_day,
          private.pass_end_instant(v_day, v_tz))
  returning id into v_pass;
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
  values (p_booking.coaching_id, 'grant', v_pass, 1, 0, pg_catalog.now());

  update public.bookings b set reserved_pass_id = v_pass where b.id = p_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (p_booking.id, 'confirmed', 'confirmed', p_actor, 'trainer',
          pg_catalog.jsonb_build_object('single', true, 'pass_id', v_pass));
  return v_pass;
end $$;

revoke all on function private.make_single(public.bookings, text, uuid) from public;

create function public.make_booking_single(p_booking_id uuid, p_title text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or not private.is_coaching_trainer(v_booking.coaching_id, 'passes') then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  return private.make_single(v_booking, p_title, auth.uid());
end $$;

comment on function public.make_booking_single(uuid, text) is
  'Trainer: a confirmed future booking, not charged yet, becomes a single session paid apart: a drop-in pass of '
  'one session at the drop-in price for that day, reserved for it. Returns the pass. Raises booking_not_found, '
  'booking_not_single or pass_invalid.';
revoke all on function public.make_booking_single(uuid, text) from public, anon;
grant execute on function public.make_booking_single(uuid, text) to authenticated;

-- "Подтвердить как разовое" (PRD 2.6.4-6): decide_booking gets p_single, so the request is made single before
-- К2 goes out and the message says pay = 'single'. The rest of the body is that of
-- 20261018070113_request_confirmed_pay.sql. The new parameters have defaults, so old calls keep working.
drop function public.decide_booking(uuid, boolean, text);

create function public.decide_booking(
  p_booking_id uuid,
  p_accept boolean,
  p_reason text default null,
  p_single boolean default false,
  p_single_title text default null
)
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
  v_single boolean := coalesce(p_accept, false) and coalesce(p_single, false);
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
  if v_single and not private.is_coaching_trainer(v_booking.coaching_id, 'passes') then
    raise exception 'request_not_found' using errcode = 'P0001', detail = 'a single session needs the passes scope';
  end if;

  if coalesce(p_accept, false) then
    v_status := 'confirmed';
    if v_session.kind <> 'trial' and not v_single then
      select d.pass_id into v_pass
      from private.booking_auto_confirm(v_booking.coaching_id, v_session.kind, v_session.starts_at) d;
    end if;
    update public.bookings b
    set status = 'confirmed', confirmed_at = pg_catalog.now(), decided_by = v_user, reserved_pass_id = v_pass
    where b.id = v_booking.id
    returning b.* into v_booking;
  else
    v_status := 'declined';
    update public.bookings b set status = 'declined', decided_by = v_user, cancel_reason = v_reason
    where b.id = v_booking.id;
    perform private.drop_request_session(v_session.id, v_user, v_reason);
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, 'requested', v_status, v_user, 'trainer', v_reason, '{}');
  if v_single then
    v_pass := private.make_single(v_booking, p_single_title, v_user);
  end if;
  if v_status = 'confirmed' and v_session.kind <> 'trial' then
    v_pay := coalesce(
      (select pg_catalog.jsonb_build_object(
                'pay', case when p.is_drop_in or p.sessions_total = 1 then 'single' else 'pass' end, 'pass_title', p.title)
       from public.passes p where p.id = v_pass),
      '{"pay": "debt"}');
  end if;

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

comment on function public.decide_booking(uuid, boolean, text, boolean, text) is
  'Trainer: confirms or declines a booking request before the session starts; with p_single the confirmed '
  'booking becomes a single session under the pass title p_single_title. The client gets one message and a '
  'declined request frees its slot. Returns the new status.';
revoke all on function public.decide_booking(uuid, boolean, text, boolean, text) from public, anon;
grant execute on function public.decide_booking(uuid, boolean, text, boolean, text) to authenticated;

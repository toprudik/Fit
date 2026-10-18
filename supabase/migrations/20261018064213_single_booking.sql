-- The trainer marks a booking as a single session (PRD wave-1 §2.8-12, §2.6.4-6): when assigning a session or
-- confirming a request, instead of the pass rule or debt. It gets its own drop-in pass of one session at the
-- drop-in price, valid on the session's day only and reserved for the booking, so the charge comes off it by the
-- usual rules (late cancellation and no-show too). The payment is marked on that pass separately. It settles no
-- old debt, unlike a pass sale.
create function public.make_booking_single(p_booking_id uuid, p_title text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_tz text;
  v_day date;
  v_amount bigint;
  v_currency public.currency_code;
  v_pass uuid;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or not private.is_coaching_trainer(v_booking.coaching_id, 'passes') then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_booking.status <> 'confirmed' or v_session.kind = 'trial' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now()
     or exists (select 1 from public.ledger_entries e where e.booking_id = v_booking.id and e.entry_type = 'charge')
     or exists (select 1 from public.passes p where p.id = v_booking.reserved_pass_id and p.is_drop_in) then
    raise exception 'booking_not_single' using errcode = 'P0001';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) > 120 then
    raise exception 'pass_invalid' using errcode = '22023';
  end if;

  v_tz := private.trainer_zone(v_booking.trainer_id);
  v_day := (v_session.starts_at at time zone v_tz)::date;
  select d.amount_minor, d.currency into v_amount, v_currency from private.drop_in_price(v_booking.trainer_id, v_session.kind) d;
  insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, applies_to, is_drop_in,
                             starts_on, expires_at)
  values (v_booking.coaching_id, v_title, 1, coalesce(v_amount, 0), v_currency,
          case when v_session.kind = 'group' then 'group' else 'personal' end::public.package_applies_to, true, v_day,
          private.pass_end_instant(v_day, v_tz))
  returning id into v_pass;
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
  values (v_booking.coaching_id, 'grant', v_pass, 1, 0, pg_catalog.now());

  update public.bookings b set reserved_pass_id = v_pass where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking.id, 'confirmed', 'confirmed', v_user, 'trainer',
          pg_catalog.jsonb_build_object('single', true, 'pass_id', v_pass));
  return v_pass;
end $$;

comment on function public.make_booking_single(uuid, text) is
  'Trainer: a confirmed future booking, not charged yet, becomes a single session paid apart: a drop-in pass of '
  'one session at the drop-in price for that day, reserved for it. Returns the pass. Raises booking_not_found, '
  'booking_not_single or pass_invalid.';
revoke all on function public.make_booking_single(uuid, text) from public, anon;
grant execute on function public.make_booking_single(uuid, text) to authenticated;

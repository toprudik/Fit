-- The booking sheet promised «это будет запрос» and the booking then refused with «У тебя уже есть запись без оплаты»
-- (QA 03.11, finding 50): past the client's debt limit private.booking_auto_confirm only sets
-- dafit.debt_limit_reached, and the bookings_debt_limit trigger refuses the insert (20261020104917_debt_booking_limit.sql),
-- but the previews never read the flag. booking_preview, group_booking_preview and reschedule_preview now raise
-- debt_limit as the booking would, so the sheet says it before the button. Bodies: booking_preview of
-- 20261023061127_booking_preview_unpaid.sql, the other two of 20261103073312_preview_unpaid_group_reschedule.sql.

create or replace function public.booking_preview(p_slot_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer, pass_unpaid boolean)
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
  if pg_catalog.current_setting('dafit.debt_limit_reached', true) = v_pair.id::text then
    raise exception 'debt_limit' using errcode = 'P0001';
  end if;
  return query
    select v_decision.confirmed, p.title, pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;

create or replace function public.group_booking_preview(p_session_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer, pass_unpaid boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_pair public.coachings;
  v_decision record;
begin
  v_session := private.bookable_group_session(p_session_id);
  v_pair := private.own_live_pair(v_session.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'group', v_session.starts_at);
  if pg_catalog.current_setting('dafit.debt_limit_reached', true) = v_pair.id::text then
    raise exception 'debt_limit' using errcode = 'P0001';
  end if;
  return query
    select v_decision.confirmed, p.title, pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;

-- The flag is local to the rolled-back block, so it is read inside it.
create or replace function public.reschedule_preview(p_booking_id uuid, p_slot_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer, pass_unpaid boolean)
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
  v_unpaid boolean;
  v_limit boolean;
begin
  v_booking := private.reschedulable(p_booking_id, p_slot_id);
  select s.* into v_slot from public.slots s where s.id = p_slot_id;
  begin
    update public.bookings b set status = 'rescheduled' where b.id = v_booking.id;
    select d.confirmed, d.pass_id into v_confirmed, v_pass
    from private.booking_auto_confirm(v_booking.coaching_id, 'personal', v_slot.starts_at) d;
    v_limit := pg_catalog.current_setting('dafit.debt_limit_reached', true) = v_booking.coaching_id::text;
    select pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0 into v_left, v_unpaid
    from public.pass_balances pb where pb.pass_id = v_pass;
    raise exception 'preview_rollback';
  exception when raise_exception then
    if sqlerrm <> 'preview_rollback' then
      raise;
    end if;
  end;
  if v_limit then
    raise exception 'debt_limit' using errcode = 'P0001';
  end if;
  return query select v_confirmed, (select p.title from public.passes p where p.id = v_pass), v_left, coalesce(v_unpaid, false);
end $$;

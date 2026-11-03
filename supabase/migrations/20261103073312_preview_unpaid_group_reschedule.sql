-- The «Абонемент ещё не оплачен» hint of the booking sheet (20261023061127_booking_preview_unpaid.sql) showed only for
-- personal slots (QA 03.11, bug 26): group_booking_preview and reschedule_preview gain pass_unpaid as well. Their
-- bodies are those of 20261016235700_group_sessions.sql and 20261017004300_client_cancellations.sql.

drop function public.group_booking_preview(uuid);

create function public.group_booking_preview(p_session_id uuid)
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
  return query
    select v_decision.confirmed, p.title, pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;

comment on function public.group_booking_preview(uuid) is
  'Client: whether booking this group session would be confirmed, the pass it would use with what is left, and '
  'whether that pass is not fully paid yet.';
revoke all on function public.group_booking_preview(uuid) from public, anon;
grant execute on function public.group_booking_preview(uuid) to authenticated;

drop function public.reschedule_preview(uuid, uuid);

create function public.reschedule_preview(p_booking_id uuid, p_slot_id uuid)
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
begin
  v_booking := private.reschedulable(p_booking_id, p_slot_id);
  select s.* into v_slot from public.slots s where s.id = p_slot_id;
  begin
    update public.bookings b set status = 'rescheduled' where b.id = v_booking.id;
    select d.confirmed, d.pass_id into v_confirmed, v_pass
    from private.booking_auto_confirm(v_booking.coaching_id, 'personal', v_slot.starts_at) d;
    select pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0 into v_left, v_unpaid
    from public.pass_balances pb where pb.pass_id = v_pass;
    raise exception 'preview_rollback';
  exception when raise_exception then
    if sqlerrm <> 'preview_rollback' then
      raise;
    end if;
  end;
  return query select v_confirmed, (select p.title from public.passes p where p.id = v_pass), v_left, coalesce(v_unpaid, false);
end $$;

comment on function public.reschedule_preview(uuid, uuid) is
  'Client: whether moving a booking to this slot would be confirmed, the pass it would use counting the old '
  'booking as moved, and whether that pass is not fully paid yet.';
revoke all on function public.reschedule_preview(uuid, uuid) from public, anon;
grant execute on function public.reschedule_preview(uuid, uuid) to authenticated;

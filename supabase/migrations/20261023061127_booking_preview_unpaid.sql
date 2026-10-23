-- The confirm sheet of /client/book says when the pass a booking would use is not paid yet (QA 23.10): such a
-- booking is allowed (Q22: an unpaid pass is not a debt), but the client should know to pay the trainer.
-- booking_preview gains pass_unpaid; the rest is the body of 20261016221900_client_bookings.sql.

drop function public.booking_preview(uuid);

create function public.booking_preview(p_slot_id uuid)
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
  return query
    select v_decision.confirmed, p.title, pb.available - 1, coalesce(pb.unpaid_minor, 0) > 0
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;
comment on function public.booking_preview(uuid) is
  'Client: whether booking this slot would be confirmed, the pass it would use with the sessions left after it, '
  'and whether that pass is not fully paid yet.';
revoke all on function public.booking_preview(uuid) from public, anon;
grant execute on function public.booking_preview(uuid) to authenticated;

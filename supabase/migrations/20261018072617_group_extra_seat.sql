-- Out of turn into a full group (PRD wave-2 §9-7): the trainer adds a client to a group session with no free seat,
-- the session gets one more seat for them. A queue entry of that client for the session is accepted with the booking.

-- Trainer: like add_group_participant, but a full session first grows by one seat (at most 100). Raises what
-- add_group_participant raises, and session_full at 100 seats.
create function public.add_group_participant_extra(p_session_id uuid, p_coaching_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_booking_id uuid;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id for update;
  if v_session.id is null or v_session.kind <> 'group' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now() or not private.acts_for_trainer(v_session.trainer_id, 'schedule') then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.bookings b
      where b.session_id = v_session.id and b.status in ('requested', 'confirmed', 'attended', 'no_show')) >= v_session.capacity then
    if v_session.capacity >= 100 then
      raise exception 'session_full' using errcode = 'P0001';
    end if;
    update public.sessions s set capacity = s.capacity + 1 where s.id = v_session.id;
  end if;
  v_booking_id := public.add_group_participant(p_session_id, p_coaching_id);
  update public.waitlist_entries w
  set status = 'accepted', resolved_at = pg_catalog.now(), booking_id = v_booking_id
  where w.session_id = v_session.id and w.coaching_id = p_coaching_id and w.status in ('waiting', 'offered');
  return v_booking_id;
end $$;

comment on function public.add_group_participant_extra(uuid, uuid) is
  'Trainer: books a client on a future group session out of turn; a full session gets one more seat (PRD wave-2 §9-7).';
revoke all on function public.add_group_participant_extra(uuid, uuid) from public, anon;
grant execute on function public.add_group_participant_extra(uuid, uuid) to authenticated;

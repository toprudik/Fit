-- The trainer's "сверх группы" booking no longer takes a seat that the queue has offered to another client
-- (docs/qa/production-readiness.md §3): seats held by open offers of other pairs count as taken, as in
-- private.group_free_seats, so the session gets one more seat and the offered client can still accept. Body from
-- 20261018072617_group_extra_seat.sql.

create or replace function public.add_group_participant_extra(p_session_id uuid, p_coaching_id uuid)
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
  -- A seat offered to another client of the queue is held for them; the client's own offer is theirs to take.
  if (select count(*) from public.bookings b
      where b.session_id = v_session.id and b.status in ('requested', 'confirmed', 'attended', 'no_show'))
     + (select count(*) from public.waitlist_entries w
        where w.session_id = v_session.id and w.status = 'offered' and w.offer_expires_at > pg_catalog.now()
          and w.coaching_id <> p_coaching_id) >= v_session.capacity then
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
  'Trainer: books a client on a future group session out of turn; a full session gets one more seat, and seats '
  'offered to other clients of the queue count as taken (PRD wave-2 §9-7).';
revoke all on function public.add_group_participant_extra(uuid, uuid) from public, anon;
grant execute on function public.add_group_participant_extra(uuid, uuid) to authenticated;

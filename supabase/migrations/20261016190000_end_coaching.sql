-- Ending a pair (PRD wave-1 §2.5, §2.12-5 PRIV-5, CONTEXT "Пара"): public.end_coaching, which either side calls.
-- Archiving a client, notes and the debt booking switch need no RPC: the trainer writes them directly under
-- the policies of 20261015123200_pairs_policies.sql.

-- Ends a live pair for the caller, who must be its trainer or its client, in one transaction:
--   1. the pair becomes ended with the time, the caller and the optional reason; an ended pair stays as it is;
--   2. future bookings of the pair (requested or confirmed, the session not started yet) are cancelled without
--      a charge, as a cancellation by the side that ends the pair (PRIV-5), each with a booking_events row;
--   3. a future personal or trial session left without a live booking is cancelled too, and the pair's
--      repeats stop, so no new session is made for a pair that is over;
--   4. the other side gets a bot message (Т9 when the client ends it; cards get nothing, enqueue skips them).
-- History stays: sessions held, passes, the ledger and payments remain visible to both sides, and the trainer
-- keeps the notes (R12). Data shares need no change: private.can_view opens data only while the pair is live.
-- Returns the number of cancelled bookings.
create function public.end_coaching(p_coaching_id uuid, p_reason text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_role public.actor_role;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_cancelled integer;
  v_other uuid;
  v_actor public.profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;

  -- The lock makes two ends of one pair (or an end and a join) run one after another.
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for update;
  if v_pair.id is null or v_user not in (v_pair.trainer_id, v_pair.client_id) then
    raise exception 'coaching_not_found' using errcode = 'P0001';
  end if;
  if v_pair.status = 'ended' then
    return 0;
  end if;
  v_role := case when v_user = v_pair.trainer_id then 'trainer'::public.actor_role else 'client'::public.actor_role end;

  update public.coachings c
  set status = 'ended', ended_at = pg_catalog.now(), ended_by = v_user, end_reason = v_reason
  where c.id = v_pair.id;

  -- cancel_reason is required for a cancellation by the trainer (PRD 2.6.5-4); here it is a fixed mark that
  -- the screens show as "the pair ended", and the reason itself stays on the pair.
  with future as (
    select b.id, b.status, b.session_id
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.coaching_id = v_pair.id and b.status in ('requested', 'confirmed') and s.starts_at > pg_catalog.now()
    for update of b
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = v_role,
        cancel_reason = 'coaching_ended'
    from future f
    where b.id = f.id
    returning b.id, f.status as from_status, b.session_id
  ), logged as (
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
    select x.id, x.from_status, 'cancelled', v_user, v_role, 'coaching_ended',
           pg_catalog.jsonb_build_object('coaching_id', v_pair.id)
    from cancelled x
    returning booking_id
  )
  select pg_catalog.count(*)::integer into v_cancelled from logged;

  -- A personal or trial session is only this pair's; a group session goes on for its other clients.
  update public.sessions s
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = 'coaching_ended'
  where s.trainer_id = v_pair.trainer_id and s.kind <> 'group' and s.status = 'scheduled'
    and s.starts_at > pg_catalog.now()
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.coaching_id = v_pair.id)
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled'));

  update public.recurrences r set ended_at = pg_catalog.now()
  where r.coaching_id = v_pair.id and r.ended_at is null;

  select p.* into v_actor from public.profiles p where p.id = v_user;
  v_other := case when v_role = 'trainer' then v_pair.client_id else v_pair.trainer_id end;
  perform private.enqueue_notification(
    'coaching_ended',
    pg_catalog.format('coaching_ended:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
    pg_catalog.jsonb_build_object('coaching_id', v_pair.id, 'ended_by', v_role, 'cancelled', v_cancelled,
                                  'first_name', v_actor.first_name, 'last_name', v_actor.last_name),
    v_other);

  return v_cancelled;
end $$;

comment on function public.end_coaching(uuid, text) is
  'The trainer or the client ends a live pair: future bookings are cancelled without a charge, lone future '
  'personal sessions and the pair repeats stop, and the other side gets coaching_ended. Returns the number of '
  'cancelled bookings; 0 for a pair that has already ended. Raises coaching_not_found for anyone else.';
revoke all on function public.end_coaching(uuid, text) from public, anon;
grant execute on function public.end_coaching(uuid, text) to authenticated;

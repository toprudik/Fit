-- The owner's journal of delegates showed what the client did themselves: a slot the client booked creates a
-- personal session with the client as its author, and a workout the client logged has the client as its author.
-- The journal now leaves out every entry whose actor is the pair's client (QA B7). Otherwise unchanged
-- (20261017142417_delegate_journal.sql).

drop function public.delegate_journal(uuid);
create function public.delegate_journal(p_coaching_id uuid default null)
returns table (at timestamptz, action text, delegate_name text, owner_name text, booking_id uuid,
               workout_log_id uuid, coaching_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with pairs as (
    select c.id, c.trainer_id, c.client_id from public.coachings c
    where c.trainer_id = auth.uid() and (p_coaching_id is null or c.id = p_coaching_id)
  ), entries as (
    select e.created_at as at, 'booking:' || e.to_status::text as action, e.actor_id as actor, p.trainer_id,
           e.booking_id, null::uuid as workout_log_id, p.id as coaching_id
    from pairs p
    join public.bookings b on b.coaching_id = p.id
    join public.booking_events e on e.booking_id = b.id and e.actor_role = 'delegate'
    union all
    select w.created_at, 'workout_log', w.created_by, p.trainer_id, null, w.id, p.id
    from pairs p join public.workout_logs w on w.coaching_id = p.id
    where w.created_by is not null and w.created_by <> p.trainer_id
    union all
    select n.created_at, 'note', n.author_id, p.trainer_id, null, null, p.id
    from pairs p join public.coaching_notes n on n.coaching_id = p.id
    where n.author_id is not null and n.author_id <> p.trainer_id
    union all
    select h.created_at, 'homework', h.created_by, p.trainer_id, null, null, p.id
    from pairs p join public.homework h on h.coaching_id = p.id
    where h.created_by is not null and h.created_by <> p.trainer_id
    union all
    select s.created_at, 'session:created', s.created_by, p.trainer_id, b.id, null, p.id
    from pairs p
    join public.bookings b on b.coaching_id = p.id
    join public.sessions s on s.id = b.session_id and s.kind <> 'group'
    where s.created_by is not null and s.created_by <> p.trainer_id
    union all
    select s.cancelled_at, 'session:cancelled', s.cancelled_by, p.trainer_id, b.id, null, p.id
    from pairs p
    join public.bookings b on b.coaching_id = p.id
    join public.sessions s on s.id = b.session_id and s.kind <> 'group'
    where s.cancelled_at is not null and s.cancelled_by is not null and s.cancelled_by <> p.trainer_id
  )
  select x.at, x.action, private.delegation_person(x.actor), private.delegation_person(x.trainer_id), x.booking_id,
         x.workout_log_id, x.coaching_id
  from entries x
  join pairs p on p.id = x.coaching_id
  -- What the client did themselves (a booked slot, a logged workout) is not a delegate's action.
  where x.actor is distinct from p.client_id
  order by x.at desc
  limit 200
$$;

revoke all on function public.delegate_journal(uuid) from public, anon;
grant execute on function public.delegate_journal(uuid) to authenticated;

-- The pair's journal of delegates (PRD wave-3 §1 rule 8, 1.9): besides attendance and workout logs, the owner
-- sees the notes, homework and personal sessions a delegate made or cancelled, «от имени <владельца>, выполнил
-- <делегат>». Without a pair it lists every pair of the owner, for «Команда».

-- Who assigned the homework: the column fills itself from the caller, so the homework functions stay as they are.
alter table public.homework
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;
create index homework_created_by_idx on public.homework (created_by) where created_by is not null;
comment on column public.homework.created_by is 'Who assigned it: the trainer or a delegate (PRD wave-3 §1 rule 8).';

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
    select c.id, c.trainer_id from public.coachings c
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
      and s.cancelled_by <> b.client_id
  )
  select x.at, x.action, private.delegation_person(x.actor), private.delegation_person(x.trainer_id), x.booking_id,
         x.workout_log_id, x.coaching_id
  from entries x
  order by x.at desc
  limit 200
$$;

revoke all on function public.delegate_journal(uuid) from public, anon;
grant execute on function public.delegate_journal(uuid) to authenticated;

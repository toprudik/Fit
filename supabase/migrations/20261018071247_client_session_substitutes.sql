-- The client sees who runs a session in their bookings (PRD wave-3 §1, client history). sessions.conducted_by
-- names the substitute, but the client cannot read that trainer's profile, so the name comes from here.

-- The substitutes of the caller's booked sessions: one row per session that has one, with the substitute's name.
create function public.my_session_substitutes(p_session_ids uuid[])
returns table (session_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, private.delegation_person(s.conducted_by)
  from public.sessions s
  where s.id = any (p_session_ids)
    and s.conducted_by is not null
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.client_id = (select auth.uid()))
$$;
comment on function public.my_session_substitutes(uuid[]) is
  'Who runs each of the given sessions instead of their trainer, for the caller''s own bookings only (PRD wave-3 §1).';
revoke all on function public.my_session_substitutes(uuid[]) from public, anon;
grant execute on function public.my_session_substitutes(uuid[]) to authenticated, service_role;

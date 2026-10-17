-- The session page of a substitute (PRD wave-3 §1, screens.md /trainer/team): a delegate reads the session and
-- its participants' names through this RPC, without access to the owner's sessions, pairs or profiles tables.

-- One session for its owner or for the trainer who substitutes on it now. Null for anyone else, and for the
-- substitute once the session has ended (1.5).
create function public.delegated_session(p_session_id uuid)
returns table (
  id uuid, owner_name text, kind public.session_kind, title text, starts_at timestamptz, ends_at timestamptz,
  mode public.session_mode, location text, participants jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, private.delegation_person(s.trainer_id), s.kind, s.title, s.starts_at, s.ends_at, s.mode,
         (select l.name from public.locations l where l.id = s.location_id),
         coalesce((
           select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                    'booking_id', b.id, 'coaching_id', b.coaching_id, 'status', b.status,
                    'name', coalesce(nullif(pg_catalog.btrim(m.client_alias), ''), private.delegation_person(b.client_id)))
                  order by b.created_at)
           from public.bookings b
           left join public.coaching_trainer_meta m on m.coaching_id = b.coaching_id
           where b.session_id = s.id and b.status in ('confirmed', 'attended', 'no_show')), '[]'::jsonb)
  from public.sessions s
  where s.id = p_session_id and auth.uid() is not null
    and (s.trainer_id = auth.uid() or private.substitutes_session(s.id))
$$;
comment on function public.delegated_session(uuid) is
  'A session and its participants for its owner or its current substitute (PRD wave-3 §1).';
revoke all on function public.delegated_session(uuid) from public, anon;
grant execute on function public.delegated_session(uuid) to authenticated;

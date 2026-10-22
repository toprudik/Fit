-- QA 22.10: a trainer who opened their own assistant invite saw the offer with «Принять» and «Отклонить», and
-- accepting did nothing they could see. delegation_invite now says whether the caller made the invite, so the
-- page shows «Это твоё приглашение» instead of the buttons.
--
-- As in 20261018010817_substitute_sessions.sql, plus own.
drop function public.delegation_invite(text);
create function public.delegation_invite(p_token text)
returns table (
  kind public.delegation_kind, owner_name text, scopes public.delegation_scope[], all_clients boolean,
  clients integer, session_starts_at timestamptz, ends_at timestamptz, sessions_starts_at timestamptz[],
  own boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
  v_starts timestamptz[];
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_delegation := private.pending_delegation(p_token);
  if v_delegation.kind = 'substitute' then
    select pg_catalog.array_agg(s.starts_at order by s.starts_at) into v_starts
    from private.invite_rows(v_delegation.id) r join public.sessions s on s.id = r.session_id
    where private.substitute_ahead(r.session_id);
  end if;
  return query
  select v_delegation.kind, private.delegation_person(v_delegation.owner_trainer_id), v_delegation.scopes,
         v_delegation.all_clients,
         (select pg_catalog.count(*)::integer from public.delegation_clients dc where dc.delegation_id = v_delegation.id),
         coalesce(v_starts[1], (select s.starts_at from public.sessions s where s.id = v_delegation.session_id)),
         v_delegation.ends_at,
         coalesce(v_starts, '{}'),
         v_delegation.owner_trainer_id = auth.uid();
end $$;
revoke all on function public.delegation_invite(text) from public, anon;
grant execute on function public.delegation_invite(text) to authenticated;

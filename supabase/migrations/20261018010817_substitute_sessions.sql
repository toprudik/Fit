-- A substitute for several sessions at once (PRD wave-3 §1, model: «одно занятие (или несколько выбранных)»).
--
-- The owner picks future sessions and gets one invite for all of them. Each session keeps its own substitute row,
-- so access, the participants' messages, the two-hour reminder and revoking still work per session as in
-- 20261017090713_delegations.sql. The row of the earliest session holds the invite token; the others point to it
-- with lead_id. Accepting or declining the token answers for every session of the invite that is still ahead.

alter table public.delegations
  add column lead_id uuid references public.delegations (id) on delete cascade,
  add constraint delegations_lead_check check (lead_id is null or (kind = 'substitute' and invite_hash is null));
comment on column public.delegations.lead_id is
  'For a substitute invited together with other sessions: the row that holds the shared invite token.';
create index delegations_lead_idx on public.delegations (lead_id) where lead_id is not null;

-- The owner creates one invite for 2 to 20 of their future sessions; returns the row holding the token, like
-- create_delegation. Raises plan_required, session_not_found, already_delegated, invalid_sessions.
create function public.create_substitutions(p_session_ids uuid[])
returns table (delegation_id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_ids uuid[];
  v_token text := pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), '=');
  v_lead uuid;
  v_session record;
begin
  if v_owner is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.has_entitlement(v_owner, 'trainer.delegation') then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  select pg_catalog.array_agg(distinct x.id) into v_ids from pg_catalog.unnest(p_session_ids) x (id) where x.id is not null;
  if v_ids is null or cardinality(v_ids) < 2 or cardinality(v_ids) > 20 then
    raise exception 'invalid_sessions' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from public.sessions s
      where s.id = any (v_ids) and s.trainer_id = v_owner and s.status = 'scheduled' and s.starts_at > pg_catalog.now())
     <> cardinality(v_ids) then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  -- Lock the sessions so two invites cannot take the same one.
  perform 1 from public.sessions s where s.id = any (v_ids) for update;
  if exists (select 1 from public.delegations d where d.session_id = any (v_ids) and d.status in ('pending', 'active')) then
    raise exception 'already_delegated' using errcode = 'P0001';
  end if;

  for v_session in
    select s.id, s.ends_at from public.sessions s where s.id = any (v_ids) order by s.starts_at, s.id
  loop
    if v_lead is null then
      insert into public.delegations (owner_trainer_id, kind, session_id, scopes, ends_at, invite_hash)
      values (v_owner, 'substitute', v_session.id, private.delegation_scopes('substitute', null), v_session.ends_at,
              extensions.digest(v_token, 'sha256'))
      returning id into v_lead;
    else
      insert into public.delegations (owner_trainer_id, kind, session_id, scopes, ends_at, lead_id)
      values (v_owner, 'substitute', v_session.id, private.delegation_scopes('substitute', null), v_session.ends_at, v_lead);
    end if;
  end loop;
  return query select v_lead, v_token;
end $$;
comment on function public.create_substitutions(uuid[]) is
  'The owner trainer asks one substitute for several future sessions; returns the invite''s row id and its one-time '
  'token (PRD wave-3 §1).';
revoke all on function public.create_substitutions(uuid[]) from public, anon;
grant execute on function public.create_substitutions(uuid[]) to authenticated;

-- The pending rows an invite answers for: the row with the token and those that point to it.
create function private.invite_rows(p_lead uuid)
returns setof public.delegations
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from public.delegations d
  where (d.id = p_lead or d.lead_id = p_lead) and d.status = 'pending'
$$;
revoke all on function private.invite_rows(uuid) from public;

-- Whether a pending substitute row can still be taken: its session is scheduled and ahead.
create function private.substitute_ahead(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sessions s
                 where s.id = p_session_id and s.status = 'scheduled' and s.starts_at > pg_catalog.now())
$$;
revoke all on function private.substitute_ahead(uuid) from public;

-- As in 20261017090713_delegations.sql, but an invite for several sessions lives while any of them is ahead.
create or replace function private.pending_delegation(p_token text)
returns public.delegations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
begin
  select d.* into v_delegation from public.delegations d
  where d.invite_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and d.status = 'pending'
  for update;
  if v_delegation.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.delegations d where d.lead_id = v_delegation.id and d.status = 'pending' for update;
  if (v_delegation.kind = 'substitute' and not exists (
        select 1 from private.invite_rows(v_delegation.id) r where private.substitute_ahead(r.session_id)))
     or (v_delegation.kind = 'assistant' and v_delegation.ends_at is not null and v_delegation.ends_at <= pg_catalog.now()) then
    update public.delegations set status = 'expired', invite_hash = null
    where (id = v_delegation.id or lead_id = v_delegation.id) and status = 'pending';
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  return v_delegation;
end $$;

-- As in 20261017090713_delegations.sql, plus every session of the invite that is still ahead, earliest first;
-- session_starts_at is the first of them.
drop function public.delegation_invite(text);
create function public.delegation_invite(p_token text)
returns table (
  kind public.delegation_kind, owner_name text, scopes public.delegation_scope[], all_clients boolean,
  clients integer, session_starts_at timestamptz, ends_at timestamptz, sessions_starts_at timestamptz[]
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
         coalesce(v_starts, '{}');
end $$;
revoke all on function public.delegation_invite(text) from public, anon;
grant execute on function public.delegation_invite(text) to authenticated;

-- As in 20261017090713_delegations.sql, for every row of the invite: a session still ahead gets the substitute
-- and its participants are told; one that started or was cancelled meanwhile expires. The owner gets one message.
create or replace function public.accept_delegation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.delegations;
  v_delegation public.delegations;
  v_client record;
  v_starts timestamptz;
  v_first timestamptz;
  v_taken integer := 0;
begin
  if v_user is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trainer_profiles t where t.user_id = v_user and t.verification_status = 'verified') then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;
  v_lead := private.pending_delegation(p_token);
  if v_lead.owner_trainer_id = v_user then
    raise exception 'own_delegation' using errcode = 'P0001';
  end if;

  for v_delegation in select * from private.invite_rows(v_lead.id) loop
    if v_delegation.kind = 'substitute' and not private.substitute_ahead(v_delegation.session_id) then
      update public.delegations set status = 'expired', invite_hash = null where id = v_delegation.id;
      continue;
    end if;
    update public.delegations
    set delegate_trainer_id = v_user, status = 'active', accepted_at = pg_catalog.now(),
        starts_at = least(starts_at, pg_catalog.now()), invite_hash = null
    where id = v_delegation.id
    returning * into v_delegation;

    v_starts := null;
    if v_delegation.kind = 'substitute' then
      update public.sessions set conducted_by = v_user where id = v_delegation.session_id
      returning starts_at into v_starts;
      v_first := least(v_first, v_starts);
    end if;
    v_taken := v_taken + 1;
    for v_client in select * from private.delegation_audience(v_delegation) loop
      perform private.enqueue_notification(
        'delegation',
        pg_catalog.format('delegation:%s:%s', v_delegation.id, v_client.client_id),
        pg_catalog.jsonb_build_object(
          'event', v_delegation.kind, 'delegation_id', v_delegation.id, 'coaching_id', v_client.coaching_id,
          'session_id', v_delegation.session_id, 'starts_at', v_starts,
          'delegate_name', private.delegation_person(v_user), 'owner_name', private.delegation_person(v_delegation.owner_trainer_id)),
        v_client.client_id,
        p_session_id => v_delegation.session_id);
    end loop;
  end loop;

  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-accepted:%s', v_lead.id),
    pg_catalog.jsonb_build_object(
      'event', 'accepted', 'delegation_id', v_lead.id, 'kind', v_lead.kind,
      'session_id', v_lead.session_id, 'starts_at', v_first, 'sessions', v_taken,
      'delegate_name', private.delegation_person(v_user)),
    v_lead.owner_trainer_id);
  return v_lead.id;
end $$;

-- As in 20261017090713_delegations.sql, for every row of the invite.
create or replace function public.decline_delegation(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_delegation := private.pending_delegation(p_token);
  update public.delegations set status = 'declined', invite_hash = null
  where (id = v_delegation.id or lead_id = v_delegation.id) and status = 'pending';
  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-declined:%s', v_delegation.id),
    pg_catalog.jsonb_build_object('event', 'declined', 'delegation_id', v_delegation.id, 'kind', v_delegation.kind,
                                  'session_id', v_delegation.session_id),
    v_delegation.owner_trainer_id);
end $$;

-- As in 20261017090713_delegations.sql. Revoking the pending row that holds a shared token hands the token on to
-- the next session of the invite, so the link keeps working for the sessions the owner left in it.
create or replace function public.revoke_delegation(p_delegation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_delegation public.delegations;
  v_next uuid;
begin
  select d.* into v_delegation from public.delegations d
  where d.id = p_delegation_id and (d.owner_trainer_id = v_user or d.delegate_trainer_id = v_user)
    and d.status in ('pending', 'active')
  for update;
  if v_delegation.id is null then
    return false;
  end if;
  update public.delegations set status = 'revoked', revoked_at = pg_catalog.now(), invite_hash = null
  where id = v_delegation.id;
  if v_delegation.kind = 'substitute' then
    update public.sessions set conducted_by = null
    where id = v_delegation.session_id and conducted_by = v_delegation.delegate_trainer_id;
  end if;
  if v_delegation.status = 'pending' and v_delegation.invite_hash is not null then
    select d.id into v_next
    from public.delegations d join public.sessions s on s.id = d.session_id
    where d.lead_id = v_delegation.id and d.status = 'pending'
    order by s.starts_at, d.id
    limit 1;
    if v_next is not null then
      update public.delegations set lead_id = v_next where lead_id = v_delegation.id and id <> v_next;
      update public.delegations
      set lead_id = null, invite_hash = v_delegation.invite_hash, invited_trainer_id = v_delegation.invited_trainer_id
      where id = v_next;
    end if;
  end if;
  return true;
end $$;

-- As in 20261017202047_delegate_search.sql, but an invite for several sessions stays open while one of them is
-- ahead, and the trainer's message says how many sessions it covers.
create or replace function public.invite_delegate(p_delegation_id uuid, p_trainer_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_delegation public.delegations;
  v_token text := pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), '=');
  v_starts timestamptz;
  v_sessions integer;
begin
  if v_owner is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_delegation from public.delegations d
  where d.id = p_delegation_id and d.owner_trainer_id = v_owner
  for update;
  if v_delegation.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_delegation.kind = 'substitute' then
    select pg_catalog.min(s.starts_at), pg_catalog.count(*)::integer into v_starts, v_sessions
    from private.invite_rows(v_delegation.id) r join public.sessions s on s.id = r.session_id
    where private.substitute_ahead(r.session_id);
  end if;
  if v_delegation.status <> 'pending' or v_delegation.lead_id is not null
     or (v_delegation.kind = 'substitute' and v_sessions = 0) then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  if not private.delegate_contact(v_owner, p_trainer_id) then
    raise exception 'trainer_not_found' using errcode = 'P0002';
  end if;

  update public.delegations
  set invite_hash = extensions.digest(v_token, 'sha256'), invited_trainer_id = p_trainer_id
  where id = v_delegation.id;
  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-invite:%s:%s', v_delegation.id, pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex')),
    pg_catalog.jsonb_build_object(
      'event', 'invited', 'delegation_id', v_delegation.id, 'kind', v_delegation.kind, 'token', v_token,
      'session_id', v_delegation.session_id, 'starts_at', v_starts, 'sessions', v_sessions,
      'owner_name', private.delegation_person(v_owner)),
    p_trainer_id);
end $$;

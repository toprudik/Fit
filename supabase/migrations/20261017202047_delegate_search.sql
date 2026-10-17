-- Invite a delegate by search (PRD wave-3 §1 rule 1): besides the one-time link, the owner finds a verified DaFit
-- trainer among their contacts and sends the invite straight to them by the bot. Contacts are trainers the owner
-- has delegated to or for before, and trainers whose showcase is open anyway. Accepting still goes through
-- accept_delegation with the token (20261017090713_delegations.sql), so the rules there stay as they are.

alter table public.delegations
  add column invited_trainer_id uuid references public.trainer_profiles (user_id) on delete set null;
comment on column public.delegations.invited_trainer_id is
  'The trainer the owner sent the invite to by search; null for an invite shared only as a link.';
create index delegations_invited_trainer_idx on public.delegations (invited_trainer_id) where invited_trainer_id is not null;

-- A trainer the caller may invite: verified, not the caller, not blocked or being deleted, and either a delegation
-- partner (either way) or a trainer whose showcase is public.
create function private.delegate_contact(p_owner uuid, p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_trainer <> p_owner and exists (
    select 1 from public.trainer_profiles t
    where t.user_id = p_trainer and t.verification_status = 'verified'
      and not exists (select 1 from public.profiles p where p.id = t.user_id and p.blocked_at is not null)
      and not exists (select 1 from public.account_deletions a where a.user_id = t.user_id and a.cancelled_at is null)
      and (t.is_public or exists (
        select 1 from public.delegations d
        where (d.owner_trainer_id = p_owner and d.delegate_trainer_id = p_trainer)
           or (d.owner_trainer_id = p_trainer and d.delegate_trainer_id = p_owner))))
$$;
revoke all on function private.delegate_contact(uuid, uuid) from public;

-- Up to 10 trainers the owner may invite whose name or @username matches the query (at least 2 characters).
create function public.search_delegate_trainers(p_query text)
returns table (trainer_id uuid, name text, username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_query text := pg_catalog.btrim(pg_catalog.ltrim(pg_catalog.btrim(coalesce(p_query, '')), '@'));
  v_like text;
begin
  if v_owner is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_query) < 2 then
    return;
  end if;
  v_like := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select t.user_id, private.delegation_person(t.user_id), p.username
    from public.trainer_profiles t
    join public.profiles p on p.id = t.user_id
    where private.delegate_contact(v_owner, t.user_id)
      and (p.username ilike v_like || '%'
           or pg_catalog.concat_ws(' ', p.first_name, p.last_name) ilike '%' || v_like || '%'
           or pg_catalog.concat_ws(' ', p.last_name, p.first_name) ilike '%' || v_like || '%')
    order by 2 nulls last, 3
    limit 10;
end $$;
comment on function public.search_delegate_trainers(text) is
  'Trainers the caller can invite as a delegate, by name or @username: verified, and a delegation partner or with '
  'an open showcase (PRD wave-3 §1 rule 1).';
revoke all on function public.search_delegate_trainers(text) from public, anon;
grant execute on function public.search_delegate_trainers(text) to authenticated;

-- The owner sends a pending delegation to a trainer found by search. A new one-time token replaces the old one,
-- so an earlier link stops working, and the trainer gets it in a bot message. Raises forbidden, not_found,
-- not_pending, trainer_not_found.
create function public.invite_delegate(p_delegation_id uuid, p_trainer_id uuid)
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
  if v_delegation.status <> 'pending'
     or (v_delegation.kind = 'substitute' and v_delegation.ends_at is not null and v_delegation.ends_at <= pg_catalog.now()) then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  if not private.delegate_contact(v_owner, p_trainer_id) then
    raise exception 'trainer_not_found' using errcode = 'P0002';
  end if;

  update public.delegations
  set invite_hash = extensions.digest(v_token, 'sha256'), invited_trainer_id = p_trainer_id
  where id = v_delegation.id;
  if v_delegation.session_id is not null then
    select s.starts_at into v_starts from public.sessions s where s.id = v_delegation.session_id;
  end if;
  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-invite:%s:%s', v_delegation.id, pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex')),
    pg_catalog.jsonb_build_object(
      'event', 'invited', 'delegation_id', v_delegation.id, 'kind', v_delegation.kind, 'token', v_token,
      'session_id', v_delegation.session_id, 'starts_at', v_starts,
      'owner_name', private.delegation_person(v_owner)),
    p_trainer_id);
end $$;
comment on function public.invite_delegate(uuid, uuid) is
  'The owner sends a pending delegation to a trainer found by search; they get a new one-time invite by the bot '
  '(PRD wave-3 §1 rule 1).';
revoke all on function public.invite_delegate(uuid, uuid) from public, anon;
grant execute on function public.invite_delegate(uuid, uuid) to authenticated;

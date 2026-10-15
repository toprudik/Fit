-- Entitlements (data-model §2.1a, ADR 0014, decisions Q56-Q59, contract §1.5 file 26, R58, R85): the feature
-- check used by RLS, RPCs and the app, the effective plan for "My plan", and the Free trainer client limit.
-- Expiry is checked by time here, without a job.

-- Internal check used by RLS, RPCs and the public wrapper. No caller restriction: it is not reachable
-- through the API (no USAGE on schema private).
create function private.has_entitlement(p_user uuid, p_feature text, p_pair uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.plan_grants g join public.plans p on p.code = g.plan_code
      where g.user_id = p_user and g.revoked_at is null and g.starts_at <= pg_catalog.now()
        and (g.expires_at is null or g.expires_at > pg_catalog.now())
        and p_feature = any (p.features))
    or (
      p_pair is not null
      and p_feature in ('client.progress_photos_unlimited', 'client.trends')   -- W1: nutrition_advanced not inheritable (R58)
      and exists (
        select 1 from public.coachings c
        where c.id = p_pair and c.client_id = p_user and c.status in ('trial', 'active')
          and exists (
            select 1 from public.plan_grants g join public.plans p on p.code = g.plan_code
            where g.user_id = c.trainer_id and p.side = 'trainer' and p.rank >= 1
              and g.revoked_at is null and g.starts_at <= pg_catalog.now()
              and (g.expires_at is null or g.expires_at > pg_catalog.now())))),
    false)
$$;

comment on function private.has_entitlement(uuid, text, uuid) is
  'True when the user has an active grant whose plan lists the feature, or, with p_pair, when the feature is '
  'inherited in that live pair from a trainer on a paid plan (Q58). Never null.';
revoke all on function private.has_entitlement(uuid, text, uuid) from public;
grant execute on function private.has_entitlement(uuid, text, uuid) to authenticated, service_role;

-- Public wrapper for the app (/rpc/has_entitlement). A signed-in user may ask only about themselves, so
-- nobody can probe another user's plan (R58); admins and server code (no JWT) may ask about anyone.
create function public.has_entitlement(p_user uuid, p_feature text, p_pair uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and p_user is distinct from auth.uid() and not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'has_entitlement answers only about the caller';
  end if;
  return private.has_entitlement(p_user, p_feature, p_pair);
end $$;

comment on function public.has_entitlement(uuid, text, uuid) is
  'Whether the user may use a feature (optionally inherited in a pair). Signed-in callers may ask only about '
  'themselves unless they are admins.';
revoke all on function public.has_entitlement(uuid, text, uuid) from public, anon;
grant execute on function public.has_entitlement(uuid, text, uuid) to authenticated, service_role;

-- "My plan": the highest-rank active grant of that side. Inherited pair rights are not a plan, so they do
-- not count here.
create function public.effective_plan(p_user uuid, p_side public.plan_side)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is not null and p_user is distinct from auth.uid() and not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'effective_plan answers only about the caller';
  end if;
  select p.code into v_code
  from public.plan_grants g
  join public.plans p on p.code = g.plan_code
  where g.user_id = p_user and p.side = p_side
    and g.revoked_at is null and g.starts_at <= pg_catalog.now()
    and (g.expires_at is null or g.expires_at > pg_catalog.now())
  order by p.rank desc, p.code
  limit 1;
  return coalesce(v_code, case p_side when 'trainer' then 'trainer_free' else 'client_free' end);
end $$;

comment on function public.effective_plan(uuid, public.plan_side) is
  'Code of the highest-rank active plan of that side for the user, else trainer_free or client_free. '
  'Signed-in callers may ask only about themselves unless they are admins.';
revoke all on function public.effective_plan(uuid, public.plan_side) from public, anon;
grant execute on function public.effective_plan(uuid, public.plan_side) to authenticated, service_role;

-- Security invoker, so it never counts pairs the caller could not read: inside assert_can_add_client it runs
-- as the owner and sees every pair; under a trainer's RLS it sees all of that trainer's pairs.
-- The body is parsed at creation (begin atomic), so a policy can call it without USAGE on schema private.
create function private.active_client_count(p_trainer uuid)
returns integer
language sql
stable
set search_path = ''
begin atomic
  select pg_catalog.count(*)::integer
  from public.coachings c
  where c.trainer_id = p_trainer and c.status in ('trial', 'active') and c.client_id <> private.deleted_client_id();
end;

comment on function private.active_client_count(uuid) is
  'Number of trial and active pairs of the trainer, cards included, the deleted-client stub excluded (Q56, R85).';
revoke all on function private.active_client_count(uuid) from public;
grant execute on function private.active_client_count(uuid) to authenticated, service_role;

-- Every RPC that creates a live pair calls this first (PLAN-1). The row lock on trainer_profiles serializes
-- concurrent joins of the same trainer, so two clients cannot both take the last free place. FOR NO KEY UPDATE
-- does that without conflicting with the FK KEY SHARE locks that other inserts of the trainer hold. The count
-- after the lock needs READ COMMITTED (or SERIALIZABLE); REPEATABLE READ is refused.
create function private.assert_can_add_client(p_trainer uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  if pg_catalog.current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'unsupported_isolation' using errcode = 'P0001',
      detail = 'pairs are created in read committed or serializable transactions';
  end if;
  perform 1 from public.trainer_profiles t where t.user_id = p_trainer for no key update;
  if not found then
    raise exception 'not_a_trainer' using errcode = 'P0001';
  end if;

  if private.has_entitlement(p_trainer, 'trainer.unlimited_clients') then
    return;
  end if;

  -- A missing key means no limit, the same convention as the empty limits of paid plans.
  select (p.limits ->> 'max_active_clients')::integer into v_limit
  from public.plans p
  where p.code = 'trainer_free';

  if v_limit is not null and private.active_client_count(p_trainer) >= v_limit then
    raise exception 'plan_limit_reached' using errcode = 'P0001',
      detail = pg_catalog.format('trainer_free allows %s live clients', v_limit);
  end if;
end $$;

-- R91 (a Free trainer at the limit with an unclaimed card, decisions O1): decided as option (a), with no schema
-- change. join_by_invite and join_by_code may skip this check only when the trainer has an unclaimed card,
-- and then always create the pending managed_client_claims row (its pair must exist, which keeps PRD 2.5-3a
-- «пока тренер не ответил, человек уже клиент»). resolve_managed_client_claim with "new client" calls this
-- check again and ends the new pair with plan_limit_reached when the limit is exceeded; a merge brings the
-- count back. Every other pair-creating RPC calls it first, as before.
comment on function private.assert_can_add_client(uuid) is
  'Raises not_a_trainer or plan_limit_reached unless the trainer may take one more live client. '
  'Locks the trainer_profiles row until the end of the transaction.';
revoke all on function private.assert_can_add_client(uuid) from public;

-- Plans in the admin panel and for users (PRD wave-1 §2.14 PLAN-2, 4, 5, 6, 7; §4 «Тарифы и выдачи»; screens.md
-- /admin/plans and /settings/plan). The tables, the entitlement checks and the Free trainer limit are in
-- 20261015121100_plans_tables.sql, 20261015124000_plans_policies.sql and 20261015125100_entitlements.sql;
-- this file adds the admin RPCs that write grants (audit log and bot message in the same transaction), the
-- "Request access" RPC and the reminder three days before a grant ends.

-- Shared checks of an admin's reason: trimmed, 3 to 500 characters (the plan_grants check constraints).
create function private.admin_plan_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023', detail = 'a plan grant or revocation needs a reason';
  end if;
  if pg_catalog.char_length(v_reason) < 3 then
    raise exception 'reason_too_short' using errcode = '22023', detail = 'the reason is at least 3 characters';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023', detail = 'the reason is at most 500 characters';
  end if;
  return v_reason;
end $$;

comment on function private.admin_plan_reason(text) is
  'The trimmed reason of a plan grant or revocation; raises reason_required, reason_too_short or reason_too_long.';
revoke all on function private.admin_plan_reason(text) from public;

-- admin_grant_plan -----------------------------------------------------------------------------------------

-- PLAN-2, PLAN-5, §2.14-8: an admin gives a user a paid plan with a required reason and an optional end. The
-- grant works at once (entitlements are checked by time on every call). Open requests for that plan are closed
-- as granted. The user gets a bot message now and, for a grant with an end more than three days away, a reminder
-- three days before it (§2.14-9).
create function public.admin_grant_plan(
  p_user_id uuid,
  p_plan_code text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_plan public.plans%rowtype;
  v_grant_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins grant plans';
  end if;
  v_reason := private.admin_plan_reason(p_reason);

  select * into v_plan from public.plans p where p.code = p_plan_code;
  if not found or v_plan.rank < 1 then
    raise exception 'invalid_plan' using errcode = '22023', detail = 'only paid plans are granted';
  end if;
  if not private.is_admin_visible_account(p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if v_plan.side = 'trainer' and not exists (select 1 from public.trainer_profiles t where t.user_id = p_user_id) then
    raise exception 'not_a_trainer' using errcode = 'P0001', detail = 'trainer plans go to trainers';
  end if;
  if p_expires_at is not null and p_expires_at <= pg_catalog.now() then
    raise exception 'invalid_expiry' using errcode = '22023', detail = 'the end is in the future';
  end if;
  -- One active grant of a plan at a time: to change its end, revoke it and grant again.
  if exists (
    select 1 from public.plan_grants g
    where g.user_id = p_user_id and g.plan_code = p_plan_code and g.revoked_at is null
      and g.starts_at <= pg_catalog.now() and (g.expires_at is null or g.expires_at > pg_catalog.now())
  ) then
    raise exception 'already_granted' using errcode = 'P0001';
  end if;

  insert into public.plan_grants (user_id, plan_code, source, granted_by, reason, expires_at)
  values (p_user_id, p_plan_code, 'admin', auth.uid(), v_reason, p_expires_at)
  returning id into v_grant_id;

  update public.access_requests r
  set status = 'granted', decided_by = auth.uid(), decided_at = pg_catalog.now()
  where r.user_id = p_user_id and r.plan_code = p_plan_code and r.status = 'open';

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'plan.grant', 'user', p_user_id, v_reason,
          pg_catalog.jsonb_build_object('plan', p_plan_code, 'grant_id', v_grant_id, 'expires_at', p_expires_at));

  perform private.enqueue_notification(
    p_type => 'plan_granted',
    p_dedupe_key => 'plan_granted:' || v_grant_id,
    p_payload => pg_catalog.jsonb_build_object('plan', p_plan_code, 'expires_at', p_expires_at),
    p_user => p_user_id);
  if p_expires_at is not null and p_expires_at - interval '3 days' > pg_catalog.now() then
    perform private.enqueue_notification(
      p_type => 'plan_expiring',
      p_dedupe_key => 'plan_expiring:' || v_grant_id,
      p_payload => pg_catalog.jsonb_build_object('plan', p_plan_code, 'expires_at', p_expires_at),
      p_user => p_user_id,
      p_scheduled_for => p_expires_at - interval '3 days');
  end if;

  return v_grant_id;
end $$;

comment on function public.admin_grant_plan(uuid, text, text, timestamptz) is
  'Admin: grants a paid plan with a reason and an optional end, closes open requests for it, audits plan.grant '
  'and queues plan_granted (and plan_expiring three days before the end). Raises reason_required, '
  'reason_too_short, reason_too_long, invalid_plan, user_not_found, not_a_trainer, invalid_expiry or already_granted.';
revoke all on function public.admin_grant_plan(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.admin_grant_plan(uuid, text, text, timestamptz) to authenticated;

-- admin_revoke_plan ----------------------------------------------------------------------------------------

-- PLAN-2, PLAN-5: an admin ends an active grant with a required reason. Existing pairs stay; new clients over
-- the Free limit are refused again (assert_can_add_client). The pending reminder goes with the grant.
create function public.admin_revoke_plan(p_grant_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_grant public.plan_grants%rowtype;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins revoke plans';
  end if;
  v_reason := private.admin_plan_reason(p_reason);

  update public.plan_grants g
  set revoked_at = pg_catalog.now(), revoked_by = auth.uid(), revoke_reason = v_reason
  where g.id = p_grant_id and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now())
  returning g.* into v_grant;
  if not found then
    raise exception 'grant_not_active' using errcode = 'P0001';
  end if;

  update public.notification_outbox o
  set status = 'cancelled'
  where o.dedupe_key = 'plan_expiring:' || p_grant_id and o.status = 'pending';

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'plan.revoke', 'user', v_grant.user_id, v_reason,
          pg_catalog.jsonb_build_object('plan', v_grant.plan_code, 'grant_id', p_grant_id));

  perform private.enqueue_notification(
    p_type => 'plan_revoked',
    p_dedupe_key => 'plan_revoked:' || p_grant_id,
    p_payload => pg_catalog.jsonb_build_object('plan', v_grant.plan_code),
    p_user => v_grant.user_id);
end $$;

comment on function public.admin_revoke_plan(uuid, text) is
  'Admin: revokes an active plan grant with a reason, cancels its pending reminder, audits plan.revoke and '
  'queues plan_revoked. Raises reason_required, reason_too_short, reason_too_long or grant_not_active.';
revoke all on function public.admin_revoke_plan(uuid, text) from public, anon;
grant execute on function public.admin_revoke_plan(uuid, text) to authenticated;

-- admin_decline_access_request -----------------------------------------------------------------------------

-- The admin's other answer to a request in the queue. A grant answers it by itself (admin_grant_plan).
create function public.admin_decline_access_request(p_request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.access_requests%rowtype;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins decide access requests';
  end if;

  update public.access_requests r
  set status = 'declined', decided_by = auth.uid(), decided_at = pg_catalog.now()
  where r.id = p_request_id and r.status = 'open'
  returning r.* into v_request;
  if not found then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'access_request.decline', 'user', v_request.user_id,
          pg_catalog.jsonb_build_object('plan', v_request.plan_code, 'request_id', p_request_id));
end $$;

comment on function public.admin_decline_access_request(uuid) is
  'Admin: declines an open access request and audits access_request.decline. Raises request_not_open.';
revoke all on function public.admin_decline_access_request(uuid) from public, anon;
grant execute on function public.admin_decline_access_request(uuid) to authenticated;

-- request_access -------------------------------------------------------------------------------------------

-- PLAN-4: the "Request access" button. A second press while the request is open, or within a day of a decline,
-- returns the earlier request instead of a new one. Security invoker: the insert goes through the user's
-- column grant and the "owner inserts" policy, which allow only a paid plan of the user's own side.
create function public.request_access(p_plan_code text, p_feature text default null)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'sign in to ask for access';
  end if;

  select r.id into v_id
  from public.access_requests r
  where r.user_id = auth.uid() and r.plan_code = p_plan_code
    and (r.status = 'open' or r.created_at > pg_catalog.now() - interval '1 day')
  order by r.created_at desc
  limit 1;
  if found then
    return v_id;
  end if;

  begin
    insert into public.access_requests (user_id, plan_code, feature)
    values (auth.uid(), p_plan_code, nullif(pg_catalog.btrim(p_feature), ''))
    returning id into v_id;
  exception when unique_violation then
    -- Another press of the same user got there first.
    select r.id into v_id from public.access_requests r
    where r.user_id = auth.uid() and r.plan_code = p_plan_code and r.status = 'open';
  end;
  return v_id;
end $$;

comment on function public.request_access(text, text) is
  'The "Request access" button (PLAN-4): an open request for a paid plan of the caller''s side, at most one a day. '
  'Returns the request id, an earlier one when it exists.';
revoke all on function public.request_access(text, text) from public, anon;
grant execute on function public.request_access(text, text) to authenticated;

-- my_plan --------------------------------------------------------------------------------------------------

-- PLAN-7, "Мой тариф": the caller's plan per side with its end, and for a trainer the live client count and
-- the Free limit. The client side is there for everyone; the trainer side only for trainers. Definer, because
-- the count includes cards and pairs the plan-grant tables do not expose directly; it answers only about the
-- caller.
create function public.my_plan()
returns table (side public.plan_side, plan_code text, expires_at timestamptz, active_clients integer, client_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_side public.plan_side;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'sign in to see your plan';
  end if;

  foreach v_side in array array['trainer', 'client']::public.plan_side[] loop
    if v_side = 'trainer' and not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
      continue;
    end if;
    side := v_side;
    plan_code := public.effective_plan(v_user, v_side);
    -- The end of the grant behind the plan; one without an end wins.
    select g.expires_at into expires_at
    from public.plan_grants g
    where g.user_id = v_user and g.plan_code = my_plan.plan_code
      and g.revoked_at is null and g.starts_at <= pg_catalog.now()
      and (g.expires_at is null or g.expires_at > pg_catalog.now())
    order by g.expires_at desc nulls first
    limit 1;
    if v_side = 'trainer' then
      active_clients := private.active_client_count(v_user);
      select (p.limits ->> 'max_active_clients')::integer into client_limit from public.plans p where p.code = my_plan.plan_code;
    else
      active_clients := null;
      client_limit := null;
    end if;
    return next;
    expires_at := null;
  end loop;
end $$;

comment on function public.my_plan() is
  '"My plan" (PLAN-7): one row per side of the caller (trainer only for trainers) with the effective plan, the '
  'end of its grant, and for the trainer side the live client count and the Free limit.';
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- my_inherited_rights --------------------------------------------------------------------------------------

-- PLAN-7, Q58: the caller's live pairs whose trainer is on a paid plan, where the client inherits Premium
-- features. The client may not read the trainer's grants, so this definer function answers for them.
create function public.my_inherited_rights()
returns table (coaching_id uuid, trainer_id uuid, first_name text, last_name text, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.trainer_id, p.first_name, p.last_name, p.username
  from public.coachings c
  join public.profiles p on p.id = c.trainer_id
  where c.client_id = (select auth.uid()) and c.status in ('trial', 'active')
    and exists (
      select 1 from public.plan_grants g join public.plans pl on pl.code = g.plan_code
      where g.user_id = c.trainer_id and pl.side = 'trainer' and pl.rank >= 1
        and g.revoked_at is null and g.starts_at <= pg_catalog.now()
        and (g.expires_at is null or g.expires_at > pg_catalog.now()))
  order by c.started_at
$$;

comment on function public.my_inherited_rights() is
  'The caller''s live pairs with a trainer on a paid plan, where Premium features are inherited (Q58).';
revoke all on function public.my_inherited_rights() from public, anon;
grant execute on function public.my_inherited_rights() to authenticated;

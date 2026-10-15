-- RLS helper predicates (data-model §4.1). Wave 1 bodies check only the owner; wave 3 replaces the bodies
-- with create or replace (same signatures) to add delegations. All return false, never null.
-- Definer functions in private: authenticated has no USAGE on the schema, so nobody calls them by name
-- through the API. Policies and invoker views call them by OID, which needs only EXECUTE.

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin')
$$;

comment on function private.is_admin() is 'RLS helper: true when the caller has the admin role.';
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

create function private.is_trainer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trainer_profiles t where t.user_id = auth.uid())
$$;

comment on function private.is_trainer() is
  'RLS helper: true when the caller has a trainer profile, whatever its verification or plan.';
revoke all on function private.is_trainer() from public;
grant execute on function private.is_trainer() to authenticated, service_role;

create function private.is_coaching_client(p_coaching_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coachings c where c.id = p_coaching_id and c.client_id = auth.uid())
$$;

comment on function private.is_coaching_client(uuid) is 'RLS helper: true when the caller is the client of the pair, in any status.';
revoke all on function private.is_coaching_client(uuid) from public;
grant execute on function private.is_coaching_client(uuid) to authenticated, service_role;

create function private.is_coaching_trainer(p_coaching_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coachings c where c.id = p_coaching_id and c.trainer_id = auth.uid())
$$;

comment on function private.is_coaching_trainer(uuid, public.delegation_scope) is
  'RLS helper: true when the caller is the owner trainer of the pair, in any status. The scope is for wave 3 delegates and is ignored now.';
revoke all on function private.is_coaching_trainer(uuid, public.delegation_scope) from public;
grant execute on function private.is_coaching_trainer(uuid, public.delegation_scope) to authenticated, service_role;

create function private.is_coaching_member(p_coaching_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coachings c
    where c.id = p_coaching_id and (c.client_id = auth.uid() or c.trainer_id = auth.uid()))
$$;

comment on function private.is_coaching_member(uuid) is
  'RLS helper: true when the caller is the client or the owner trainer of the pair, in any status.';
revoke all on function private.is_coaching_member(uuid) from public;
grant execute on function private.is_coaching_member(uuid) to authenticated, service_role;

create function private.is_live_coaching(p_coaching_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coachings c where c.id = p_coaching_id and c.status in ('trial', 'active'))
$$;

comment on function private.is_live_coaching(uuid) is
  'RLS helper: true when the pair is in trial or active status. Does not look at the caller.';
revoke all on function private.is_live_coaching(uuid) from public;
grant execute on function private.is_live_coaching(uuid) to authenticated, service_role;

create function private.is_trainer_of(p_client_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coachings c
    where c.client_id = p_client_id and c.trainer_id = auth.uid() and c.status in ('trial', 'active'))
$$;

comment on function private.is_trainer_of(uuid, public.delegation_scope) is
  'RLS helper: true when the caller trains this client in a live pair. The scope is for wave 3 delegates and is ignored now.';
revoke all on function private.is_trainer_of(uuid, public.delegation_scope) from public;
grant execute on function private.is_trainer_of(uuid, public.delegation_scope) to authenticated, service_role;

create function private.can_view(p_client_id uuid, p_category public.share_category) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_client_id = auth.uid(), false)
    or exists (
      select 1
      from public.coachings c
      join public.data_shares d on d.coaching_id = c.id
      where c.client_id = p_client_id and c.trainer_id = auth.uid() and c.status in ('trial', 'active')
        and case p_category
              when 'nutrition'    then d.nutrition
              when 'measurements' then d.measurements
              when 'photos'       then d.photos
              when 'steps'        then d.steps
              when 'intake'       then d.intake
              when 'workouts'     then d.workouts
            end)
    or exists (
      select 1
      from public.break_glass_grants g
      join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
      where g.admin_id = auth.uid() and g.target_user_id = p_client_id
        and g.revoked_at is null and g.expires_at > pg_catalog.now()
        and p_category = any (g.categories))
$$;

comment on function private.can_view(uuid, public.share_category) is
  'RLS helper: true when the caller may see this category of the client''s data: the client, the trainer of a live pair '
  'with the category shared, or an admin with a live break-glass grant that lists it.';
revoke all on function private.can_view(uuid, public.share_category) from public;
grant execute on function private.can_view(uuid, public.share_category) to authenticated, service_role;

create function private.acts_for_trainer(p_trainer_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_trainer_id = auth.uid(), false)
$$;

comment on function private.acts_for_trainer(uuid, public.delegation_scope) is
  'RLS helper: true when the caller is this trainer. Used on trainer-owned tables without a pair; wave 3 adds delegates with the scope.';
revoke all on function private.acts_for_trainer(uuid, public.delegation_scope) from public;
grant execute on function private.acts_for_trainer(uuid, public.delegation_scope) to authenticated, service_role;

create function private.can_manage_session(p_session_id uuid, p_scope public.delegation_scope default 'schedule')
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.id = p_session_id and s.trainer_id = auth.uid())
$$;

comment on function private.can_manage_session(uuid, public.delegation_scope) is
  'RLS helper: true when the caller is the session''s trainer. Wave 3 adds delegates and substitutes with the scope.';
revoke all on function private.can_manage_session(uuid, public.delegation_scope) from public;
grant execute on function private.can_manage_session(uuid, public.delegation_scope) to authenticated, service_role;

create function private.is_session_participant(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bookings b where b.session_id = p_session_id and b.client_id = auth.uid())
$$;

comment on function private.is_session_participant(uuid) is
  'RLS helper: true when the caller has a booking on the session, in any status.';
revoke all on function private.is_session_participant(uuid) from public;
grant execute on function private.is_session_participant(uuid) to authenticated, service_role;

create function private.trainer_ids_visible(p_live_only boolean default false) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.trainer_id from public.coachings c
  where c.client_id = auth.uid() and (not p_live_only or c.status in ('trial', 'active'))
$$;

comment on function private.trainer_ids_visible(boolean) is
  'RLS helper: ids of the trainers the caller has a pair with as a client; with p_live_only, live pairs only.';
revoke all on function private.trainer_ids_visible(boolean) from public;
grant execute on function private.trainer_ids_visible(boolean) to authenticated, service_role;

create function private.pair_partner_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.trainer_id from public.coachings c where c.client_id = auth.uid()
  union
  select c.client_id from public.coachings c where c.trainer_id = auth.uid()
$$;

comment on function private.pair_partner_ids() is
  'RLS helper: ids of everyone the caller shares a pair with, in either direction and any status.';
revoke all on function private.pair_partner_ids() from public;
grant execute on function private.pair_partner_ids() to authenticated, service_role;

-- No caller check: it returns a count, and only views and RPCs that already limit rows to the pair call it.
create function private.attended_count(p_coaching_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select pg_catalog.count(*)::integer from public.bookings b
  where b.coaching_id = p_coaching_id and b.status = 'attended'
$$;

comment on function private.attended_count(uuid) is
  'Number of attended bookings of the pair. Does not check the caller; not exposed through the API.';
revoke all on function private.attended_count(uuid) from public;
grant execute on function private.attended_count(uuid) to authenticated, service_role;

-- Definer and set-returning, so the exercises policy can use it without reading workout_log_exercises under
-- RLS: that table's insert check reads exercises, and a policy loop would be refused as infinite recursion.
create function private.own_logged_exercise_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct e.exercise_id
  from public.workout_log_exercises e
  join public.workout_logs l on l.id = e.log_id
  where l.client_id = auth.uid()
$$;

comment on function private.own_logged_exercise_ids() is
  'RLS helper: ids of the exercises used in the caller''s own workout logs (as the client), pair logs included.';
revoke all on function private.own_logged_exercise_ids() from public;
grant execute on function private.own_logged_exercise_ids() to authenticated, service_role;

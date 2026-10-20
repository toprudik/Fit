-- Health data behind the health data consent in the database too (право 3, 152-FZ art. 10): the screens already
-- ask for it, now a request past them gets nothing either.
--   * private.health_allowed(user): a pd_health consent in force, or a client card without an account
--     (profiles.managed_by_trainer_id): such a person cannot give it in the app, the trainer answers for it.
--   * Reading: a trainer or a delegate reads a client's health data only while it is allowed, through
--     private.can_view and private.viewable_client_ids and the workout_logs and workout_week_goals policies that
--     go past them. The owner always reads their own (export, the screens until the erasure); break-glass stays.
--   * Writing: private.require_health_consent refuses a new row, or an edit of one, for a user without it, with
--     42501 health_consent_required, whichever RPC or policy writes it. Calls without a user (service role, cron,
--     the erasure) pass, and so do group nutrition targets, which have no client.
-- The helper bodies are the ones of 20261020090417_rls_helpers_scale.sql and 20261017090713_delegations.sql.

create function private.health_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.consents c where c.user_id = p_user and c.kind = 'pd_health' and c.revoked_at is null)
    or exists (select 1 from public.profiles p where p.id = p_user and p.managed_by_trainer_id is not null);
$$;

comment on function private.health_allowed(uuid) is
  'Whether the user''s health data may be processed: a pd_health consent in force, or a client card without an account.';
revoke all on function private.health_allowed(uuid) from public;
grant execute on function private.health_allowed(uuid) to authenticated;

create or replace function private.can_view(p_client_id uuid, p_category public.share_category)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_client_id = auth.uid(), false)
    or (exists (
      select 1
      from public.coachings c
      join public.data_shares d on d.coaching_id = c.id
      where c.client_id = p_client_id and c.status in ('trial', 'active')
        and case p_category
              when 'nutrition'    then d.nutrition
              when 'measurements' then d.measurements
              when 'photos'       then d.photos
              when 'steps'        then d.steps
              when 'intake'       then d.intake
              when 'workouts'     then d.workouts
            end
        and (c.trainer_id = auth.uid() or private.delegate_views(c.id, p_category)))
      and private.health_allowed(p_client_id))
    or exists (
      select 1
      from public.break_glass_grants g
      join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
      where g.admin_id = auth.uid() and g.target_user_id = p_client_id
        and g.revoked_at is null and g.expires_at > pg_catalog.now()
        and p_category = any (g.categories))
$$;

create or replace function private.viewable_client_ids(p_category public.share_category)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select auth.uid() as id
    union all
    select c.client_id
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.trainer_id = auth.uid() and c.status in ('trial', 'active') and private.shares_category(d, p_category)
      and private.health_allowed(c.client_id)
    union all
    select c.client_id
    from (select distinct dl.owner_trainer_id
          from public.delegations dl
          where dl.delegate_trainer_id = auth.uid() and dl.status = 'active') o
    join public.coachings c on c.trainer_id = o.owner_trainer_id
    join public.data_shares d on d.coaching_id = c.id
    where c.status in ('trial', 'active') and private.shares_category(d, p_category)
      and private.delegate_views(c.id, p_category) and private.health_allowed(c.client_id)
    union all
    select g.target_user_id
    from public.break_glass_grants g
    join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
    where g.admin_id = auth.uid()
      and g.revoked_at is null and g.expires_at > pg_catalog.now()
      and p_category = any (g.categories)
  ) x
  where x.id is not null
$$;

alter policy "workout_logs: client, pair trainer, shared self logs read" on public.workout_logs
  using (
    client_id = (select auth.uid())
    or (coaching_id is not null and private.is_coaching_trainer(coaching_id, 'workouts') and private.health_allowed(client_id))
    or (coaching_id is null and created_by = client_id and private.can_view(client_id, 'workouts')));

alter policy "workout_week_goals: client and trainers read" on public.workout_week_goals
  using (client_id = (select auth.uid()) or (private.is_trainer_of(client_id) and private.health_allowed(client_id)));

-- Writing: one trigger for every table with health data.
create function private.require_health_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := (pg_catalog.to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if auth.uid() is null or v_subject is null or private.health_allowed(v_subject) then
    return new;
  end if;
  raise exception 'health_consent_required' using errcode = '42501';
end $$;

comment on function private.require_health_consent() is
  'Refuses a health data row of a user without the health data consent (the column with the user is the trigger''s argument).';
revoke all on function private.require_health_consent() from public;

create trigger require_health_consent before insert or update on public.intakes
  for each row execute function private.require_health_consent('user_id');
create trigger require_health_consent before insert or update on public.client_goals
  for each row execute function private.require_health_consent('user_id');
create trigger require_health_consent before insert or update of value, measured_at, local_date on public.measurements
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert on public.progress_photos
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert on public.food_day_comments
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert or update on public.food_diary_entries
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert on public.food_favorites
  for each row execute function private.require_health_consent('user_id');
create trigger require_health_consent before insert on public.foods
  for each row execute function private.require_health_consent('owner_id');
create trigger require_health_consent before insert on public.nutrition_targets
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert or update on public.body_profiles
  for each row execute function private.require_health_consent('user_id');
create trigger require_health_consent before insert or update on public.activity_entries
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert on public.workout_logs
  for each row execute function private.require_health_consent('client_id');
create trigger require_health_consent before insert or update on public.workout_week_goals
  for each row execute function private.require_health_consent('client_id');

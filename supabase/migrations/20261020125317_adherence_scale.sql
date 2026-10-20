-- Adherence that scales with the trainer's roster. trainer_nutrition_adherence took ~0.7 s for a trainer with 300
-- clients: adherence_counts resolved every logged day through active_nutrition_target, and a client with no target
-- of their own and no group, whose days private.freeze_nutrition_days never freezes, went through
-- live_nutrition_target (~0.4 ms) on each of them only to learn there is none.
--   * private.may_have_nutrition_target: whether the client has any target row or group membership at all. Without
--     either, live_nutrition_target is null on every day, so the day-by-day lookups are skipped.
--   * private.adherence_counts: reads the frozen target of finished days straight from nutrition_day_targets and
--     calls active_nutrition_target only for the other days of a client who may have a target. Same answer as the
--     body in 20261017091027_nutrition_adherence.sql; supabase/tests/979_adherence_scale.test.sql compares the two.
--   * public.trainer_nutrition_adherence: has_target takes the same shortcut. Body otherwise as in
--     20261017091027_nutrition_adherence.sql.
-- active_nutrition_target and live_nutrition_target (20261018131147_nutrition_day_targets.sql) stay as they are.

create function private.may_have_nutrition_target(p_client uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- plpgsql keeps the plan between calls; a SQL function would be planned on each of them.
  return exists (select 1 from public.nutrition_targets t where t.client_id = p_client)
      or exists (select 1
                 from public.coachings c
                 join public.group_members m on m.coaching_id = c.id
                 where c.client_id = p_client);
end $$;
comment on function private.may_have_nutrition_target(uuid) is
  'False when the client has no target row and no group membership, so live_nutrition_target is null on any day.';
revoke all on function private.may_have_nutrition_target(uuid) from public;

create or replace function private.adherence_counts(p_client uuid, p_from date, p_to date)
returns table (logged integer, counted integer, in_norm integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.client_today(p_client);
  v_may_have boolean := private.may_have_nutrition_target(p_client);
begin
  -- active_nutrition_target: a finished day with a frozen row is that row, any other day the live target.
  return query
  with days as (
    select e.local_date as day, pg_catalog.sum(e.kcal) as kcal
    from public.food_diary_entries e
    where e.client_id = p_client and e.local_date between p_from and p_to
    group by e.local_date
  ), judged as (
    select d.kcal, t.kcal as target
    from days d
    left join private.nutrition_day_targets f on f.client_id = p_client and f.day = d.day and d.day < v_today
    left join public.nutrition_targets t on t.id = case
      when f.client_id is not null then f.target_id
      when v_may_have then private.active_nutrition_target(p_client, d.day)
    end
  )
  select pg_catalog.count(*)::integer,
         pg_catalog.count(j.target)::integer,
         (pg_catalog.count(*) filter (where j.target is not null and abs(j.kcal - j.target) <= j.target * 0.1))::integer
  from judged j;
end $$;

create or replace function public.trainer_nutrition_adherence(p_days integer)
returns table (coaching_id uuid, client_id uuid, days integer, logged integer, counted integer, in_norm integer,
               adherence integer, previous_adherence integer, has_target boolean, last_day date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair record;
  v_today date;
  v_now record;
  v_before record;
begin
  if v_user is null or p_days is null or p_days not in (7, 30, 90) then
    return;
  end if;
  for v_pair in
    select c.id, c.client_id
    from public.coachings c
    where c.trainer_id = v_user and c.status in ('trial', 'active')
  loop
    continue when not private.can_view(v_pair.client_id, 'nutrition');
    v_today := private.client_today(v_pair.client_id);
    select * into v_now from private.adherence_counts(v_pair.client_id, v_today - p_days, v_today - 1);
    select * into v_before from private.adherence_counts(v_pair.client_id, v_today - 2 * p_days, v_today - p_days - 1);
    return query select v_pair.id, v_pair.client_id, p_days, v_now.logged, v_now.counted, v_now.in_norm,
                        private.adherence_share(v_now.in_norm, v_now.counted),
                        private.adherence_share(v_before.in_norm, v_before.counted),
                        private.may_have_nutrition_target(v_pair.client_id)
                          and private.active_nutrition_target(v_pair.client_id, v_today) is not null,
                        (select pg_catalog.max(e.local_date) from public.food_diary_entries e
                         where e.client_id = v_pair.client_id);
  end loop;
end $$;

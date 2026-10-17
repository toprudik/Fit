-- Nutrition adherence (wave-2 §5): the share of logged days whose kcal stayed within ±10% of that day's target.
-- Only days with at least one entry count; days without a target in force are logged but not judged; today
-- waits until it is over. A trainer sees one row per live pair that shares nutrition.

-- private.adherence_counts: logged days, days judged against a target, and days within ±10% of it, over a range
-- of the client's local dates. The target is the one in force on each day (§5.4).
create function private.adherence_counts(p_client uuid, p_from date, p_to date)
returns table (logged integer, counted integer, in_norm integer)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select e.local_date as day, pg_catalog.sum(e.kcal) as kcal
    from public.food_diary_entries e
    where e.client_id = p_client and e.local_date between p_from and p_to
    group by e.local_date
  ), judged as (
    select d.kcal, t.kcal as target
    from days d
    left join public.nutrition_targets t on t.id = private.active_nutrition_target(p_client, d.day)
  )
  select pg_catalog.count(*)::integer,
         pg_catalog.count(j.target)::integer,
         (pg_catalog.count(*) filter (where j.target is not null and abs(j.kcal - j.target) <= j.target * 0.1))::integer
  from judged j
$$;
comment on function private.adherence_counts(uuid, date, date) is
  'Logged days, days with a target and days within ±10% of the target, for a client over a date range (wave-2 §5).';
revoke all on function private.adherence_counts(uuid, date, date) from public;

-- private.adherence_share: the percentage, rounded; null when no day could be judged.
create function private.adherence_share(p_in_norm integer, p_counted integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_counted > 0 then pg_catalog.round(p_in_norm * 100.0 / p_counted)::integer end
$$;
revoke all on function private.adherence_share(integer, integer) from public;

-- nutrition_adherence: one client's adherence for the last 7, 30 or 90 full days, with the period before it for
-- the trend. For the client and for a trainer the client shares nutrition with.
create function public.nutrition_adherence(p_client_id uuid, p_days integer)
returns table (days integer, logged integer, counted integer, in_norm integer, adherence integer,
               previous_adherence integer, has_target boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_now record;
  v_before record;
begin
  if auth.uid() is null or p_client_id is null or p_days is null or p_days not in (7, 30, 90)
     or not private.can_view(p_client_id, 'nutrition') then
    return;
  end if;
  v_today := private.client_today(p_client_id);
  select * into v_now from private.adherence_counts(p_client_id, v_today - p_days, v_today - 1);
  select * into v_before from private.adherence_counts(p_client_id, v_today - 2 * p_days, v_today - p_days - 1);
  return query select p_days, v_now.logged, v_now.counted, v_now.in_norm,
                      private.adherence_share(v_now.in_norm, v_now.counted),
                      private.adherence_share(v_before.in_norm, v_before.counted),
                      private.active_nutrition_target(p_client_id, v_today) is not null;
end $$;
comment on function public.nutrition_adherence(uuid, integer) is
  'Adherence of one client over the last 7/30/90 full days and the period before (wave-2 §5); empty without access.';
revoke all on function public.nutrition_adherence(uuid, integer) from public, anon;
grant execute on function public.nutrition_adherence(uuid, integer) to authenticated;

-- trainer_nutrition_adherence: the trainer's "Питание" list (§5.5): every live pair whose client shares
-- nutrition, with adherence, logged days and the last logged day. Pairs without access are left out (§5.3).
create function public.trainer_nutrition_adherence(p_days integer)
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
                        private.active_nutrition_target(v_pair.client_id, v_today) is not null,
                        (select pg_catalog.max(e.local_date) from public.food_diary_entries e
                         where e.client_id = v_pair.client_id);
  end loop;
end $$;
comment on function public.trainer_nutrition_adherence(integer) is
  'The signed-in trainer''s live pairs that share nutrition, with adherence over 7/30/90 full days (wave-2 §5).';
revoke all on function public.trainer_nutrition_adherence(integer) from public, anon;
grant execute on function public.trainer_nutrition_adherence(integer) to authenticated;

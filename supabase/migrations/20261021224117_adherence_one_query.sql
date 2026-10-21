-- trainer_nutrition_adherence in one query over the roster (QA: p95 633 ms at 25 users and 948 ms at 50 for a
-- trainer with 300 clients, the slowest call in the database). The loop ran, for every pair, a RETURN QUERY and two calls of
-- private.adherence_counts, each finding the client's today and whether they may have a target again. Now one query
-- reads the roster's diary days for both windows at once and judges each day the way adherence_counts does
-- (a frozen target, else the live one). The access check (private.can_view), has_target and last_day are as before.
-- Same answer as the body in 20261020125317_adherence_scale.sql; supabase/tests/999_adherence_one_query.test.sql
-- compares the two.

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
begin
  if v_user is null or p_days is null or p_days not in (7, 30, 90) then
    return;
  end if;
  return query
  with pairs as (
    select c.id, c.client_id, private.client_today(c.client_id) as today,
           private.may_have_nutrition_target(c.client_id) as may_have
    from public.coachings c
    where c.trainer_id = v_user and c.status in ('trial', 'active')
      and private.can_view(c.client_id, 'nutrition')
  ), logged_days as (
    -- Both windows at once: the previous p_days before today - p_days and the last p_days before today.
    select p.client_id, e.local_date as day, pg_catalog.sum(e.kcal) as kcal, e.local_date >= p.today - p_days as recent
    from pairs p
    join public.food_diary_entries e
      on e.client_id = p.client_id and e.local_date between p.today - 2 * p_days and p.today - 1
    group by p.client_id, e.local_date, p.today
  ), judged as (
    -- private.adherence_counts per day: every day here is before the client's today, so a frozen row is its
    -- target, and otherwise the live one of a client who may have a target (active_nutrition_target).
    select d.client_id, d.recent, d.kcal, t.kcal as target
    from logged_days d
    join pairs p on p.client_id = d.client_id
    left join private.nutrition_day_targets f on f.client_id = d.client_id and f.day = d.day
    left join public.nutrition_targets t on t.id = case
      when f.client_id is not null then f.target_id
      when p.may_have then private.live_nutrition_target(d.client_id, d.day)
    end
  ), counts as (
    select j.client_id,
           (pg_catalog.count(*) filter (where j.recent))::integer as logged,
           (pg_catalog.count(j.target) filter (where j.recent))::integer as counted,
           (pg_catalog.count(*) filter (where j.recent and j.target is not null
                                          and abs(j.kcal - j.target) <= j.target * 0.1))::integer as in_norm,
           (pg_catalog.count(j.target) filter (where not j.recent))::integer as before_counted,
           (pg_catalog.count(*) filter (where not j.recent and j.target is not null
                                          and abs(j.kcal - j.target) <= j.target * 0.1))::integer as before_in_norm
    from judged j
    group by j.client_id
  )
  select p.id, p.client_id, p_days, coalesce(n.logged, 0), coalesce(n.counted, 0), coalesce(n.in_norm, 0),
         private.adherence_share(coalesce(n.in_norm, 0), coalesce(n.counted, 0)),
         private.adherence_share(coalesce(n.before_in_norm, 0), coalesce(n.before_counted, 0)),
         -- Today is never frozen, so active_nutrition_target is the live target.
         p.may_have and private.live_nutrition_target(p.client_id, p.today) is not null,
         (select pg_catalog.max(e.local_date) from public.food_diary_entries e where e.client_id = p.client_id)
  from pairs p
  left join counts n on n.client_id = p.client_id;
end $$;

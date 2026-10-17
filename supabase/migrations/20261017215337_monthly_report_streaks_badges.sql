-- Streaks and new badges in the monthly report (PRD wave-3 §4 rule 2): private.monthly_report also returns
--   * "streaks": the workout streak in weeks and the diary and steps streaks in days, as they stood on the last day
--     of the month, each only when it runs;
--   * "badges": the codes of the badges earned that month, oldest first.
-- Neither counts as activity on its own: a month with only a running streak still has no report. The rest of the
-- body is the one of 20261017101247_monthly_reports.sql.

create or replace function private.monthly_report(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz       text;
  v_locale   public.app_locale;
  v_from     timestamptz;
  v_to       timestamptz;
  v_last     date := (p_month + interval '1 month')::date - 1;
  v_sessions jsonb;
  v_records  jsonb;
  v_changes  jsonb;
  v_food     jsonb;
  v_steps    jsonb;
  v_sleep    jsonb;
  v_homework jsonb;
  v_workouts integer;
  v_badges   jsonb;
  v_streaks  jsonb;
  v_report   jsonb;
begin
  if p_user is null or p_month is null or p_month <> date_trunc('month', p_month)::date then
    return null;
  end if;
  select coalesce(s.time_zone, 'Europe/Moscow'), coalesce(s.locale, 'ru') into v_tz, v_locale
  from public.profiles p left join public.user_settings s on s.user_id = p.id
  where p.id = p_user;
  if v_tz is null then
    return null;
  end if;
  v_from := p_month::timestamp at time zone v_tz;
  v_to := (p_month + interval '1 month')::timestamp at time zone v_tz;

  -- Attended sessions, and with whom.
  select pg_catalog.jsonb_build_object('total', sum(t.n), 'trainers', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'coaching_id', t.coaching_id, 'name', t.name, 'count', t.n) order by t.n desc, t.name))
  into v_sessions
  from (
    select b.coaching_id,
           coalesce(nullif(pg_catalog.btrim(p.display_name), ''), nullif(pg_catalog.concat_ws(' ', p.first_name, p.last_name), '')) as name,
           count(*)::integer as n
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.profiles p on p.id = b.trainer_id
    where b.client_id = p_user and b.status = 'attended' and s.starts_at >= v_from and s.starts_at < v_to
    group by b.coaching_id, p.display_name, p.first_name, p.last_name
  ) t
  having count(*) > 0;

  -- Records reached this month that still stand.
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'exercise_id', r.exercise_id,
           'name', coalesce((select x.name from public.exercise_translations x
                             where x.exercise_id = r.exercise_id and x.locale = v_locale), e.name),
           'type', r.record_type, 'value', r.value, 'achieved_at', r.achieved_at)
           order by r.achieved_at desc)
  into v_records
  from public.personal_records r
  join public.exercises e on e.id = r.exercise_id
  where r.client_id = p_user and r.achieved_at >= v_from and r.achieved_at < v_to;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', m.kind, 'from', m.first_value, 'to', m.last_value)
           order by m.kind)
  into v_changes
  from (
    select x.kind,
           (array_agg(x.value order by x.measured_at, x.created_at))[1] as first_value,
           (array_agg(x.value order by x.measured_at desc, x.created_at desc))[1] as last_value
    from public.measurements x
    where x.client_id = p_user and x.local_date between p_month and v_last
    group by x.kind
    having count(*) >= 2
  ) m;

  select pg_catalog.jsonb_build_object(
           'logged_days', count(*)::integer,
           'target_days', count(d.target)::integer,
           'on_target_days', count(*) filter (where pg_catalog.abs(d.kcal - d.target) <= d.target * 0.1)::integer)
  into v_food
  from (
    select f.local_date, sum(f.kcal) as kcal,
           (select t.kcal from public.nutrition_targets t
            where t.id = private.active_nutrition_target(p_user, f.local_date)) as target
    from public.food_diary_entries f
    where f.client_id = p_user and f.local_date between p_month and v_last
    group by f.local_date
  ) d
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('average', round(avg(d.steps))::integer, 'days', count(*)::integer)
  into v_steps
  from (
    select coalesce(max(a.value) filter (where a.source = 'manual'), max(a.value)) as steps
    from public.activity_entries a
    where a.client_id = p_user and a.metric = 'steps' and a.local_date between p_month and v_last
    group by a.local_date
  ) d
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('average_min', round(avg(a.value))::integer, 'days', count(*)::integer)
  into v_sleep
  from public.activity_entries a
  where a.client_id = p_user and a.metric = 'sleep' and a.local_date between p_month and v_last
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('done', count(o.done_at)::integer, 'total', count(*)::integer)
  into v_homework
  from public.homework_occurrences o
  join public.homework h on h.id = o.homework_id
  join public.coachings c on c.id = h.coaching_id
  where c.client_id = p_user and o.due_on between p_month and v_last
  having count(*) > 0;

  select count(*)::integer into v_workouts
  from public.workout_logs w
  where w.client_id = p_user and w.local_date between p_month and v_last;

  -- No activity, no report (§4-2): sessions, workouts, records, measurements, food, steps, sleep or a done homework.
  if v_sessions is null and v_records is null and v_workouts = 0 and v_food is null and v_steps is null
     and v_sleep is null and coalesce((v_homework->>'done')::integer, 0) = 0
     and not exists (select 1 from public.measurements x
                     where x.client_id = p_user and x.local_date between p_month and v_last) then
    return null;
  end if;

  -- Badges earned this month, oldest first (§4-2).
  select pg_catalog.jsonb_agg(u.badge_code order by u.awarded_at, b.position)
  into v_badges
  from public.user_badges u
  join public.badges b on b.code = u.badge_code
  where u.user_id = p_user and u.awarded_at >= v_from and u.awarded_at < v_to;

  -- Streaks as they stood on the last day of the month (§4-2), only the ones that run.
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
           'workouts', nullif(private.workout_streak(p_user, v_last), 0),
           'diary', nullif(private.day_streak(private.diary_days(p_user, v_last), v_last), 0),
           'steps', nullif(private.day_streak(private.steps_goal_days(p_user, v_last), v_last), 0)))
  into v_streaks;
  if v_streaks = '{}'::jsonb then
    v_streaks := null;
  end if;

  v_report := pg_catalog.jsonb_build_object('month', p_month, 'workouts', v_workouts);
  if v_sessions is not null then v_report := v_report || pg_catalog.jsonb_build_object('sessions', v_sessions); end if;
  if v_records is not null then v_report := v_report || pg_catalog.jsonb_build_object('records', v_records); end if;
  if v_changes is not null then v_report := v_report || pg_catalog.jsonb_build_object('measurements', v_changes); end if;
  if v_food is not null then v_report := v_report || pg_catalog.jsonb_build_object('nutrition', v_food); end if;
  if v_steps is not null then v_report := v_report || pg_catalog.jsonb_build_object('steps', v_steps); end if;
  if v_sleep is not null then v_report := v_report || pg_catalog.jsonb_build_object('sleep', v_sleep); end if;
  if v_homework is not null then v_report := v_report || pg_catalog.jsonb_build_object('homework', v_homework); end if;
  if v_streaks is not null then v_report := v_report || pg_catalog.jsonb_build_object('streaks', v_streaks); end if;
  if v_badges is not null then v_report := v_report || pg_catalog.jsonb_build_object('badges', v_badges); end if;
  return v_report;
end $$;

comment on function private.monthly_report(uuid, date) is
  'The client''s month in numbers (wave-3 §4-2), or null when the month has no activity. Months in the client''s time zone.';

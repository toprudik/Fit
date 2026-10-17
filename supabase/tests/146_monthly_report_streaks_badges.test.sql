-- Streaks and new badges in the monthly report, migration 20261017192901_monthly_report_streaks_badges.sql (PRD
-- wave-3 §4 rule 2): the streaks as of the month's last day, the badges earned that month, and no report from a
-- badge alone.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');

-- September 2026 of C (Moscow): two sessions in each of the last two weeks, so the weekly goal of 2 is met there,
-- and food diary entries on the last three days.
select tests.create_booking(tests.create_session('trainer_a', s), 'trainer_a', 'client_c', 'attended')
from unnest(array['2026-09-22 07:00+00', '2026-09-24 07:00+00', '2026-09-28 07:00+00', '2026-09-29 07:00+00']::timestamptz[]) s;
insert into public.food_diary_entries (client_id, local_date, meal, title, kcal)
select tests.user_id('client_c'), d, 'lunch', 'Суп', 500
from unnest(array['2026-09-28', '2026-09-29', '2026-09-30']::date[]) d;

-- Badges with known dates: two in September, one in August. D has a September badge and nothing else.
delete from public.user_badges where user_id in (tests.user_id('client_c'), tests.user_id('client_d'));
insert into public.user_badges (user_id, badge_code, awarded_at) values
  (tests.user_id('client_c'), 'sessions_1', '2026-09-22 10:00+03'),
  (tests.user_id('client_c'), 'diary_7', '2026-09-29 10:00+03'),
  (tests.user_id('client_c'), 'workout_streak_4', '2026-08-20 10:00+03'),
  (tests.user_id('client_d'), 'sessions_10', '2026-09-15 10:00+03');

create table tests.report as select private.monthly_report(tests.user_id('client_c'), '2026-09-01') as r;

select is((select (r->'streaks'->>'workouts')::integer from tests.report), 2,
  'the workout streak in weeks as of the last day of the month');
select is((select (r->'streaks'->>'diary')::integer from tests.report), 3,
  'the diary streak in days as of the last day of the month');
select ok((select not (r->'streaks' ? 'steps') from tests.report), 'a streak that does not run is left out');
select is((select r->'badges' from tests.report), '["sessions_1", "diary_7"]'::jsonb,
  'the badges earned that month, oldest first');
select is(private.monthly_report(tests.user_id('client_c'), '2026-08-01'), null::jsonb,
  'a badge alone makes no report for its month');
select is(private.monthly_report(tests.user_id('client_d'), '2026-09-01'), null::jsonb,
  'a client with only a badge in the month gets no report');

select * from finish();
rollback;

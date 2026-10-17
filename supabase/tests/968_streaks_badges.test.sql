-- Streaks and badges (migration 20261017100917_streaks_badges.sql, PRD wave-3 §2.1–2.2): the weekly workouts
-- streak with its excused weeks and monthly freeze, the daily diary and steps streaks, who sees them, and
-- badges awarded once, announced by the bot and taken back when an attended session is unmarked (2.1–2.3, 2.7).
begin;
\ir _helpers.psql
select plan(38);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_w');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_w');
update public.user_settings set time_zone = 'UTC' where user_id in (tests.user_id('client_c'), tests.user_id('client_w'));
select tests.pair_id('trainer_a', 'client_w') as pair_w \gset

-- =========================================================================================================
-- The "Тренировки" streak: weeks from Monday, as of Wednesday 14 October 2026

create function tests.log_on(p_handle text, p_day date) returns void language sql as $$
  insert into public.workout_logs (client_id, performed_at, local_date)
  values (tests.user_id(p_handle), p_day + time '10:00', p_day)
$$;

-- Weeks of 12 Oct (now) and 5 Oct met the goal of 2; 28 Sep missed (September's freeze); 21 Sep met;
-- 14 Sep missed again: a second miss in September ends the streak.
select tests.log_on('client_w', d::date)
from unnest(array['2026-10-12', '2026-10-13', '2026-10-05', '2026-10-07', '2026-09-21', '2026-09-23',
                  '2026-09-07', '2026-09-08']) d;
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-14'), 3,
  '2.1: weeks that met the goal count, the month''s freeze covers one miss, the next miss ends the streak');
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-11'), 2,
  'the streak as of the Sunday before: the week of 5 Oct and 21 Sep');

delete from public.workout_logs where client_id = tests.user_id('client_w') and local_date >= '2026-10-12';
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-14'), 2,
  'a current week short of the goal does not break the streak yet');

select tests.log_on('client_w', '2026-10-12');
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-14'), 2, 'one of two this week: still pending');

-- The trainer cancelled a session of the client in the week of 14 Sep: that week is skipped, not missed.
select tests.create_booking(
  tests.create_session('trainer_a', '2026-09-15 09:00+00'), 'trainer_a', 'client_w', 'confirmed') as cancelled_booking \gset
update public.bookings
set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'trainer', cancel_reason = 'Болею'
where id = :'cancelled_booking';
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-14'), 3,
  '2.2: a week the trainer cancelled sessions in does not break the streak');

-- An attended session counts as a workout of its week.
select tests.create_booking(tests.create_session('trainer_a', '2026-10-13 09:00+00'), 'trainer_a', 'client_w', 'attended');
select is(private.workout_streak(tests.user_id('client_w'), '2026-10-14'), 4, 'an attended session completes this week');

-- =========================================================================================================
-- Daily streaks

select is(private.day_streak('{2026-10-14,2026-10-13,2026-10-12}', '2026-10-14'), 3, 'daily: three days in a row');
select is(private.day_streak('{2026-10-13,2026-10-12}', '2026-10-14'), 2, 'daily: today not yet done does not break it');
select is(private.day_streak('{2026-10-14,2026-10-12,2026-10-11}', '2026-10-14'), 3, 'daily: one missed day is frozen');
select is(private.day_streak('{2026-10-14,2026-10-12,2026-10-10}', '2026-10-14'), 2,
  'daily: a second missed day in the month ends it');
select is(private.day_streak('{}', '2026-10-14'), 0, 'daily: nothing, no streak');

insert into public.activity_entries (client_id, local_date, metric, value, source) values
  (tests.user_id('client_w'), '2026-10-14', 'steps', 9000, 'manual'),
  (tests.user_id('client_w'), '2026-10-13', 'steps', 5000, 'manual'),
  (tests.user_id('client_w'), '2026-10-13', 'steps', 12000, 'ios_shortcut'),
  (tests.user_id('client_w'), '2026-10-12', 'steps', 7999, 'ios_shortcut');
select is(private.steps_goal_days(tests.user_id('client_w'), '2026-10-14'), '{2026-10-14}'::date[],
  'steps: the manual value wins over the iOS one, against 8000 without a trainer target');

-- =========================================================================================================
-- Who sees the streaks, and the weekly goal

select tests.authenticate_as('client_w');
select is((select week_goal from public.my_streaks()), 2::smallint, 'the weekly goal is 2 by default');
select lives_ok($$ select public.set_workout_week_goal(auth.uid(), 3::smallint) $$, 'the client sets their weekly goal');
select is((select week_goal from public.my_streaks()), 3::smallint, 'the client''s goal applies');
select throws_ok($$ select public.set_workout_week_goal(auth.uid(), 0::smallint) $$, 'P0001', 'bad_goal', 'goal: 1 to 14');

select tests.authenticate_as('trainer_a');
select lives_ok(format('select public.set_workout_week_goal(%L, 2::smallint)', tests.user_id('client_w')),
  'a trainer of the pair sets the client''s goal');
select is((select count(*)::int from public.pair_streaks(:'pair_w')), 1,
  'the trainer of the pair reads the streaks');

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_w', 'nutrition', false);
select tests.authenticate_as('trainer_a');
select ok((select diary is null and steps is not null from public.pair_streaks(:'pair_w')),
  '2.1-4: without the nutrition share the diary streak is hidden, the steps one shown');

select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.pair_streaks(:'pair_w')), 0,
  'a stranger reads no streaks');
select throws_ok(format('select public.set_workout_week_goal(%L, 4::smallint)', tests.user_id('client_w')),
  'P0001', 'not_allowed', 'a stranger cannot set the goal');
select is((select count(*)::int from public.workout_week_goals), 0, 'a stranger reads no goals');

-- =========================================================================================================
-- Badges

select tests.clear_authentication();
select tests.create_booking(
  tests.create_session('trainer_a', now() - make_interval(days => n)), 'trainer_a', 'client_c', 'attended')
from generate_series(1, 9) n;
select results_eq(
  $$ select badge_code from public.user_badges where user_id = tests.user_id('client_c') order by badge_code $$,
  $$ values ('sessions_1') $$,
  'nine attended sessions: the first-session badge'
);

select tests.create_booking(tests.create_session('trainer_a', now() - interval '12 days'), 'trainer_a', 'client_c', 'attended')
  as tenth \gset
select results_eq(
  $$ select badge_code from public.user_badges where user_id = tests.user_id('client_c') order by badge_code $$,
  $$ values ('sessions_1'), ('sessions_10') $$,
  '2.3: the 10th attended session awards its badge'
);
select is(
  (select array_agg(payload ->> 'badge' order by payload ->> 'badge') from public.notification_outbox
   where type = 'badge' and user_id = tests.user_id('client_c')),
  '{sessions_1,sessions_10}'::text[],
  'each badge queues one bot message'
);

select tests.create_booking(tests.create_session('trainer_a', now() - interval '13 days'), 'trainer_a', 'client_c', 'attended');
select is((select count(*)::int from public.notification_outbox where type = 'badge' and user_id = tests.user_id('client_c')), 2,
  '2.3: the badge is not awarded again');

update public.bookings set status = 'no_show' where id = :'tenth';
select is((select count(*)::int from public.user_badges where user_id = tests.user_id('client_c')), 2,
  'still ten attended after one unmarked of eleven: the badges stay');
update public.bookings set status = 'no_show'
where id = (select id from public.bookings where client_id = tests.user_id('client_c') and status = 'attended' limit 1);
select results_eq(
  $$ select badge_code from public.user_badges where user_id = tests.user_id('client_c') order by badge_code $$,
  $$ values ('sessions_1') $$,
  '2.2-6: below ten attended the session badge is taken back'
);

insert into public.food_diary_entries (client_id, local_date, meal, title, kcal)
select tests.user_id('client_c'), current_date - n, 'lunch', 'Суп', 300 from generate_series(0, 6) n;
select ok(exists (select 1 from public.user_badges where user_id = tests.user_id('client_c') and badge_code = 'diary_7'),
  'seven diary days award their badge');

-- =========================================================================================================
-- Reading and writing badges

select tests.authenticate_as('client_c');
select is((select count(*)::int from public.user_badges where seen_at is null), 2, 'the client reads their new badges');
select lives_ok('select public.mark_badges_seen()', 'the client marks them seen');
select is((select count(*)::int from public.user_badges where seen_at is null), 0, 'no new badges left');
select throws_ok(
  format('insert into public.user_badges (user_id, badge_code) values (%L, ''sessions_100'')', tests.user_id('client_c')),
  '42501', null, 'nobody writes badges directly'
);
select is((select count(*)::int from public.badges), 15, 'everyone signed in reads the catalogue');

select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.user_badges where user_id = tests.user_id('client_c')), 2,
  '2.2-8: the client''s trainer sees their badges');

select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.user_badges), 0, 'a stranger sees no badges');

select tests.authenticate_as_anon();
select throws_ok('select * from public.my_streaks()', '42501', null, 'anon has no streaks');

select tests.clear_authentication();
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name in ('badges', 'user_badges')
     and column_name ~ '(point|coin|score|balance)'),
  0, '2.7: no points or coins anywhere in badges'
);

select * from finish();
rollback;

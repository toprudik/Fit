-- Monthly report, migration 20261017101247_monthly_reports.sql (PRD wave-3 §4): the client's finished month in
-- numbers, the story cards and the message on the 1st.
begin;
\ir _helpers.psql
select plan(28);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
update public.profiles set first_name = 'Ира', last_name = 'Тренер' where id = tests.user_id('trainer_a');
select tests.create_pair('trainer_a', 'client_c');

delete from public.exercises where source = 'wger';
insert into public.exercises (id, source, wger_id, name, license)
values ('00000000-0000-4000-8000-000000000141', 'wger', 141, 'Squat', 'CC-BY-SA-4.0');

-- September 2026 of C (Moscow): two attended sessions, one of them at 01:30 on the 1st by Moscow time (still
-- 31 August in UTC), a confirmed one that does not count, and one in October.
select tests.create_booking(tests.create_session('trainer_a', '2026-09-10 07:00+00'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking(tests.create_session('trainer_a', '2026-08-31 22:30+00'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking(tests.create_session('trainer_a', '2026-09-12 07:00+00'), 'trainer_a', 'client_c', 'confirmed');
select tests.create_booking(tests.create_session('trainer_a', '2026-10-02 07:00+00'), 'trainer_a', 'client_c', 'attended');

-- A workout with a record, weight 80 -> 78.5, one waist value (no change shown), steps (the manual value wins),
-- sleep, two food days against a 2000 kcal target, and a homework done out of one.
create function tests.fill_september() returns void language plpgsql set search_path = '' as $$
declare
  v_client uuid := tests.user_id('client_c');
  v_log uuid;
  v_le uuid;
  v_hw uuid;
begin
  insert into public.workout_logs (client_id, performed_at, local_date, created_by)
  values (v_client, '2026-09-20 09:00+03', '2026-09-20', v_client) returning id into v_log;
  insert into public.workout_log_exercises (log_id, position, exercise_id)
  values (v_log, 1, '00000000-0000-4000-8000-000000000141') returning id into v_le;
  insert into public.workout_sets (log_exercise_id, position, reps, weight_kg) values (v_le, 1, 5, 100);
  insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by) values
    (v_client, 'weight', 80, '2026-09-02 08:00+03', '2026-09-02', v_client),
    (v_client, 'weight', 78.5, '2026-09-28 08:00+03', '2026-09-28', v_client),
    (v_client, 'waist', 70, '2026-09-28 08:00+03', '2026-09-28', v_client);
  insert into public.activity_entries (client_id, local_date, metric, value, source) values
    (v_client, '2026-09-05', 'steps', 8000, 'manual'),
    (v_client, '2026-09-06', 'steps', 6000, 'ios_shortcut'),
    (v_client, '2026-09-06', 'steps', 10000, 'manual'),
    (v_client, '2026-09-06', 'sleep', 420, 'manual'),
    (v_client, '2026-09-07', 'sleep', 480, 'manual');
  insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
  values ('calculator', v_client, 2000, '2026-09-01', v_client);
  insert into public.food_diary_entries (client_id, local_date, meal, title, kcal) values
    (v_client, '2026-09-03', 'breakfast', 'Каша', 900),
    (v_client, '2026-09-03', 'dinner', 'Рыба', 1000),
    (v_client, '2026-09-04', 'lunch', 'Пицца', 2500);
  insert into public.homework (coaching_id, title, due_date)
  values (tests.pair_id('trainer_a', 'client_c'), 'Планка', '2026-09-15') returning id into v_hw;
  insert into public.homework_occurrences (homework_id, due_on, done_at) values (v_hw, '2026-09-15', '2026-09-15 10:00+03');
end $$;
select tests.fill_september();

create table tests.cards (name text primary key, id uuid not null);
grant select, insert on tests.cards to anon, authenticated;
create function tests.card(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.cards where name = p_name
$$;

-- =========================================================================================================
-- my_monthly_report

select tests.authenticate_as_anon();
select throws_ok($$ select public.my_monthly_report('2026-09-01') $$, '42501', null, 'report: anon cannot call it');

select tests.authenticate_as('client_d');
select is(public.my_monthly_report('2026-09-01'), null, 'report: a month without activity has none');

select tests.authenticate_as('trainer_a');
select is(public.my_monthly_report('2026-09-01'), null, 'report: the trainer gets only their own, never the client''s');

select tests.authenticate_as('client_c');
select is(public.my_monthly_report(date_trunc('month', now())::date), null, 'report: the current month has none yet');
select is(public.my_monthly_report('2026-09-02'), null, 'report: a month is given by its 1st day');
select is(public.my_monthly_report('2026-09-01') #> '{sessions,total}', '2', 'sessions: attended ones, in the client''s time zone');
select is(public.my_monthly_report('2026-09-01') #>> '{sessions,trainers,0,name}', 'Ира Тренер', 'sessions: with whom');
select is(public.my_monthly_report('2026-09-01')->'workouts', '1', 'workouts: the logged ones');
select is(public.my_monthly_report('2026-09-01') #>> '{records,0,name}', 'Squat', 'records: the new record with its exercise');
select is(public.my_monthly_report('2026-09-01')->'measurements', '[{"kind": "weight", "from": 80.00, "to": 78.50}]'::jsonb,
          'measurements: first and last value of kinds measured twice');
select is(public.my_monthly_report('2026-09-01')->'nutrition', '{"logged_days": 2, "target_days": 2, "on_target_days": 1}'::jsonb,
          'nutrition: days on target within 10%');
select is(public.my_monthly_report('2026-09-01')->'steps', '{"days": 2, "average": 9000}'::jsonb, 'steps: the manual value wins');
select is(public.my_monthly_report('2026-09-01')->'sleep', '{"days": 2, "average_min": 450}'::jsonb, 'sleep: the average');
select is(public.my_monthly_report('2026-09-01')->'homework', '{"done": 1, "total": 1}'::jsonb, 'homework: done out of due');
select is(public.my_monthly_report('2026-08-01'), null, 'report: August has nothing of its own');

-- =========================================================================================================
-- Story cards

insert into tests.cards values ('sessions', public.create_story_card('2026-09-01', 'sessions'));
insert into tests.cards values ('trainer', public.create_story_card('2026-09-01', 'trainer', tests.pair_id('trainer_a', 'client_c')));
select throws_ok($$ select public.create_story_card('2026-09-01', 'weight') $$, 'P0001', 'confirm_required',
                 'cards: a body number needs the client''s confirmation');
insert into tests.cards values ('weight', public.create_story_card('2026-09-01', 'weight', null, true));
select throws_ok($$ select public.create_story_card('2026-09-01', 'trainer', gen_random_uuid()) $$, 'P0001', 'nothing_to_show',
                 'cards: no card for a trainer without sessions');
select throws_ok($$ select public.create_story_card('2026-08-01', 'sessions') $$, 'P0001', 'no_report',
                 'cards: no card without a report');
select tests.clear_authentication();

select tests.authenticate_as_anon();
select is(public.story_card(tests.card('sessions')), '{"kind": "sessions", "month": "2026-09-01", "data": {"count": 2}}'::jsonb,
          'cards: the image route reads a card by its id without an account');
select is(public.story_card(tests.card('trainer'))->'data', '{"count": 2, "name": "Ира Тренер"}'::jsonb,
          'cards: sessions with the trainer');
select is(public.story_card(tests.card('weight'))->'data', '{"change": -1.5}'::jsonb, 'cards: the confirmed weight change');
select throws_ok($$ select * from public.story_cards $$, '42501', null, 'cards: anon cannot read the table');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.story_cards), 0, 'cards: nobody else reads the client''s cards');
select tests.clear_authentication();

update public.story_cards set expires_at = now() - interval '1 minute' where id = tests.card('weight');
select is(public.story_card(tests.card('weight')), null, 'cards: an expired card is gone');

-- =========================================================================================================
-- The message on the 1st (Moscow is UTC+3)

select is(private.queue_monthly_reports('2026-10-01 06:00+00'), 0, 'message: not before 10:00 of the client');
select is(private.queue_monthly_reports('2026-10-01 07:30+00'), 1, 'message: queued for the client with a report only');
select is(private.queue_monthly_reports('2026-10-01 08:00+00'), 0, 'message: once a month');
select is((select x.payload::text from public.notification_outbox x
           where x.type = 'monthly_report' and x.user_id = tests.user_id('client_c')), '{"month": "2026-09-01"}',
          'message: it names the month');

select * from finish();
rollback;

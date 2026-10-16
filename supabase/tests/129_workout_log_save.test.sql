-- Log writes of migration 20261016234700_workout_log_save.sql (PRD wave-1 §2.10-4..7): a whole log saved in one
-- call by its author, the last result per exercise (WORK-3) and a record marked from the saved sets (WORK-4).
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid);
grant select, insert, update on tests.ids to authenticated;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('bench', (select id from public.exercises where wger_id = 73)),
                             ('squat', (select id from public.exercises where wger_id = 615)),
                             ('pair', tests.pair_id('trainer_a', 'client_c')), ('client', tests.user_id('client_c'));

-- A log of the pair: bench 95 × 5 twice and a warm-up, then squats by reps.
create function tests.log_json(p_id uuid, p_days integer, p_weight numeric) returns jsonb language sql stable
set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', p_id, 'client_id', tests.i('client'), 'coaching_id', tests.i('pair'),
    'performed_at', pg_catalog.now() - pg_catalog.make_interval(days => p_days),
    'local_date', ((pg_catalog.now() - pg_catalog.make_interval(days => p_days)) at time zone 'UTC')::date,
    'title', 'Верх',
    'exercises', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('exercise_id', tests.i('bench'), 'sets', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('reps', 10, 'weight_kg', 40, 'is_warmup', true),
        pg_catalog.jsonb_build_object('reps', 5, 'weight_kg', p_weight),
        pg_catalog.jsonb_build_object('reps', 5, 'weight_kg', p_weight))),
      pg_catalog.jsonb_build_object('exercise_id', tests.i('squat'), 'notes', 'Без веса',
        'sets', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('reps', 20)))))
$$;

-- =========================================================================================================

select tests.authenticate_as('trainer_a');
insert into tests.ids values ('log1', public.save_workout_log(tests.log_json(null, 7, 95)));
select results_eq(
  $$ select e.position::integer, s.position::integer, s.reps::integer, s.weight_kg, s.is_warmup
     from public.workout_log_exercises e join public.workout_sets s on s.log_exercise_id = e.id
     where e.log_id = tests.i('log1') order by 1, 2 $$,
  $$ values (1, 1, 10, 40.00, true), (1, 2, 5, 95.00, false), (1, 3, 5, 95.00, false), (2, 1, 20, null::numeric, false) $$,
  'save: exercises and sets in the given order'
);
select is((select created_by from public.workout_logs where id = tests.i('log1')), tests.user_id('trainer_a'), 'save: the trainer is the author');

insert into tests.ids values ('log2', public.save_workout_log(tests.log_json(null, 1, 100)));
select results_eq(
  $$ select value, set_id in (select s.id from public.workout_sets s join public.workout_log_exercises e on e.id = s.log_exercise_id
                               where e.log_id = tests.i('log2'))
     from public.visible_personal_records where client_id = tests.user_id('client_c') and exercise_id = tests.i('bench')
       and record_type = 'max_weight' $$,
  $$ values (100.00, true) $$,
  'record: 100 kg after a best of 95 is the record, set in the new log (WORK-4)'
);
select results_eq(
  $$ select r.log_id, (r.sets -> 1 ->> 'weight_kg')::numeric from public.last_exercise_results(
       tests.user_id('client_c'), array[tests.i('bench')], now() - interval '2 days') r $$,
  $$ values (tests.i('log1'), 95.00) $$,
  'last result: the latest log before the moment (WORK-3)'
);
select results_eq(
  $$ select r.log_id from public.last_exercise_results(tests.user_id('client_c'), array[tests.i('bench'), tests.i('squat')]) r
     order by r.exercise_id = tests.i('bench') desc $$,
  $$ values (tests.i('log2')), (tests.i('log2')) $$,
  'last result: one row per exercise, the newest log'
);

-- An edit replaces the exercises and sets; the record follows.
select lives_ok($$ select public.save_workout_log(tests.log_json(tests.i('log2'), 1, 90)) $$, 'edit: the author edits');
select is(
  (select count(*) from public.workout_log_exercises where log_id = tests.i('log2')), 2::bigint,
  'edit: the old exercises are replaced'
);
select is(
  (select value from public.visible_personal_records where client_id = tests.user_id('client_c')
     and exercise_id = tests.i('bench') and record_type = 'max_weight'),
  95.00,
  'edit: the record falls back to 95'
);

select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 1, 90) || '{"exercises": 1}'::jsonb) $$,
  '22023', null, 'save: exercises must be a list'
);
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 1, 90) || jsonb_build_object('local_date', '2001-01-01')) $$,
  '22023', null, 'save: the date must match the moment'
);

select tests.authenticate_as('trainer_b');
select throws_ok($$ select public.save_workout_log(tests.log_json(null, 1, 90)) $$, '42501', null,
  'save: another trainer cannot log for this pair');

-- The client: a self log, which the trainer cannot edit.
select tests.authenticate_as('client_c');
insert into tests.ids values ('self', public.save_workout_log(
  tests.log_json(null, 0, 50) - 'coaching_id'));
select is((select coaching_id from public.workout_logs where id = tests.i('self')), null, 'client: a self log');
select throws_ok($$ select public.save_workout_log(tests.log_json(tests.i('log1'), 7, 120)) $$, 'P0002', null,
  'client: the trainer''s log is not the client''s to edit (2.10-10)');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(tests.i('self'), 0, 120) - 'coaching_id') $$, 'P0002', null,
  'trainer: the client''s self log is not the trainer''s to edit'
);

select tests.clear_authentication();
select * from finish();
rollback;

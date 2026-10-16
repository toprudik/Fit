-- Template writes of migration 20261016235300_workout_template_save.sql (PRD wave-1 §2.10-7, WORK-5): a whole
-- template saved in one call by a trainer, edited only by its owner, and never with another trainer's exercise.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');

create table tests.ids (name text primary key, id uuid);
grant select, insert, update on tests.ids to authenticated;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('bench', (select id from public.exercises where wger_id = 73)),
                             ('squat', (select id from public.exercises where wger_id = 615)),
                             ('own_b', gen_random_uuid());
insert into public.exercises (id, source, owner_id, name) values (tests.i('own_b'), 'custom', tests.user_id('trainer_b'), 'B sled');

create function tests.tpl_json(p_id uuid, p_title text, p_exercise uuid) returns jsonb language sql stable
set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', p_id, 'title', p_title, 'notes', ' ',
    'items', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('exercise_id', p_exercise, 'target_sets', 3, 'target_reps', 8, 'target_weight_kg', 60),
      pg_catalog.jsonb_build_object('exercise_id', tests.i('squat'), 'target_sets', 2, 'target_duration_s', 45, 'rest_s', 90)))
$$;

-- =========================================================================================================

select tests.authenticate_as('trainer_a');
insert into tests.ids values ('tpl', public.save_workout_template(tests.tpl_json(null, ' Верх ', tests.i('bench'))));
select results_eq(
  $$ select t.title, t.notes, t.owner_id from public.workout_templates t where t.id = tests.i('tpl') $$,
  $$ values ('Верх', null::text, tests.user_id('trainer_a')) $$,
  'save: trimmed title, empty notes dropped, the trainer owns it'
);
select results_eq(
  $$ select position::integer, exercise_id, target_sets::integer, target_reps::integer, target_weight_kg,
            target_duration_s, rest_s::integer
     from public.workout_template_items where template_id = tests.i('tpl') order by position $$,
  $$ values (1, tests.i('bench'), 3, 8, 60.00, null::integer, null::integer),
            (2, tests.i('squat'), 2, null::integer, null::numeric, 45, 90) $$,
  'save: items and targets in the given order'
);

select lives_ok($$ select public.save_workout_template(tests.tpl_json(tests.i('tpl'), 'Низ', tests.i('squat'))) $$,
  'edit: the owner edits');
select results_eq(
  $$ select (select title from public.workout_templates where id = tests.i('tpl')),
            (select count(*) from public.workout_template_items where template_id = tests.i('tpl')) $$,
  $$ values ('Низ', 2::bigint) $$,
  'edit: the title changes and the items are replaced'
);

select throws_ok(
  $$ select public.save_workout_template(tests.tpl_json(null, 'Пусто', tests.i('bench')) || '{"items": []}'::jsonb) $$,
  '22023', null, 'save: a template needs an exercise'
);
select throws_ok(
  $$ select public.save_workout_template(tests.tpl_json(null, 'Чужое', tests.i('own_b'))) $$,
  '42501', null, 'save: another trainer''s own exercise is not allowed'
);

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.save_workout_template(tests.tpl_json(tests.i('tpl'), 'Моё', tests.i('bench'))) $$,
  'P0002', null, 'edit: another trainer cannot edit it'
);
select is((select count(*) from public.workout_templates where id = tests.i('tpl')), 0::bigint,
  'read: another trainer does not see it');

select tests.authenticate_as('client_c');
select throws_ok($$ select public.save_workout_template(tests.tpl_json(null, 'Свой', tests.i('bench'))) $$, '42501', null,
  'save: a client cannot make templates in wave 1');

select tests.clear_authentication();
select * from finish();
rollback;

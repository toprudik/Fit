-- Error branches of the diary, workout and report functions that no other test reached: the "not signed in"
-- guards of add_water, undo_water, set_activity, create_story_card, issue_ingest_token, my_monthly_report,
-- my_monthly_report_shares, share_monthly_report and record_app_open; the input checks of set_activity, save_food,
-- save_dish, save_workout_log, save_workout_template, save_homework and mark_homework_done. Each refusal is checked
-- with its exact SQLSTATE and message, next to a valid call that succeeds, and where it matters that a refused call
-- wrote nothing.
--
-- "Not signed in" is tested two ways. A request without a session runs as anon, which has no EXECUTE on any of these
-- functions, so it stops at 42501 "permission denied" before the body runs. The message branch itself is reached by
-- the authenticated role with no JWT subject (auth.uid() is null), which is what the guard defends against.
begin;
\ir _helpers.psql
select plan(73);

-- C trains with A; B is another trainer.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set time_zone = 'UTC' where user_id = tests.user_id('client_c');

create table tests.ids (name text primary key, id uuid);
grant select, insert, update on tests.ids to authenticated;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('bench', (select id from public.exercises where wger_id = 73)),
                             ('squat', (select id from public.exercises where wger_id = 615)),
                             ('pair', tests.pair_id('trainer_a', 'client_c')),
                             ('client', tests.user_id('client_c'));

-- The authenticated role with no JWT subject: auth.uid() is null, so the "not signed in" branches run.
create function tests.authenticate_without_sub() returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('role', 'authenticated', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
end;
$$;

-- Yesterday in the client's zone: a valid diary day whichever zone the day check reads.
select private.client_today(tests.user_id('client_c')) - 1 as yesterday,
       private.user_month(tests.user_id('client_c')) as this_month \gset

-- A log of the pair performed a day ago; p_shift moves local_date away from performed_at.
create function tests.log_json(p_id uuid, p_shift integer, p_exercises jsonb) returns jsonb language sql stable
set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', p_id, 'client_id', tests.i('client'), 'coaching_id', tests.i('pair'), 'title', 'Верх',
    'performed_at', pg_catalog.now() - interval '1 day',
    'local_date', ((pg_catalog.now() - interval '1 day') at time zone 'UTC')::date + p_shift,
    'exercises', p_exercises)
$$;
create function tests.sets(p_count integer) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('reps', 5, 'weight_kg', 60)), '[]')
  from pg_catalog.generate_series(1, p_count)
$$;

-- =========================================================================================================
-- Water and activity: not signed in, and set_activity's metric check

select tests.authenticate_as_anon();
select throws_ok($$ select public.add_water(current_date, 250) $$, '42501', 'permission denied for function add_water',
  'add_water: a request without a session cannot call it');
select throws_ok($$ select public.undo_water(current_date) $$, '42501', 'permission denied for function undo_water',
  'undo_water: a request without a session cannot call it');
select throws_ok($$ select public.set_activity(current_date, 'steps', 8000) $$, '42501',
  'permission denied for function set_activity', 'set_activity: a request without a session cannot call it');

select tests.authenticate_without_sub();
select throws_ok($$ select public.add_water(current_date, 250) $$, '42501', 'not signed in',
  'add_water: no user in the token is refused');
select throws_ok($$ select public.undo_water(current_date) $$, '42501', 'not signed in',
  'undo_water: no user in the token is refused');
select throws_ok($$ select public.set_activity(current_date, 'steps', 8000) $$, '42501', 'not signed in',
  'set_activity: no user in the token is refused');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select lives_ok(format('select public.add_water(%L, 250)', :'yesterday'), 'add_water: the signed-in client adds a glass');
select is(public.undo_water(:'yesterday'), 250, 'undo_water: the signed-in client takes it back');
select throws_ok(format('select public.set_activity(%L, %L, 500)', :'yesterday', 'water'), '22023',
  'set_activity takes steps or sleep', 'set_activity: water is refused, it goes through add_water');
select lives_ok(format('select public.set_activity(%L, %L, 8000)', :'yesterday', 'steps'),
  'set_activity: steps are taken');
select tests.clear_authentication();

select results_eq(
  format('select metric::text, value from public.activity_entries where client_id = %L and local_date = %L order by 1',
         tests.user_id('client_c'), :'yesterday'),
  $$ values ('steps', 8000) $$,
  'set_activity: the refused water value wrote nothing, the steps are there');

-- =========================================================================================================
-- Own products and dishes: name and serving checks

select tests.authenticate_as('client_c');
select throws_ok($$ select public.save_food(null, '   ', 343) $$, '22023', 'invalid_name',
  'save_food: a blank name is refused');
select throws_ok($$ select public.save_food(null, repeat('я', 201), 343) $$, '22023', 'invalid_name',
  'save_food: a name over 200 characters is refused');
select throws_ok($$ select public.save_food(null, 'Гречка', 343, p_serving_g => 0) $$, '22023', 'invalid_serving',
  'save_food: a zero serving is refused');
select throws_ok($$ select public.save_food(null, 'Гречка', 343, p_serving_g => 5001) $$, '22023', 'invalid_serving',
  'save_food: a serving over 5 kg is refused');
select lives_ok(
  $$ insert into tests.ids values ('buckwheat', public.save_food(null, repeat('г', 200), 343, 12.6, 3.3, 62, 5000)) $$,
  'save_food: a 200-character name and a 5 kg serving are taken');
select tests.clear_authentication();

select is(
  (select count(*)::int from public.foods where owner_id = tests.user_id('client_c') and kind = 'product'), 1,
  'save_food: the refused products wrote nothing');

select tests.authenticate_as('client_c');
select throws_ok(
  format($$ select public.save_dish(null, ' ', '[{"food_id":"%s","grams":100}]') $$, tests.i('buckwheat')),
  '22023', 'invalid_name', 'save_dish: a blank name is refused');
select throws_ok(
  format($$ select public.save_dish(null, 'Каша', '[{"food_id":"%s","grams":100}]', 0) $$, tests.i('buckwheat')),
  '22023', 'invalid_serving', 'save_dish: a zero total weight is refused');
select throws_ok(
  format($$ select public.save_dish(null, 'Каша', '[{"food_id":"%s","grams":100}]', 50001) $$, tests.i('buckwheat')),
  '22023', 'invalid_serving', 'save_dish: a total weight over 50 kg is refused');
select throws_ok(
  format($$ select public.save_dish(null, 'Каша', '[{"food_id":"%s","grams":100}]', 10) $$, tests.i('buckwheat')),
  '22023', 'invalid_serving', 'save_dish: a total weight that makes it over 900 kcal per 100 g is refused');
select lives_ok(
  format($$ select public.save_dish(null, 'Гречневая каша', '[{"food_id":"%s","grams":100}]', 300) $$, tests.i('buckwheat')),
  'save_dish: a dish with a sane weight is taken');
select tests.clear_authentication();

select is(
  (select count(*)::int from public.foods where owner_id = tests.user_id('client_c') and kind = 'dish'), 1,
  'save_dish: the refused dishes wrote nothing');

-- =========================================================================================================
-- Workout logs and templates

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.save_workout_log(tests.log_json(null, 0, null)) $$, '22023',
  'a log holds 1 to 30 exercises', 'save_workout_log: a log without an exercise list is refused');
select throws_ok($$ select public.save_workout_log(tests.log_json(null, 0, '[]'::jsonb)) $$, '22023',
  'a log holds 1 to 30 exercises', 'save_workout_log: an empty exercise list is refused (20261018134237)');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 0,
       (select jsonb_agg(jsonb_build_object('exercise_id', tests.i('bench'), 'sets', '[]'::jsonb)) from generate_series(1, 31)))) $$,
  '22023', 'a log holds 1 to 30 exercises', 'save_workout_log: 31 exercises are refused');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 5,
       jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'), 'sets', tests.sets(1))))) $$,
  '22023', 'local_date does not match performed_at', 'save_workout_log: a local date five days off the moment is refused');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 0, jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'))))) $$,
  '22023', 'an exercise holds 0 to 30 sets', 'save_workout_log: an exercise without a set list is refused');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(null, 0,
       jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'), 'sets', tests.sets(31))))) $$,
  '22023', 'an exercise holds 0 to 30 sets', 'save_workout_log: 31 sets are refused');
select tests.clear_authentication();

select is((select count(*)::int from public.workout_logs where client_id = tests.user_id('client_c')), 0,
  'save_workout_log: the refused logs wrote nothing, not even the log row inserted before the set check');

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into tests.ids values ('log', public.save_workout_log(tests.log_json(null, 0,
       jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'), 'sets', tests.sets(30)))))) $$,
  'save_workout_log: a log with 30 sets is taken');
select tests.clear_authentication();

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(tests.i('log'), 0,
       jsonb_build_array(jsonb_build_object('exercise_id', tests.i('squat'), 'sets', tests.sets(1)))) || '{"title":"Чужой"}') $$,
  'P0002', 'no such log, or it is not yours to edit', 'save_workout_log: another trainer cannot edit the log');
select throws_ok(
  $$ select public.save_workout_log(tests.log_json(gen_random_uuid(), 0,
       jsonb_build_array(jsonb_build_object('exercise_id', tests.i('squat'), 'sets', tests.sets(1))))) $$,
  'P0002', 'no such log, or it is not yours to edit', 'save_workout_log: an unknown log id is refused');
select tests.clear_authentication();

select results_eq(
  $$ select l.title, (select count(*)::int from public.workout_log_exercises e where e.log_id = l.id)
     from public.workout_logs l where l.id = tests.i('log') $$,
  $$ values ('Верх', 1) $$,
  'save_workout_log: the log is as its author saved it');

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.save_workout_template('{"title":"Верх","items":[]}') $$, '22023',
  'a template holds 1 to 30 exercises', 'save_workout_template: an empty template is refused');
select throws_ok($$ select public.save_workout_template('{"title":"Верх"}') $$, '22023',
  'a template holds 1 to 30 exercises', 'save_workout_template: a template without items is refused');
select throws_ok(
  $$ select public.save_workout_template(jsonb_build_object('title', 'Верх',
       'items', (select jsonb_agg(jsonb_build_object('exercise_id', tests.i('bench'), 'target_sets', 3)) from generate_series(1, 31)))) $$,
  '22023', 'a template holds 1 to 30 exercises', 'save_workout_template: 31 items are refused');
select lives_ok(
  $$ insert into tests.ids values ('tpl', public.save_workout_template(jsonb_build_object('title', 'Верх',
       'items', jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'), 'target_sets', 3))))) $$,
  'save_workout_template: a template with one item is taken');
select tests.clear_authentication();

select is((select count(*)::int from public.workout_templates where owner_id = tests.user_id('trainer_a')), 1,
  'save_workout_template: the refused templates wrote nothing');

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.save_workout_template(jsonb_build_object('id', tests.i('tpl'), 'title', 'Чужой',
       'items', jsonb_build_array(jsonb_build_object('exercise_id', tests.i('squat'), 'target_sets', 1)))) $$,
  'P0002', 'no such template, or it is not yours to edit', 'save_workout_template: another trainer cannot edit it');
select tests.clear_authentication();

select is((select title from public.workout_templates where id = tests.i('tpl')), 'Верх',
  'save_workout_template: the template keeps its title');

-- =========================================================================================================
-- Homework: input shape, no dates left, and the client's comment

select private.pair_client_today(tests.i('pair')) as hw_today,
       extract(isodow from private.pair_client_today(tests.i('pair')))::int as hw_dow \gset

select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка',
         'due_date', :'hw_today', 'exercises', jsonb_build_object('exercise_id', tests.i('bench')))),
  '22023', 'exercises is a list of up to 30', 'save_homework: exercises that are not a list are refused');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка',
         'due_date', :'hw_today',
         'exercises', (select jsonb_agg(jsonb_build_object('exercise_id', tests.i('bench'))) from generate_series(1, 31)))),
  '22023', 'exercises is a list of up to 30', 'save_homework: 31 exercises are refused');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'due_date', :'hw_today')),
  '22023', 'title and due_date are required, weekdays go with repeat_until', 'save_homework: a title is required');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка')),
  '22023', 'title and due_date are required, weekdays go with repeat_until', 'save_homework: a due date is required');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка',
         'due_date', :'hw_today', 'repeat_until', :'hw_today'::date + 7)),
  '22023', 'title and due_date are required, weekdays go with repeat_until',
  'save_homework: an end date without weekdays is refused');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка',
         'due_date', :'hw_today', 'repeat_until', :'hw_today', 'repeat_weekdays', jsonb_build_array(:hw_dow % 7 + 1))),
  'P0001', 'no_dates', 'save_homework: weekdays that miss every day up to the end date are refused');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка',
         'due_date', :'hw_today', 'repeat_until', :'hw_today'::date - 1, 'repeat_weekdays', jsonb_build_array(:hw_dow))),
  'P0001', 'no_dates', 'save_homework: an end date before the due date is refused');
select tests.clear_authentication();

select is((select count(*)::int from public.homework where coaching_id = tests.i('pair')), 0,
  'save_homework: the refused homework wrote nothing');

select tests.authenticate_as('trainer_a');
select lives_ok(
  format('insert into tests.ids values (%L, public.save_homework(%L))', 'hw',
         jsonb_build_object('coaching_id', tests.i('pair'), 'title', 'Планка', 'due_date', :'hw_today',
                            'repeat_until', :'hw_today', 'repeat_weekdays', jsonb_build_array(:hw_dow),
                            'exercises', jsonb_build_array(jsonb_build_object('exercise_id', tests.i('bench'))))),
  'save_homework: the weekday of the due date gives one date, and the homework is taken');
select tests.clear_authentication();

insert into tests.ids select 'occ', o.id from public.homework_occurrences o where o.homework_id = tests.i('hw');

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.mark_homework_done(tests.i('occ'), repeat('а', 1001)) $$, '22023',
  'a comment holds up to 1000 characters', 'mark_homework_done: a comment over 1000 characters is refused');
select is((select done_at from public.homework_occurrences where id = tests.i('occ')), null,
  'mark_homework_done: the refused mark left the homework undone');
select lives_ok($$ select public.mark_homework_done(tests.i('occ'), '  ' || repeat('а', 1000) || '  ') $$,
  'mark_homework_done: 1000 characters, spaces around them trimmed, are taken');
select tests.clear_authentication();

select results_eq(
  $$ select done_at is not null, char_length(comment) from public.homework_occurrences where id = tests.i('occ') $$,
  $$ values (true, 1000) $$,
  'mark_homework_done: the homework is done with the trimmed comment');

-- =========================================================================================================
-- Story cards, ingest tokens, monthly reports and app opens: not signed in

select tests.authenticate_as_anon();
select throws_ok($$ select public.create_story_card(current_date, 'sessions') $$, '42501',
  'permission denied for function create_story_card', 'create_story_card: a request without a session cannot call it');
select throws_ok($$ select public.issue_ingest_token() $$, '42501',
  'permission denied for function issue_ingest_token', 'issue_ingest_token: a request without a session cannot call it');
select throws_ok($$ select public.my_monthly_report(current_date) $$, '42501',
  'permission denied for function my_monthly_report', 'my_monthly_report: a request without a session cannot call it');
select throws_ok($$ select public.my_monthly_report_shares(current_date) $$, '42501',
  'permission denied for function my_monthly_report_shares',
  'my_monthly_report_shares: a request without a session cannot call it');
select throws_ok($$ select public.share_monthly_report(current_date, gen_random_uuid()) $$, '42501',
  'permission denied for function share_monthly_report', 'share_monthly_report: a request without a session cannot call it');
select throws_ok($$ select public.record_app_open('daily_digest') $$, '42501',
  'permission denied for function record_app_open', 'record_app_open: a request without a session cannot call it');

select tests.authenticate_without_sub();
select throws_ok($$ select public.create_story_card(current_date, 'sessions') $$, '42501', 'not signed in',
  'create_story_card: no user in the token is refused');
select throws_ok($$ select public.issue_ingest_token() $$, '42501', 'not signed in',
  'issue_ingest_token: no user in the token is refused');
select throws_ok($$ select public.my_monthly_report(current_date) $$, '42501', 'not signed in',
  'my_monthly_report: no user in the token is refused');
select throws_ok($$ select public.my_monthly_report_shares(current_date) $$, '42501', 'not signed in',
  'my_monthly_report_shares: no user in the token is refused');
select throws_ok($$ select public.share_monthly_report(current_date, gen_random_uuid()) $$, '42501', 'not signed in',
  'share_monthly_report: no user in the token is refused');
select throws_ok($$ select public.record_app_open('daily_digest') $$, '42501', 'not_authenticated',
  'record_app_open: no user in the token is refused');
select tests.clear_authentication();

-- The same calls signed in get past the guard: the month in progress has no report yet.
select tests.authenticate_as('client_c');
select throws_ok(format('select public.create_story_card(%L, %L)', :'this_month', 'sessions'), 'P0001', 'no_report',
  'create_story_card: the signed-in client gets past the guard (no report for the month in progress)');
select matches(public.issue_ingest_token(), '^dft_[A-Za-z0-9_-]+$', 'issue_ingest_token: the signed-in client gets a token');
select is(public.my_monthly_report(:'this_month'), null, 'my_monthly_report: the signed-in client gets past the guard');
select is(public.my_monthly_report_shares(:'this_month'), '[]'::jsonb,
  'my_monthly_report_shares: the signed-in client gets past the guard');
select throws_ok(format('select public.share_monthly_report(%L, %L)', :'this_month'::date - interval '1 month', gen_random_uuid()),
  'P0001', 'pair_not_found', 'share_monthly_report: the signed-in client gets past the guard (unknown pair)');
select lives_ok($$ select public.record_app_open('daily_digest') $$, 'record_app_open: the signed-in client records an open');
select tests.clear_authentication();

select results_eq(
  format('select (select count(*)::int from public.app_opens where user_id = %1$L),
                 (select count(*)::int from public.ingest_tokens where user_id = %1$L)', tests.user_id('client_c')),
  $$ values (1, 1) $$,
  'record_app_open and issue_ingest_token: one row each, from the signed-in calls only');

select * from finish();
rollback;

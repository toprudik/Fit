-- Water and steps goals the trainer sets with the client's target (migration 20261017163054_trainer_activity_goals.sql,
-- wave-2 §4 rules 5 and 7): stored on the trainer target, read by the client, bounded, null back to the defaults.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.pairs (name text primary key, id uuid not null);
grant select on tests.pairs to authenticated;
insert into tests.pairs values ('a_c', tests.pair_id('trainer_a', 'client_c'));
create function tests.p(p_name text) returns uuid language sql stable set search_path = '' as $$
  select p.id from tests.pairs p where p.name = p_name
$$;

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 2000, p_water_ml => 2500, p_steps_target => 10000) $$,
  '4.5/4.7: the trainer sets water and steps goals with the target');
select is(
  (select array[water_ml::int, steps_target::int] from public.nutrition_targets
   where coaching_id = tests.p('a_c') and effective_to is null),
  array[2500, 10000], 'both goals are stored on the trainer target');
select throws_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 2000, p_water_ml => 10001) $$, '22023', 'invalid_target',
  'water over 10 l is refused');
select throws_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 2000, p_steps_target => -1) $$, '22023', 'invalid_target',
  'negative steps are refused');
select tests.clear_authentication();

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 2000, p_steps_target => 5000) $$, '42501', null,
  'another trainer cannot set the goals');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is(
  (select array[t.water_ml::int, t.steps_target::int] from public.nutrition_targets t
   where t.id = (select m.id from public.my_nutrition_target() m)),
  array[2500, 10000], 'the client reads the goals of the active target');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 2100, p_water_ml => 0) $$,
  'saving without goals, or with 0, keeps the defaults');
select is(
  (select array[water_ml, steps_target] from public.nutrition_targets
   where coaching_id = tests.p('a_c') and effective_to is null),
  array[null, null]::integer[], 'the new version has no goals of its own');
select tests.clear_authentication();

select ok(
  not has_function_privilege('anon', 'public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean, integer, integer)', 'execute'),
  'anon cannot set a target');

select * from finish();
rollback;

-- wger catalog of migration 20261016231700_wger_catalog.sql and the library search of 20261016232700_exercise_search.sql
-- (PRD 2.10-1..3): the catalog is there with license and source on every row, "присед" finds Russian names
-- (WORK-1), a trainer's own exercise is found by that trainer and their clients only (WORK-2).
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

insert into public.exercises (id, source, owner_id, name, category)
values ('00000000-0000-4000-8000-000000000128', 'custom', tests.user_id('trainer_a'), 'Присед с паузой у А', 'legs');

-- =========================================================================================================

select cmp_ok((select count(*) from public.exercises where source = 'wger'), '>', 900::bigint, 'catalog: wger is imported');
select is(
  (select count(*) from public.exercises e
   where e.source = 'wger'
     and (e.license not in ('CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'CC0-1.0') or e.source_url !~ '^https://wger\.de/exercise/\d+/view/$'
          or not exists (select 1 from public.exercise_translations t where t.exercise_id = e.id and t.locale = 'en'))),
  0::bigint,
  'catalog: every wger exercise has its license, a link to wger and an English name (PRD 2.10-2)'
);
select cmp_ok(
  (select count(*) from public.exercise_translations t join public.exercises e on e.id = t.exercise_id
   where e.source = 'wger' and t.locale = 'ru'),
  '>=', 100::bigint,
  'catalog: common exercises have Russian names'
);
select is(
  (select array_agg(distinct category order by category) from public.exercises where source = 'wger'),
  '{abs,arms,back,calves,cardio,chest,legs,shoulders}',
  'catalog: categories are the keys the app translates'
);

select tests.authenticate_as('trainer_a');
select is(
  (select name from public.search_exercises('присед', 'ru') limit 1) ~* '^присед',
  true,
  'search: "присед" finds a Russian name starting with it first (WORK-1)'
);
select ok(
  'Приседания' in (select name from public.search_exercises('присед', 'ru')),
  'search: wger "Squats" is found by its Russian name'
);
select ok(
  'Приседания' in (select name from public.search_exercises('squats', 'ru')),
  'search: an English query finds the exercise and names it in Russian'
);
select ok(
  'Squats' in (select name from public.search_exercises('squats', 'en')),
  'search: in English the English name'
);
select results_eq(
  $$ select name, own from public.search_exercises('пауз', 'ru') $$,
  $$ values ('Присед с паузой у А'::text, true) $$,
  'search: the trainer finds their own exercise, marked own'
);
select results_eq(
  $$ select count(*) from public.search_exercises(null, 'ru', 'legs', true) $$,
  $$ values (1::bigint) $$,
  'search: own only, by category'
);
select is((select count(*) from public.search_exercises('%%', 'ru')), 0::bigint, 'search: % in the query is literal');
select is((select count(*) from public.search_exercises(null, 'ru', null, false, 500)), 50::bigint, 'search: at most 50 rows a call');

select tests.authenticate_as('trainer_b');
select is((select count(*) from public.search_exercises('пауз', 'ru')), 0::bigint,
  'search: another trainer does not find it (WORK-2)');

select tests.authenticate_as('client_c');
select results_eq(
  $$ select name, own from public.search_exercises('пауз', 'ru') $$,
  $$ values ('Присед с паузой у А'::text, false) $$,
  'search: the client of the trainer finds it, not own'
);

select tests.clear_authentication();
select * from finish();
rollback;

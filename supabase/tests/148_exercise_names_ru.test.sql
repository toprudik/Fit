-- Russian names for the whole wger catalog (migration 20261017155000_exercise_names_ru.sql, PRD 2.10-3): every wger
-- exercise has a Russian name, so a Russian-speaking user never sees an English one in the library, and search finds it.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');

select is(
  (select count(*) from public.exercises e
   where e.source = 'wger'
     and not exists (select 1 from public.exercise_translations t where t.exercise_id = e.id and t.locale = 'ru')),
  0::bigint,
  'every wger exercise has a Russian name'
);
select is(
  (select t.name from public.exercise_translations t join public.exercises e on e.id = t.exercise_id
   where e.wger_id = 9 and t.locale = 'ru'),
  'Махи гирей двумя руками',
  'a name wger had only in English now reads in Russian'
);

select tests.authenticate_as('trainer_a');
select ok(
  exists (select 1 from public.search_exercises('махи гирей', 'ru') s where s.name = 'Махи гирей двумя руками'),
  'the library search finds the new Russian name'
);

select * from finish();
rollback;

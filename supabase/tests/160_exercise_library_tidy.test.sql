-- Tidier exercise library (migration 20261022210637_exercise_library_tidy.sql, PRD 2.10-1..3): the search lists one
-- wger exercise per name in the caller's language, the hidden twins stay readable by id, a trainer's own exercise
-- is never folded into a wger one, the two wger rows that are not exercises are gone from the library, and a few
-- exercises sit in the muscle group a person looks for them in.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('trainer_a');
insert into public.exercises (id, source, owner_id, name, category)
values ('00000000-0000-4000-8000-000000000160', 'custom', tests.user_id('trainer_a'), 'Бег', 'cardio');

select tests.authenticate_as('trainer_a');

select is(
  (select count(*) from public.search_exercises('бег', 'ru') where source = 'wger' and lower(name) = 'бег'),
  1::bigint,
  'one wger «Бег», though wger has two'
);
select is(
  (select count(*) from public.search_exercises('бег', 'ru') where own and name = 'Бег'),
  1::bigint,
  'a trainer''s own exercise is listed next to the wger one of the same name'
);
select is(
  (select count(*) from (
     select lower(s.name) from generate_series(0, 450, 50) o
     cross join lateral public.search_exercises(null, 'ru', 'back', false, 50, o) s
     where s.source = 'wger' group by 1 having count(*) > 1) twins),
  0::bigint,
  'no wger name repeats in the back category'
);
select is(
  (select count(*) from public.exercises where source = 'wger' and wger_id in (319, 527)),
  2::bigint,
  'both wger «Бег» rows are still readable by id'
);
select is(
  (select count(*) from public.search_exercises('отдых', 'ru') where name = 'Отдых')
    + (select count(*) from public.search_exercises('блейз', 'ru')),
  0::bigint,
  'the timer pause and the studio brand are not in the library'
);
select is(
  (select count(*) from public.search_exercises(null, 'en', 'cardio', false, 50) where name in ('Jogging', 'Run')),
  2::bigint,
  'twins are folded by the name in the caller''s language: in English «Jogging» and «Run» both stay'
);

select is(
  (select array_agg(category order by wger_id) from public.exercises where source = 'wger' and wger_id in (132, 996, 997, 998, 1583)),
  '{cardio,cardio,cardio,cardio,chest}',
  'burpees and mountain climbers are cardio, the close-grip bench press is chest'
);

select tests.clear_authentication();
select * from finish();
rollback;

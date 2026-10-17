-- Nutrition adherence of migration 20261017091027_nutrition_adherence.sql (wave-2 §5): days within ±10%,
-- logged days, today left out, the target of each day, and who sees the numbers.
begin;
\ir _helpers.psql
select plan(16);

-- C trains with A; D trains with B; E keeps a diary without a target.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('user_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_d');

create function tests.today(p_name text) returns date language sql stable security definer set search_path = '' as $$
  select private.client_today(tests.user_id(p_name))
$$;
grant execute on function tests.today(text) to authenticated;
create function tests.eat(p_name text, p_ago integer, p_kcal numeric) returns void language sql set search_path = '' as $$
  insert into public.food_diary_entries (client_id, local_date, meal, kcal)
  values (tests.user_id(p_name), tests.today(p_name) - p_ago, 'lunch', p_kcal)
$$;

-- 5.1: target 2000; five of the last seven days logged; one more entry today and one in the week before.
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_c'), 2000, tests.today('client_c') - 30, tests.user_id('client_c'));
select tests.eat('client_c', 1, 1850);
select tests.eat('client_c', 2, 1000);
select tests.eat('client_c', 2, 1150);
select tests.eat('client_c', 3, 2250);
select tests.eat('client_c', 4, 1700);
select tests.eat('client_c', 6, 2000);
select tests.eat('client_c', 0, 5000);
select tests.eat('client_c', 10, 1900);

-- 5.4: D's target changes from 2000 to 3000; each day is judged by its own.
insert into public.nutrition_targets (source, client_id, kcal, effective_from, effective_to, set_by)
values ('calculator', tests.user_id('client_d'), 2000, tests.today('client_d') - 30, tests.today('client_d') - 2,
        tests.user_id('client_d'));
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_d'), 3000, tests.today('client_d') - 2, tests.user_id('client_d'));
select tests.eat('client_d', 3, 2000);
select tests.eat('client_d', 2, 3000);
-- 5.2: the bounds count as in the norm.
select tests.eat('client_d', 5, 1800);
select tests.eat('client_d', 6, 2200);

select tests.eat('user_e', 1, 2000);

-- =========================================================================================================
-- The client's own numbers

select tests.authenticate_as('client_c');
select is(
  (select array[logged, counted, in_norm, adherence] from public.nutrition_adherence(tests.user_id('client_c'), 7)),
  array[5, 5, 3, 60], '5.1: 3 of 5 logged days in the norm is 60%, and today waits');
select is((select previous_adherence from public.nutrition_adherence(tests.user_id('client_c'), 7)), 100,
  'the week before gives the trend');
select ok((select has_target from public.nutrition_adherence(tests.user_id('client_c'), 7)), 'the client has a target');
select is((select logged from public.nutrition_adherence(tests.user_id('client_c'), 30)), 6, 'thirty days take in more');
select is((select count(*)::int from public.nutrition_adherence(tests.user_id('client_c'), 14)), 0,
  'only 7, 30 and 90 days are periods');
select is((select count(*)::int from public.nutrition_adherence(tests.user_id('client_d'), 7)), 0,
  'another client''s numbers are not shown');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select is(
  (select array[logged, in_norm, adherence] from public.nutrition_adherence(tests.user_id('client_d'), 7)),
  array[4, 4, 100], '5.2, 5.4: the bounds are in, and each day uses its own target');
select tests.clear_authentication();

select tests.authenticate_as('user_e');
select is(
  (select array[logged, counted] from public.nutrition_adherence(tests.user_id('user_e'), 7)), array[1, 0],
  'a day without a target is logged but not judged');
select is((select adherence from public.nutrition_adherence(tests.user_id('user_e'), 7)), null::int,
  'no judged day, no percentage');
select ok(not (select has_target from public.nutrition_adherence(tests.user_id('user_e'), 7)), '"нет нормы"');
select tests.clear_authentication();

-- =========================================================================================================
-- The trainer's list (§5.5)

select tests.authenticate_as('trainer_a');
select is(
  (select array_agg(client_id) from public.trainer_nutrition_adherence(7)), array[tests.user_id('client_c')],
  'the trainer sees their own client');
select is(
  (select array[adherence, logged]::int[] from public.trainer_nutrition_adherence(7)), array[60, 5],
  'with the same numbers the client sees');
select is((select last_day from public.trainer_nutrition_adherence(7)), tests.today('client_c'), 'and the last logged day');
select is((select adherence from public.nutrition_adherence(tests.user_id('client_c'), 7)), 60,
  'the pair''s tab reads the same');
select tests.clear_authentication();

select tests.set_share('trainer_a', 'client_c', 'nutrition', false);
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.trainer_nutrition_adherence(7)), 0,
  '5.3: a client who closed nutrition is not in the list');
select is((select count(*)::int from public.nutrition_adherence(tests.user_id('client_c'), 7)), 0, 'nor on the tab');
select tests.clear_authentication();

select * from finish();
rollback;

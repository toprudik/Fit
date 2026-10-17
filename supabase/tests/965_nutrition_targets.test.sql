-- Goal and nutrition target of migration 20261017024300_nutrition_targets.sql (wave-2 §1–2, data-model §2.2):
-- the calculator and its acceptance cases, who reads the goal and the targets, the trainer target with the low
-- floor, the order of sources and the client's pick between two trainers, versions by day.
begin;
\ir _helpers.psql
select plan(52);

-- C trains with A and B; D trains with A; E is nobody's client.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('user_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create table tests.pairs (name text primary key, id uuid not null);
grant select on tests.pairs to authenticated;
insert into tests.pairs values
  ('a_c', tests.pair_id('trainer_a', 'client_c')),
  ('b_c', tests.pair_id('trainer_b', 'client_c')),
  ('a_d', tests.pair_id('trainer_a', 'client_d'));
create function tests.p(p_name text) returns uuid language sql stable set search_path = '' as $$
  select p.id from tests.pairs p where p.name = p_name
$$;

-- =========================================================================================================
-- The calculator (§2.2–2.8)

select is(
  private.mifflin('male', '1996-01-01', 180, 80, 'moderate', 'maintain', '2026-10-17') ->> 'kcal', '2760',
  '2.1: man 30, 180 cm, 80 kg, moderate, maintain gives 2760 kcal');
select is(
  private.mifflin('female', '2001-01-01', 165, 60, 'minimal', 'lose', '2026-10-17') ->> 'kcal', '1370',
  '2.2: woman 25, 165 cm, 60 kg, minimal, lose gives 1370 kcal');
select is(
  private.mifflin('female', '2001-01-01', 165, 60, 'minimal', 'lose', '2026-10-17') ->> 'bmr', '1345.25',
  '2.2: with BMR 1345.25');
select is(
  private.mifflin('male', '2009-01-01', 180, 80, 'moderate', 'maintain', '2026-10-17') ->> 'status', 'minor',
  '2.3: under 18 the calculator gives nothing');
select is(
  private.mifflin('male', '2008-10-17', 180, 80, 'moderate', 'maintain', '2026-10-17') ->> 'status', 'ok',
  'on the 18th birthday it works');
select is(
  private.mifflin('female', '1990-01-01', 150, 40, 'minimal', 'lose', '2026-10-17') ->> 'status', 'too_low',
  'under 1200 kcal for a woman it offers nothing');
select is(
  private.mifflin('male', '1990-01-01', null, 80, 'moderate', 'maintain', '2026-10-17') ->> 'status', 'incomplete',
  'a missing input gives incomplete');
select is(
  (select array[(r ->> 'protein_g')::int, (r ->> 'fat_g')::int, (r ->> 'carbs_g')::int]
   from private.mifflin('male', '1996-01-01', 180, 80, 'moderate', 'maintain', '2026-10-17') r),
  array[144, 72, 384],
  'macros: protein 1.8 g/kg, fat 0.9 g/kg, carbs the rest');
select is(
  (private.mifflin('female', '2001-01-01', 165, 60, 'minimal', 'lose', '2026-10-17') ->> 'protein_g')::int, 120,
  'losing takes protein 2.0 g/kg');
select is(
  (select array[(r ->> 'protein_g')::int, (r ->> 'fat_g')::int, (r ->> 'carbs_g')::int]
   from private.mifflin('male', '1946-01-01', 140, 200, 'minimal', 'lose', '2026-10-17') r),
  array[320, 120, 43],
  'when carbs run out, fat drops to 0.6 g/kg and protein to 1.6 g/kg');
select is(
  (private.mifflin('male', '1996-01-01', 180, 80, 'moderate', 'gain', '2026-10-17') ->> 'kcal')::int, 3030,
  'gaining adds 10% (1780 × 1.55 × 1.1 = 3034.9 → 3030)');

-- =========================================================================================================
-- Goal (§1)

select tests.authenticate_as_anon();
select throws_ok($$ select public.set_client_goal('lose') $$, '42501', null, 'anon cannot set a goal');

select tests.authenticate_as('client_c');
select ok(public.set_client_goal('lose'), 'the client sets a goal');
select ok(not public.set_client_goal('lose'), 'the same goal again changes nothing');
select is((select goal::text from public.client_goals where user_id = tests.u('client_c')), 'lose', 'the client reads the goal');
select throws_ok(
  $$ insert into public.client_goals (user_id, goal) values (auth.uid(), 'gain') $$, '42501', null,
  'the goal is not written directly');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.client_goals where user_id = tests.u('client_c')), 1, '1.2: the trainer sees the goal');
select tests.clear_authentication();
update public.data_shares set nutrition = false where coaching_id = tests.p('b_c');
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.client_goals where user_id = tests.u('client_c')), 0, '1.2: without the share it is hidden');
select tests.clear_authentication();
update public.data_shares set nutrition = true where coaching_id = tests.p('b_c');
select tests.authenticate_as('user_e');
select is((select count(*)::int from public.client_goals where user_id = tests.u('client_c')), 0, 'a stranger sees no goal');
select tests.clear_authentication();

-- =========================================================================================================
-- Body profile and the calculator target

select tests.authenticate_as('client_c');
insert into public.body_profiles (user_id, calc_sex, birth_date, height_cm, activity_level)
values (auth.uid(), 'female', '2001-01-01', 165, 'minimal');
select throws_ok(
  $$ update public.body_profiles set preferred_target_coaching_id = gen_random_uuid() where user_id = auth.uid() $$,
  '42501', null, 'the pick of a trainer target is not written directly');
select is((public.calculate_nutrition_target(60) ->> 'kcal')::int, 1370, 'the client runs the calculator on saved inputs');
select throws_ok($$ select public.calculate_nutrition_target(10) $$, '22023', 'invalid_weight', 'an absurd weight is refused');
select isnt(public.save_calculator_target(60), null, 'the client saves the result');
select is((select kcal::int from public.my_nutrition_target()), 1370, 'it is the active target');
select is((select source::text from public.my_nutrition_target()), 'calculator', 'with the calculator as the source');
select is(
  (select calc_inputs ->> 'goal' from public.my_nutrition_target()), 'lose', 'the inputs are kept with the version');
select lives_ok($$ select public.save_calculator_target(61) $$, 'saving again on the same day');
select is(
  (select count(*)::int from public.nutrition_targets where client_id = auth.uid() and source = 'calculator'), 1,
  'replaces the version of the day instead of keeping a zero-day one');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select throws_ok($$ select public.save_calculator_target(80) $$, '22023', 'calculator_incomplete', 'no inputs, no target');
select tests.clear_authentication();

-- =========================================================================================================
-- Trainer targets (§2.10–2.13)

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 1100) $$, '22023', 'low_kcal_unconfirmed',
  '2.7: under 1200 kcal for a woman needs a confirmation');
select isnt(
  public.set_nutrition_target(tests.p('a_c'), 1100, p_confirm_low => true), null,
  'with the confirmation it saves');
select isnt(
  (select low_kcal_confirmed_at from public.nutrition_targets where coaching_id = tests.p('a_c')),
  null, 'and the confirmation is stored');
select lives_ok(
  $$ select public.set_nutrition_target(tests.p('a_c'), 1800, 120, 60, 195) $$,
  '2.4: the trainer sets 1800 kcal');
select is(public.pair_nutrition_state(tests.p('a_c')), 'mine', 'the trainer sees their target is active');
select is(
  (select count(*)::int from public.nutrition_targets where client_id = tests.u('client_c') and source = 'calculator'), 1,
  'the trainer sees the client''s calculator target');
select throws_ok(
  $$ select public.set_nutrition_target(tests.p('b_c'), 2000) $$, '42501', null,
  'a trainer cannot set the target of another trainer''s pair');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is((select kcal::int from public.my_nutrition_target()), 1800, '2.4: the trainer target wins over the calculator');
select is((select trainer_name from public.my_nutrition_target()) <> '', true, 'with the trainer''s name');
select tests.clear_authentication();

-- One transaction has one now(): A's target goes a minute back so B's is the latest set.
update public.nutrition_targets set created_at = now() - interval '1 minute' where coaching_id = tests.p('a_c');
select tests.authenticate_as('trainer_b');
select lives_ok($$ select public.set_nutrition_target(tests.p('b_c'), 2200) $$, 'a second trainer sets a target');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select is(public.pair_nutrition_state(tests.p('a_c')), 'other_trainer', '2.8: by default the latest set is active');
select is(
  (select count(*)::int from public.nutrition_targets where coaching_id = tests.p('b_c')), 0,
  '2.8: without its values');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select lives_ok($$ select public.choose_nutrition_target(tests.p('a_c')) $$, '2.8: the client picks A');
select is((select kcal::int from public.my_nutrition_target()), 1800, 'and A''s target is active');
select throws_ok(
  $$ select public.choose_nutrition_target(tests.p('a_d')) $$, '42501', null,
  'the client cannot pick someone else''s pair');
-- Changing the goal tells the trainers whose target is active in their pairs (§1.3); the target stays.
select ok(public.set_client_goal('gain'), 'the client changes the goal');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'goal_changed' and payload ->> 'goal' = 'gain'), 2,
  '1.3: both trainers with a target get a message');

-- Turning nutrition off for A drops A's target from the order (§2.10).
update public.data_shares set nutrition = false where coaching_id = tests.p('a_c');
select tests.authenticate_as('client_c');
select is((select kcal::int from public.my_nutrition_target()), 2200, 'a target of a pair that stopped sharing is not active');
select tests.clear_authentication();
update public.data_shares set nutrition = true where coaching_id = tests.p('a_c');

-- 2.5: removing the trainer targets brings back the calculator.
select tests.authenticate_as('trainer_a');
select ok(public.clear_nutrition_target(tests.p('a_c')), 'A removes the target');
select tests.clear_authentication();
select tests.authenticate_as('trainer_b');
select ok(public.clear_nutrition_target(tests.p('b_c')), 'B removes the target');
select tests.clear_authentication();
select tests.authenticate_as('client_c');
select is((select source::text from public.my_nutrition_target()), 'calculator', '2.5: the calculator is active again');
select tests.clear_authentication();

-- 2.6: a target closed later keeps covering the days it had.
insert into public.nutrition_targets (source, client_id, kcal, effective_from, effective_to)
values ('calculator', tests.u('client_d'), 2000, current_date - 20, current_date - 5);
select is(
  (select kcal::int from public.nutrition_targets where id = private.active_nutrition_target(tests.u('client_d'), current_date - 10)),
  2000, '2.6: a past day keeps the target of that day');
select is(private.active_nutrition_target(tests.u('client_d'), current_date), null, 'and today has none');

select * from finish();
rollback;

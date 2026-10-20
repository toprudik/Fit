-- Health data behind the health data consent in the database, migration 20261020171538_health_consent_rls.sql
-- (право 3): without it the trainer reads nothing whatever the shares say, and no one writes a new row, except on a
-- client card without an account.
begin;
\ir _helpers.psql
select plan(11);

select tests.create_trainer('trainer_t');
select tests.create_user('client_x');
select tests.create_pair('trainer_t', 'client_x');
select tests.create_card('trainer_t', 'card_k');
delete from public.consents where user_id = tests.user_id('card_k');

insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
values (tests.user_id('client_x'), 'weight', 70, '2026-10-02 08:00+00', '2026-10-02', tests.user_id('client_x'));
insert into public.food_diary_entries (client_id, local_date, meal, title, kcal)
values (tests.user_id('client_x'), '2026-10-02', 'lunch', 'Суп', 500);
insert into public.activity_entries (client_id, local_date, metric, value)
values (tests.user_id('client_x'), '2026-10-02', 'steps', 8000);

-- X withdraws the consent; the shares are opened again on purpose, as a new pair or a stale toggle would.
update public.consents set revoked_at = pg_catalog.now() where user_id = tests.user_id('client_x') and kind = 'pd_health';
update public.data_shares set nutrition = true, measurements = true, photos = true, steps = true, intake = true, workouts = true
where coaching_id = tests.pair_id('trainer_t', 'client_x');

select tests.authenticate_as('trainer_t');
select is_empty($$ select 1 from public.measurements where client_id = tests.user_id('client_x') $$,
  'the trainer reads no measurements without the consent, whatever the shares');
select is_empty($$ select 1 from public.food_diary_entries where client_id = tests.user_id('client_x') $$,
  'nor the food diary');
select is_empty($$ select 1 from public.activity_entries where client_id = tests.user_id('client_x') $$, 'nor the steps');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date)
     values (tests.user_id('client_x'), 'weight', 71, '2026-10-03 08:00+00', '2026-10-03') $$,
  '42501', 'health_consent_required', 'the trainer cannot add a measurement');
select lives_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date)
     values (tests.user_id('card_k'), 'weight', 80, '2026-10-03 08:00+00', '2026-10-03') $$,
  'a card without an account takes measurements: the trainer answers for the consent');

select tests.authenticate_as('client_x');
select is((select pg_catalog.count(*)::int from public.measurements where client_id = tests.user_id('client_x')), 1,
  'X still reads their own weight, for the export');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date)
     values (tests.user_id('client_x'), 'weight', 71, '2026-10-03 08:00+00', '2026-10-03') $$,
  '42501', 'health_consent_required', 'X cannot add a measurement without the consent');
select throws_ok(
  $$ select public.add_food_entry('2026-10-03', 'lunch', null, null, null, 300, null, null, null, 'Каша') $$,
  '42501', 'health_consent_required', 'nor a meal through the RPC');
select throws_ok(
  $$ select public.set_activity('2026-10-03', 'steps', 5000, null) $$,
  '42501', 'health_consent_required', 'nor steps');

-- X gives the consent again: everything opens.
insert into public.consents (user_id, kind, version) values (tests.user_id('client_x'), 'pd_health', '2026-11');
select lives_ok($$ select public.set_activity('2026-10-03', 'steps', 5000, null) $$, 'with the consent the steps are saved');
select tests.authenticate_as('trainer_t');
select is((select pg_catalog.count(*)::int from public.measurements where client_id = tests.user_id('client_x')), 1,
  'and the trainer reads the weight again');

select * from finish();
rollback;

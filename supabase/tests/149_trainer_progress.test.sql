-- Trainer analytics «Прогресс» of migration 20261017232917_trainer_progress.sql (PRD wave-2 §7): first and last
-- value per kind over a period, only for clients who share measurements, and the plan gate.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_free');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_free', 'client_c');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.set_share('trainer_a', 'client_c', 'measurements', true);
select tests.set_share('trainer_a', 'client_d', 'measurements', false);

-- c: weight 80 → 79 → 78.5 within the period, one older weight, one waist only once; d keeps measurements private.
insert into public.measurements (client_id, kind, value, measured_at, local_date)
select tests.user_id('client_c'), v.kind::public.measurement_kind, v.value, now() - v.ago, (now() - v.ago)::date
from (values ('weight', 82, interval '60 days'), ('weight', 80, interval '20 days'), ('weight', 79, interval '10 days'),
             ('weight', 78.5, interval '2 days'), ('waist', 90, interval '5 days')) v(kind, value, ago);
insert into public.measurements (client_id, kind, value, measured_at, local_date)
select tests.user_id('client_d'), 'weight', v.value, now() - v.ago, (now() - v.ago)::date
from (values (70, interval '20 days'), (71, interval '2 days')) v(value, ago);

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select coaching_id, kind::text, first_value, last_value, measurements from public.trainer_progress(current_date - 30, current_date + 1) $$,
  format($$ values (%L::uuid, 'weight', 80::numeric, 78.5::numeric, 3) $$, tests.pair_id('trainer_a', 'client_c')),
  'the first and last weight of the period, three measurements; a kind measured once is left out');
select is((select count(*)::int from public.trainer_progress(current_date - 30, current_date + 1)
           where coaching_id = tests.pair_id('trainer_a', 'client_d')), 0,
  'a client who keeps measurements private is not shown');
select is((select first_value from public.trainer_progress(current_date - 90, current_date + 1)), 82::numeric,
  'a longer period starts from the older weight');
select throws_ok($$ select * from public.trainer_progress(current_date, current_date) $$, '22023', 'invalid_period',
  'an empty period is refused');

select tests.authenticate_as('trainer_free');
select throws_ok($$ select * from public.trainer_progress(current_date - 30, current_date + 1) $$, '42501', 'plan_required',
  'the free plan has no analytics');

select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.trainer_progress(current_date - 30, current_date + 1) $$, '42501', 'not_a_trainer',
  'a client is not a trainer');

select * from finish();
rollback;

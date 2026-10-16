-- Prices on the public showcase, migration 20261016203700_showcase_prices.sql (PRD wave-1 §2.3 rule 1, §2.8
-- rules 2–3, MONEY-1, MONEY-2; R16, Q60): get_trainer_showcase_prices.
begin;
\ir _helpers.psql
select plan(10);

select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_trainer('trainer_b', 'boris');

-- MONEY-1: drop-in 2000, packs 5×9000, 10×16000, 20×30000 (minor units: kopecks).
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, validity_days, sort_order)
values
  (tests.user_id('trainer_a'), 'Разовое', 1, 200000, 'RUB', null, 0),
  (tests.user_id('trainer_a'), '5 занятий', 5, 900000, 'RUB', 60, 1),
  (tests.user_id('trainer_a'), '10 занятий', 10, 1600000, 'RUB', 90, 2),
  (tests.user_id('trainer_a'), '20 занятий', 20, 3000000, 'RUB', 180, 3);
-- Not on the showcase: a hidden pack, an archived one and one in another currency.
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, is_public)
values (tests.user_id('trainer_a'), 'Для своих', 8, 800000, 'RUB', false);
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, archived_at)
values (tests.user_id('trainer_a'), 'Старый', 12, 1000000, 'RUB', now());
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
values (tests.user_id('trainer_a'), 'Online USD', 5, 20000, 'USD');
-- MONEY-2: a pack no cheaper per session than the drop-in shows no savings and no badge.
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
values
  (tests.user_id('trainer_b'), 'Разовое', 1, 100000, 'RUB'),
  (tests.user_id('trainer_b'), '4 занятия', 4, 400000, 'RUB');

select tests.authenticate_as_anon();
select results_eq(
  $$ select title, sessions_count::integer, price_minor, currency::text, per_session_minor, validity_days::integer, savings_pct, is_best_value
     from public.get_trainer_showcase_prices('anna-fit') $$,
  $$ values
       ('Разовое'::text, 1, 200000::bigint, 'RUB'::text, 200000::bigint, null::integer, null::integer, false),
       ('5 занятий', 5, 900000, 'RUB', 180000, 60, 10, false),
       ('10 занятий', 10, 1600000, 'RUB', 160000, 90, 20, false),
       ('20 занятий', 20, 3000000, 'RUB', 150000, 180, 25, true) $$,
  'prices: anyone sees the public grid with per-session price, savings and the best value badge (MONEY-1)'
);
select is(
  (select count(*)::integer from public.get_trainer_showcase_prices('ANNA-FIT')), 4, 'prices: the address ignores case'
);
select results_eq(
  $$ select sessions_count::integer, per_session_minor, savings_pct, is_best_value from public.get_trainer_showcase_prices('boris') $$,
  $$ values (1, 100000::bigint, null::integer, false), (4, 100000::bigint, null::integer, false) $$,
  'prices: a pack no cheaper per session shows no savings and no badge (MONEY-2)'
);
select is_empty(
  $$ select 1 from public.get_trainer_showcase_prices('nobody-here') $$, 'prices: an unknown address answers nothing'
);
select is_empty($$ select 1 from public.get_trainer_showcase_prices(null) $$, 'prices: no address answers nothing');
select throws_ok(
  $$ select id from public.packages $$, '42501', null, 'prices: anon still cannot read packages'
);

-- A closed showcase hides its prices too (R16, Q60).
select tests.clear_authentication();
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is_empty(
  $$ select 1 from public.get_trainer_showcase_prices('anna-fit') $$, 'prices: a switched-off showcase shows no prices'
);

select tests.clear_authentication();
update public.trainer_profiles set is_public = true, verification_status = 'rejected'
where user_id = tests.user_id('trainer_a');
select tests.authenticate_as('trainer_b');
select is_empty(
  $$ select 1 from public.get_trainer_showcase_prices('anna-fit') $$, 'prices: a rejected trainer shows no prices'
);

-- The trainer's default currency picks the grid (rule 3).
select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'not_submitted', default_currency = 'USD'
where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select title, currency::text from public.get_trainer_showcase_prices('anna-fit') $$,
  $$ values ('Online USD'::text, 'USD'::text) $$,
  'prices: only packages in the trainer''s default currency'
);
select is(
  has_function_privilege('anon', 'public.get_trainer_showcase_prices(text)', 'EXECUTE'), true,
  'prices: anon may call the lookup'
);

select * from finish();
rollback;

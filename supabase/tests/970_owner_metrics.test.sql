-- Owner statistics of migration 20261017151837_owner_metrics.sql: only admins call them, the summary counts
-- accounts, activity, sessions, money and invites, the weekly series and the cohorts line up with ISO weeks,
-- and no result carries a person's name or id.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d', 'active', 'trainer_code');
select tests.create_card('trainer_a', 'client_card');
update public.trainer_profiles set verification_status = 'verified' where user_id = tests.user_id('trainer_a');

-- A held session 3 days ago that client c attended, and a future one.
select tests.create_session('trainer_a', now() - interval '3 days') as s_old \gset
select tests.create_booking(:'s_old', 'trainer_a', 'client_c', 'attended');
select tests.create_session('trainer_a', now() + interval '2 days') as s_new \gset
select tests.create_booking(:'s_new', 'trainer_a', 'client_d', 'confirmed');

-- Money: a pass with a confirmed payment of 5 000 and a refund of 1 000, plus a reported (unconfirmed) one.
select tests.create_pass('trainer_a', 'client_c', 5, 500000, 'RUB') as pass_c \gset
insert into public.payments (coaching_id, trainer_id, client_id, pass_id, direction, amount_minor, currency, method, paid_at,
  status, confirmed_at)
values
  (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), :'pass_c', 'in', 500000, 'RUB',
   'cash', now() - interval '1 hour', 'confirmed', now()),
  (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), :'pass_c', 'refund', 100000, 'RUB',
   'cash', now() - interval '1 hour', 'confirmed', now()),
  (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), :'pass_c', 'in', 700000, 'RUB',
   'cash', now() - interval '1 hour', 'reported', null);

-- Two trainer invites, one redeemed by trainer b.
insert into public.trainer_invites (code_hash, code_hint, created_by)
values (extensions.digest('OWNERTESTAAA', 'sha256'), 'AAA', tests.user_id('admin_x'));
insert into public.trainer_invites (code_hash, code_hint, created_by, redeemed_by, redeemed_at)
values (extensions.digest('OWNERTESTBBB', 'sha256'), 'BBB', tests.user_id('admin_x'), tests.user_id('trainer_b'), now());

-- Openings: trainer a and client c today, client d 10 days ago.
insert into public.app_opens (user_id, opened_at) values
  (tests.user_id('trainer_a'), now() - interval '1 hour'),
  (tests.user_id('client_c'), now() - interval '2 hours'),
  (tests.user_id('client_c'), now() - interval '3 hours'),
  (tests.user_id('client_d'), now() - interval '10 days');

-- =========================================================================================================
-- Only admins

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_owner_summary() $$, '42501', null, 'summary: a trainer is refused');
select throws_ok($$ select * from public.admin_owner_weekly(12) $$, '42501', null, 'weekly: a trainer is refused');
select throws_ok($$ select * from public.admin_owner_cohorts(8) $$, '42501', null, 'cohorts: a trainer is refused');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_owner_summary() $$, '42501', null, 'summary: anon cannot call it');

-- =========================================================================================================
-- Summary

select tests.authenticate_as('admin_x');
select throws_ok($$ select * from public.admin_owner_weekly(3) $$, '22023', 'invalid_weeks', 'weekly: 4 to 52 weeks');
select throws_ok($$ select * from public.admin_owner_cohorts(53) $$, '22023', 'invalid_weeks', 'cohorts: 4 to 52 weeks');

select is((select users from public.admin_owner_summary()), 5, 'summary: accounts, without the card');
select is((select trainers from public.admin_owner_summary()), 2, 'summary: trainers');
select is((select trainers_verified from public.admin_owner_summary()), 1, 'summary: verified trainers');
select is((select clients from public.admin_owner_summary()), 2, 'summary: client accounts with a live pair');
select is((select cards from public.admin_owner_summary()), 1, 'summary: cards');
select is(
  (select array[dau, wau, mau] from public.admin_owner_summary()), array[2, 2, 3],
  'summary: DAU, WAU and MAU count people, not openings');
select is(
  (select array[trainers_active_7, clients_active_7, clients_active_30] from public.admin_owner_summary()), array[1, 1, 2],
  'summary: active trainers and clients');
select is(
  (select array[held_sessions, attended, bookings, passes_sold] from public.admin_owner_summary()), array[1, 1, 2, 1],
  'summary: held sessions, attendances, bookings and passes');
select is((select turnover from public.admin_owner_summary()), '{"RUB": 400000}'::jsonb,
  'summary: turnover is confirmed payments minus refunds');
select is((select turnover_30 from public.admin_owner_summary()), '{"RUB": 400000}'::jsonb, 'summary: turnover in 30 days');
select is(
  (select array[trainer_invites_created, trainer_invites_redeemed] from public.admin_owner_summary()), array[2, 1],
  'summary: trainer invites made and redeemed');
select is((select joins_by_source from public.admin_owner_summary()),
  '{"client_invite": 1, "trainer_code": 1, "manual": 1}'::jsonb, 'summary: how pairs started');

-- =========================================================================================================
-- Weekly series and cohorts

select is((select count(*)::int from public.admin_owner_weekly(12)), 12, 'weekly: one row per week');
select is(
  (select week_start from public.admin_owner_weekly(4) order by week_start desc limit 1),
  date_trunc('week', now() at time zone 'UTC')::date, 'weekly: the last row is the current week');
select is(
  (select array[new_users, new_trainers, active_users, passes_sold]
   from public.admin_owner_weekly(4) order by week_start desc limit 1),
  array[5, 2, 2, 1], 'weekly: this week''s sign-ups, trainers, active people and passes');

select is((select count(*)::int from public.admin_owner_cohorts(8)), 8, 'cohorts: one row per sign-up week');
select is(
  (select array[size] || retained from public.admin_owner_cohorts(8) order by cohort_week desc limit 1),
  array[5, 2], 'cohorts: this week''s cohort and its week 0');

-- Nothing that names a person.
select is(
  (select count(*)::int from information_schema.parameters
   where specific_schema = 'public'
     and specific_name ~ '^admin_owner_(summary|weekly|cohorts)_'
     and parameter_mode = 'OUT'
     and parameter_name ~ '(name|username|telegram|_id$)'),
  0, 'no result column names or identifies a person');

select * from finish();
rollback;

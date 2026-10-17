-- Admin analytics of migration 20261017023400_admin_analytics.sql (PRD wave-2 §8, 8.1-8.4): app openings with
-- their bot source, the platform, trainers and clients slices, the audit row for one trainer, the beta metrics,
-- and no field of a client's data in any result.
begin;
\ir _helpers.psql
select plan(26);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_card('trainer_a', 'client_card');
update public.trainer_profiles set verification_status = 'verified' where user_id = tests.user_id('trainer_a');
update public.trainer_profiles set verification_status = 'pending' where user_id = tests.user_id('trainer_b');

-- Two held sessions of trainer a: 10 days ago (c attended, edited by hand) and 3 days ago (c confirmed, d no-show).
select tests.create_session('trainer_a', now() - interval '10 days') as s_old \gset
select tests.create_session('trainer_a', now() - interval '3 days', 'group', 4) as s_new \gset
select tests.create_booking(:'s_old', 'trainer_a', 'client_c', 'attended');
select tests.create_booking(:'s_new', 'trainer_a', 'client_c', 'confirmed');
select tests.create_booking(:'s_new', 'trainer_a', 'client_d', 'confirmed') as b_d \gset
update public.bookings set status = 'no_show', attendance_marked_at = now() where id = :'b_d';
update public.sessions set manually_adjusted_at = now() where id = :'s_old';
-- A future session is not held.
select tests.create_session('trainer_a', now() + interval '2 days');

-- Money: a pass ending in 5 days, a confirmed payment, a charge worth 1 000.
select tests.create_pass('trainer_a', 'client_c', 5, 500000, 'RUB', now() + interval '5 days') as pass_c \gset
insert into public.payments (coaching_id, trainer_id, client_id, pass_id, amount_minor, currency, method, paid_at, status, confirmed_at)
values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), :'pass_c', 500000, 'RUB',
  'cash', now() - interval '1 day', 'confirmed', now());
insert into public.ledger_entries (coaching_id, trainer_id, client_id, entry_type, pass_id, booking_id, sessions_delta, amount_minor,
  currency, charge_reason, occurred_at)
select tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), 'charge', :'pass_c', b.id, -1,
  100000, 'RUB', 'attended', now() - interval '10 days'
from public.bookings b where b.session_id = :'s_old';
-- Client c took a measurement: the clients slice may say so, never the value.
insert into public.measurements (client_id, kind, value, measured_at, local_date)
values (tests.user_id('client_c'), 'weight', 81.5, now(), current_date);

create function tests.opens() returns setof public.app_opens language sql stable security definer set search_path = '' as $$
  select * from public.app_opens
$$;
grant execute on function tests.opens() to authenticated;

-- =========================================================================================================
-- App openings

select tests.authenticate_as('client_c');
select lives_ok($$ select public.record_app_open('session_reminder') $$, 'open: from a reminder button');
select public.record_app_open('session_reminder');
select is((select count(*)::int from tests.opens() o where o.source = 'session_reminder'), 1, 'open: a repeat within 30 minutes is one visit');
select public.record_app_open('not_a_type');
select is((select count(*)::int from tests.opens() o where o.source is null), 1, 'open: an unknown source counts as a direct open');
select throws_ok($$ select * from public.app_opens $$, '42501', null, 'open: nobody reads the table directly');
select tests.authenticate_as_anon();
select throws_ok($$ select public.record_app_open(null) $$, '42501', null, 'open: anon cannot record');

-- =========================================================================================================
-- Only admins (8.1)

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_analytics_platform(30) $$, '42501', null, 'platform: a trainer is refused');
select throws_ok($$ select * from public.admin_analytics_trainers(30) $$, '42501', null, 'trainers: a trainer is refused');
select throws_ok(format($$ select * from public.admin_analytics_trainer(%L, 30) $$, tests.user_id('trainer_a')), '42501', null,
  'trainer: a trainer is refused, even for themselves');
select throws_ok($$ select * from public.admin_analytics_clients(30) $$, '42501', null, 'clients: a trainer is refused');
select throws_ok($$ select * from public.admin_beta_metrics() $$, '42501', null, 'beta: a trainer is refused');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_analytics_platform(30) $$, '42501', null, 'platform: anon cannot call it');

-- =========================================================================================================
-- Platform slice

select tests.authenticate_as('admin_x');
select throws_ok($$ select * from public.admin_analytics_platform(5) $$, '22023', 'invalid_period', 'platform: only 7, 14, 30 or 90 days');
select is(
  (select row(p.trainers_registered, p.trainers_verified, p.trainers_with_client, p.trainers_with_session, p.clients, p.cards)::text
   from public.admin_analytics_platform(30) p),
  row(2, 1, 1, 1, 2, 1)::text, 'platform: the trainer funnel, clients and cards');
select is(
  (select row(p.sessions, p.held_sessions, p.held_without_edits, p.no_shows)::text from public.admin_analytics_platform(30) p),
  row(2, 2, 1, 1)::text, 'platform: past sessions, held ones, without manual edits, no-shows');
select is(
  (select row(p.opens, p.opens_from_bot, p.active_7, p.clients_with_measurements, p.clients_logging_workouts)::text
   from public.admin_analytics_platform(30) p),
  row(2, 1, 1, 1, 0)::text, 'platform: openings, from bot buttons, active accounts, feature use');
select is((select p.held_sessions from public.admin_analytics_platform(7) p), 1, 'platform: the period narrows the counts');

-- =========================================================================================================
-- Trainers slice and one trainer (8.3)

select is(
  (select row(t.clients, t.held_sessions, t.attended, t.no_shows, t.ending_passes, t.uses_passes, t.uses_groups, t.uses_repeats)::text
   from public.admin_analytics_trainers(30) t where t.trainer_id = tests.user_id('trainer_a')),
  row(3, 2, 1, 1, 1, true, true, false)::text, 'trainers: clients with cards, held, attendance, ending passes, features');
select is(
  (select row(t.earned, t.received)::text from public.admin_analytics_trainers(30) t where t.trainer_id = tests.user_id('trainer_a')),
  row('{"RUB": 100000}'::jsonb, '{"RUB": 500000}'::jsonb)::text, 'trainers: earned and received per currency');
select is((select count(*)::int from public.admin_analytics_trainers(30)), 2, 'trainers: every trainer, verified or not');
select is(
  (select t.weeks[7] + t.weeks[8] from public.admin_analytics_trainer(tests.user_id('trainer_a'), 30) t), 2,
  'trainer: held sessions per week');
select is(
  (select count(*)::int from public.admin_audit_log l
   where l.action = 'analytics.view_trainer' and l.target_id = tests.user_id('trainer_a') and l.actor_id = tests.user_id('admin_x')),
  1, 'trainer: opening one trainer is written to the audit log');
select throws_ok(format($$ select * from public.admin_analytics_trainer(%L, 30) $$, tests.user_id('client_c')), 'P0001',
  'trainer_not_found', 'trainer: only trainers');

-- =========================================================================================================
-- Clients slice: metadata only (8.2)

select is(
  (select row(c.pairs, c.attended, c.takes_measurements, c.adds_photos)::text
   from public.admin_analytics_clients(30) c where c.client_id = tests.user_id('client_c')),
  row(1, 1, true, false)::text, 'clients: pairs, attended sessions and yes/no feature flags');
select is((select count(*)::int from public.admin_analytics_clients(30)), 2, 'clients: accounts only, no cards');
select is(
  (select count(*)::int from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin_analytics%' or p.proname = 'admin_beta_metrics')
     and pg_catalog.pg_get_function_result(p.oid) ~* '(weight|kcal|food|calorie|norm|measurement_value|value|photo_path|intake|note|answer)'),
  0, 'contract: no result column of the analytics carries a client''s data');

-- =========================================================================================================
-- Beta metrics (8.4)

select is(
  (select row(b.trainers_total, b.trainers_on_schedule, b.held_sessions, b.held_without_edits, b.opens_from_bot, b.opens_from_bot_prev)::text
   from public.admin_beta_metrics() b),
  row(1, 1, 2, 1, 1, 0)::text, 'beta: trainers on schedule two weeks running, sessions without edits, opens from the bot');

select * from finish();
rollback;

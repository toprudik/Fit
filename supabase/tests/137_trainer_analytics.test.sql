-- Trainer analytics of migration 20261017034217_trainer_analytics.sql (PRD wave-2 §7, 7.1-7.6): plan gates,
-- attendance and cancellations, earned and received per currency, ending passes, clients at risk of leaving
-- and hiding them, price hints, and earned without double-counting a settled debt (admin analytics too).
begin;
\ir _helpers.psql
select plan(28);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_free');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_free', 'client_f');
select tests.pair_id('trainer_free', 'client_f') as pair_f \gset
select tests.grant_plan('trainer_a', 'trainer_pro');
update public.coachings set status = 'active' where trainer_id = tests.user_id('trainer_a');

-- A held session with one attended booking per charge below, so charges carry a booking like the real ones.
create function tests.charge(p_client text, p_pass uuid, p_amount bigint, p_ago interval,
  p_status public.booking_status default 'attended', p_reason public.charge_reason default 'attended')
returns uuid language plpgsql set search_path = '' as $$
declare
  v_session uuid := tests.create_session('trainer_a', now() - p_ago);
  v_booking uuid := tests.create_booking(v_session, 'trainer_a', p_client, 'confirmed');
  v_id uuid;
begin
  update public.bookings set status = p_status, attendance_marked_at = now() where id = v_booking;
  insert into public.ledger_entries (coaching_id, trainer_id, client_id, entry_type, pass_id, booking_id, sessions_delta,
    amount_minor, currency, charge_reason, occurred_at)
  values (tests.pair_id('trainer_a', p_client), tests.user_id('trainer_a'), tests.user_id(p_client), 'charge', p_pass,
    v_booking, -1, p_amount, 'RUB', p_reason, now() - p_ago)
  returning id into v_id;
  return v_id;
end $$;

-- A past booking of a new session, moved from confirmed to the given end state the way the app moves it.
create function tests.past_booking(p_client text, p_ago interval, p_status public.booking_status,
  p_role public.actor_role default 'client')
returns uuid language plpgsql set search_path = '' as $$
declare
  v_booking uuid := tests.create_booking(tests.create_session('trainer_a', now() - p_ago), 'trainer_a', p_client, 'confirmed');
begin
  update public.bookings
  set status = p_status,
      cancelled_at = case when p_status in ('cancelled', 'late_cancelled') then now() end,
      cancelled_by_role = case when p_status in ('cancelled', 'late_cancelled') then p_role end,
      cancel_reason = case when p_role = 'trainer' then 'ill' end,
      attendance_marked_at = case when p_status in ('attended', 'no_show') then now() end
  where id = v_booking;
  return v_booking;
end $$;

-- 7.1: a pass of 10 for 10 000 ₽; 4 attended, 1 no-show charged, 1 charged and forgiven, all within 20 days.
select tests.create_pass('trainer_a', 'client_c', 10, 1000000, 'RUB', now() + interval '60 days') as pass_c \gset
select tests.charge('client_c', :'pass_c', 100000, interval '2 days');
select tests.charge('client_c', :'pass_c', 100000, interval '5 days');
select tests.charge('client_c', :'pass_c', 100000, interval '9 days');
select tests.charge('client_c', :'pass_c', 100000, interval '12 days');
select tests.charge('client_c', :'pass_c', 100000, interval '15 days', 'no_show', 'no_show');
select tests.charge('client_c', :'pass_c', 100000, interval '18 days') as forgiven \gset
insert into public.ledger_entries (coaching_id, trainer_id, client_id, entry_type, pass_id, related_entry_id, sessions_delta,
  amount_minor, currency, note, occurred_at)
values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), 'waiver', :'pass_c',
  :'forgiven', 1, -100000, 'RUB', 'forgiven', now());

-- Client d: a debt charge worth the drop-in (1 500 ₽), settled later by a pass share of 1 000 ₽, and a client
-- cancellation and a trainer cancellation within the period.
select tests.charge('client_d', null, 150000, interval '4 days') as debt_d \gset
select tests.create_pass('trainer_a', 'client_d', 5, 500000, 'RUB', now() + interval '3 days') as pass_d \gset
insert into public.ledger_entries (coaching_id, trainer_id, client_id, entry_type, pass_id, related_entry_id, sessions_delta,
  amount_minor, currency, occurred_at)
values (tests.pair_id('trainer_a', 'client_d'), tests.user_id('trainer_a'), tests.user_id('client_d'), 'settlement', :'pass_d',
  :'debt_d', -1, 100000, 'RUB', now());
select tests.past_booking('client_d', interval '6 days', 'cancelled');
select tests.past_booking('client_d', interval '7 days', 'cancelled', 'trainer');

-- 7.2 / 7.3: payments on 31.10 late evening Moscow time, in RUB and in USD.
insert into public.payments (coaching_id, trainer_id, client_id, pass_id, amount_minor, currency, method, paid_at, status, confirmed_at)
values
  (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), :'pass_c', 1000000, 'RUB',
   'cash', '2026-10-31 23:30:00+03', 'confirmed', now()),
  (tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), tests.user_id('client_c'), null, 5000, 'USD',
   'card', '2026-10-15 12:00:00+03', 'confirmed', now());

-- =========================================================================================================
-- Plan gates

select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.trainer_analytics(current_date - 30, current_date + 1) $$, '42501', 'not_a_trainer',
  'gate: a client is not a trainer');
select tests.authenticate_as('trainer_free');
select throws_ok($$ select * from public.trainer_analytics(current_date - 30, current_date + 1) $$, '42501', 'plan_required',
  'gate: analytics needs Pro');
select throws_ok($$ select * from public.trainer_finance(current_date - 30, current_date + 1) $$, '42501', 'plan_required',
  'gate: finance needs Pro');
select throws_ok($$ select * from public.trainer_churn_risk() $$, '42501', 'plan_required', 'gate: churn list needs Pro');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.trainer_analytics(current_date - 30, current_date + 1) $$, '42501', null,
  'gate: anon cannot call it');

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.trainer_analytics(current_date, current_date) $$, '22023', 'invalid_period',
  'period: an empty range is refused');
select throws_ok($$ select * from public.trainer_finance(current_date - 500, current_date) $$, '22023', 'invalid_period',
  'period: longer than a year is refused');

-- =========================================================================================================
-- Attendance and cancellations

select is(
  (select row(a.held_sessions, a.attended, a.no_shows, a.client_cancels, a.late_cancels, a.trainer_cancels, a.active_clients)::text
   from public.trainer_analytics(current_date - 30, current_date + 1) a),
  row(6, 6, 1, 1, 0, 1, 2)::text, 'analytics: held, attended, no-shows, cancellations by the client and the trainer, clients');
select is((select a.held_sessions from public.trainer_analytics(current_date - 7, current_date + 1) a), 3,
  'analytics: the period narrows the counts');
select is((select row(a.debt_clients, a.debt)::text from public.trainer_analytics(current_date - 30, current_date + 1) a),
  row(0, '{}'::jsonb)::text, 'analytics: a settled debt is no debt');
select is((select a.ending_passes from public.trainer_analytics(current_date - 30, current_date + 1) a), 1,
  'analytics: a pass expiring in 3 days is ending');

-- =========================================================================================================
-- Earned and received (7.1-7.3)

select is(
  (select row(f.earned_minor, f.charges)::text from public.trainer_finance(current_date - 30, current_date + 1) f
   where f.currency = 'RUB'),
  row(600000, 6)::text, '7.1: 5 sessions of client c at 1 000 plus the settled debt at its settlement 1 000, the forgiven one left out');
select is(
  (select f.received_minor from public.trainer_finance('2026-10-01', '2026-11-01') f where f.currency = 'RUB'), 1000000::bigint,
  '7.2: a payment on 31.10 at 23:30 Moscow time is October income');
select is(
  (select count(*)::integer from public.trainer_finance('2026-11-01', '2026-12-01') f where f.received_minor <> 0), 0,
  '7.2: and not November income');
select is(
  (select array_agg(f.currency order by f.currency) from public.trainer_finance('2026-10-01', '2026-11-01') f
   where f.received_minor <> 0),
  array['RUB', 'USD'], '7.3: two currencies stay two rows');

-- =========================================================================================================
-- Ending passes

select is(
  (select row(e.title, e.remaining)::text from public.trainer_ending_passes() e where e.client_id = tests.user_id('client_d')),
  row('5 sessions', 4)::text, 'ending: the pass of client d, with the client');

-- =========================================================================================================
-- Clients at risk of leaving (7.4)

-- Client e trained twice a week for 8 weeks and has not come for 15 days; their last pass expired 10 days ago.
reset role;
select tests.create_booking(tests.create_session('trainer_a', now() - interval '15 days' - k * interval '84 hours'), 'trainer_a',
  'client_e', 'attended')
from generate_series(0, 15) k;
select tests.create_pass('trainer_a', 'client_e', 8, 0, 'RUB', now() - interval '10 days');
-- Client c: 2 of the last 4 bookings are a late cancellation and a cancellation by the client.
select tests.past_booking('client_c', interval '1 day', 'late_cancelled');
select tests.past_booking('client_c', interval '3 days', 'cancelled');
select tests.authenticate_as('trainer_a');

select is(
  (select row(r.reasons, r.days_absent)::text from public.trainer_churn_risk() r where r.client_id = tests.user_id('client_e')),
  row(array['no_sessions', 'pass_ended'], 15)::text, '7.4: no sessions for 15 days and the pass ended, with the days');
select is(
  (select r.reasons from public.trainer_churn_risk() r where r.client_id = tests.user_id('client_c')),
  array['cancels'], 'churn: 2 of the last 4 bookings missed');
select is((select count(*)::integer from public.trainer_churn_risk() r where r.client_id = tests.user_id('client_d')), 0,
  'churn: a client without a pattern is not listed');
select lives_ok(format($$ select public.trainer_dismiss_churn(%L) $$, tests.pair_id('trainer_a', 'client_e')),
  'churn: the trainer hides a client');
select is((select count(*)::integer from public.trainer_churn_risk() r where r.client_id = tests.user_id('client_e')), 0,
  'churn: a hidden client is not listed');
select throws_ok(format($$ select public.trainer_dismiss_churn(%L) $$, :'pair_f'), 'P0001',
  'pair_not_found', 'churn: another trainer''s pair cannot be hidden');
select throws_ok($$ select * from public.trainer_churn_dismissals $$, '42501', null, 'churn: nobody reads the table directly');

-- =========================================================================================================
-- Price hints (7.6)

reset role;
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
values
  (tests.user_id('trainer_a'), 'Разовое', 1, 100000, 'RUB'),
  (tests.user_id('trainer_a'), '5 занятий', 5, 500000, 'RUB'),
  (tests.user_id('trainer_a'), '10 занятий', 10, 1100000, 'RUB'),
  (tests.user_id('trainer_a'), '20 занятий', 20, 1960000, 'RUB');
update public.packages set price_updated_at = now() - interval '13 months' where trainer_id = tests.user_id('trainer_a');
insert into public.slots (trainer_id, starts_at, ends_at, status)
select tests.user_id('trainer_a'), now() - k * interval '2 days' - interval '3 hours',
  now() - k * interval '2 days' - interval '2 hours', case when k = 1 then 'open' else 'booked' end::public.slot_status
from generate_series(1, 8) k;
select tests.authenticate_as('trainer_a');

select is(
  (select row(h.a, h.b, h.value)::text from public.trainer_price_hints() h where h.kind = 'inverted' and h.b = '5 занятий'),
  row('10 занятий', '5 занятий', 110000)::text, '7.6: 10 sessions at 1 100 against 5 at 1 000 breaks the saving');
select is((select h.value from public.trainer_price_hints() h where h.kind = 'high_demand'), 87,
  'hints: 7 of 8 slots booked in 4 weeks is high demand');
select is((select h.value from public.trainer_price_hints() h where h.kind = 'stale'), 13, 'hints: prices unchanged for 13 months');
select is((select row(h.a, h.value)::text from public.trainer_price_hints() h where h.kind = 'weak_bundle'),
  row('20 занятий', 2)::text, 'hints: a pack of 20 saving 2 % does not motivate');

-- =========================================================================================================
-- Admin analytics counts a settled debt once

select tests.authenticate_as('admin_x');
select is(
  (select t.earned from public.admin_analytics_trainers(30) t where t.trainer_id = tests.user_id('trainer_a')),
  '{"RUB": 600000}'::jsonb, 'admin: earned counts the settled debt at its settlement, once');

select * from finish();
rollback;

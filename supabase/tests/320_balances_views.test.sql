-- Views and read functions of migration 20261015125000_views.sql (contract §1.5 file 25, §6 320_balances_views):
-- pass_balances, coaching_balances, coaching_stats, price_grid, public_profiles, session_occupancy() and
-- session_meeting_url(). The views are security_invoker, so the numbers are checked as the trainer and the
-- client themselves; visibility follows the policies of the tables underneath (files 14-19).
-- Ledger rows, bookings and payments are written as postgres, the way the RPCs and jobs write them.
begin;
\ir _helpers.psql
select plan(66);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A, F a live pair to A
-- (no bookings), M is A's card.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_pair('trainer_a', 'client_f');
select tests.create_card('trainer_a', 'card_m');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
-- Today and local midnights in A's time zone.
create function tests.today_a() returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone p.time_zone)::date from public.profiles p where p.id = tests.user_id('trainer_a')
$$;
create function tests.midnight_a(p_day date) returns timestamptz language sql stable security definer
set search_path = '' as $$
  select p_day::timestamp at time zone p.time_zone from public.profiles p where p.id = tests.user_id('trainer_a')
$$;
-- A ledger row as the RPCs write it (postgres, no JWT): pair columns come from the pair.
create function tests.ledger(
  p_pair uuid, p_type public.ledger_entry_type, p_delta integer, p_pass uuid default null,
  p_booking uuid default null, p_related uuid default null, p_amount bigint default 0, p_currency text default null,
  p_reason public.charge_reason default null, p_note text default null
) returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.ledger_entries (
    coaching_id, entry_type, sessions_delta, pass_id, booking_id, related_entry_id, amount_minor, currency,
    charge_reason, note, occurred_at)
  values (
    p_pair, p_type, p_delta, p_pass, p_booking, p_related, p_amount, p_currency::public.currency_code,
    p_reason, p_note,
    coalesce((select s.starts_at from public.bookings b join public.sessions s on s.id = b.session_id
              where b.id = p_booking), now()))
  returning id into v_id;
  return v_id;
end;
$$;
-- An attended booking of the pair on a new past personal session of the trainer, plus its charge.
create function tests.charge(
  p_trainer text, p_client text, p_days_ago integer, p_pass uuid default null, p_amount bigint default 0,
  p_currency text default null
) returns uuid language plpgsql set search_path = '' as $$
declare
  v_booking uuid := tests.create_booking(
    tests.create_session(p_trainer, now() - p_days_ago * interval '1 day'), p_trainer, p_client, 'attended');
begin
  return tests.ledger(tests.pair_id(p_trainer, p_client), 'charge', -1, p_pass, v_booking, null, p_amount,
                      p_currency, 'attended');
end;
$$;

insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e'));

-- =========================================================================================================
-- pass_balances: ledger, reservations, freezes, statuses, payments

-- A 10-pass of A-C for 16000 RUB, without expiry.
insert into tests.ids values ('p10', tests.create_pass('trainer_a', 'client_c', 10, 16000));
insert into tests.ids values ('c1', tests.charge('trainer_a', 'client_c', 3, tests.i('p10'), 1600, 'RUB'));

select tests.authenticate_as('trainer_a');
select is((select remaining from public.pass_balances where pass_id = tests.i('p10')), 9,
  'pass_balances: a charge on a 10-pass leaves 9 (SCHED-11)');

-- The trainer corrects attended -> no_show: the booking changes, the ledger does not (SCHED-12).
select tests.clear_authentication();
update public.bookings set status = 'no_show'
where id = (select booking_id from public.ledger_entries where id = tests.i('c1'));
select tests.authenticate_as('trainer_a');
select is((select remaining from public.pass_balances where pass_id = tests.i('p10')), 9,
  'pass_balances: re-marking the booking as no_show keeps 9 (SCHED-12)');

select tests.clear_authentication();
select tests.ledger(tests.i('pair_ac'), 'waiver', 1, tests.i('p10'), null, tests.i('c1'), -1600, 'RUB');
select tests.authenticate_as('trainer_a');
select is((select remaining from public.pass_balances where pass_id = tests.i('p10')), 10,
  'pass_balances: a waiver of the charge gives 10 back');

-- Reservations (SCHED-5): only confirmed bookings on future sessions count.
select tests.clear_authentication();
insert into tests.ids values
  ('s_future', tests.create_session('trainer_a', now() + interval '2 days')),
  ('s_later', tests.create_session('trainer_a', now() + interval '3 days')),
  ('s_past', tests.create_session('trainer_a', now() - interval '1 day'));
insert into tests.ids values
  ('b_future', tests.create_booking(tests.i('s_future'), 'trainer_a', 'client_c', 'confirmed')),
  ('b_requested', tests.create_booking(tests.i('s_later'), 'trainer_a', 'client_c', 'requested', 'client_slot')),
  ('b_past', tests.create_booking(tests.i('s_past'), 'trainer_a', 'client_c', 'confirmed'));
update public.bookings set reserved_pass_id = tests.i('p10')
where id in (tests.i('b_future'), tests.i('b_requested'), tests.i('b_past'));

-- Payments on p10: confirmed 5000 in, a pending report, a voided entry and a confirmed refund of 1000.
insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status, void_reason)
values
  (tests.i('pair_ac'), tests.i('p10'), 'in', 5000, 'RUB', 'cash', now(), 'confirmed', null),
  (tests.i('pair_ac'), tests.i('p10'), 'in', 3000, 'RUB', 'sbp', now(), 'reported', null),
  (tests.i('pair_ac'), tests.i('p10'), 'in', 7000, 'RUB', 'cash', now(), 'confirmed', 'typo');
update public.payments set status = 'voided' where amount_minor = 7000;
insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status)
values (tests.i('pair_ac'), tests.i('p10'), 'refund', 1000, 'RUB', 'cash', now(), 'confirmed');

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select remaining, reserved_future, available, paid_minor, unpaid_minor, status
     from public.pass_balances where pass_id = tests.i('p10') $$,
  $$ values (10, 1, 9, 4000::bigint, 12000::bigint, 'active'::text) $$,
  'pass_balances: A sees available as remaining minus future confirmed reservations, and the partial payment (MONEY-9)'
);
select tests.authenticate_as('client_c');
select results_eq(
  $$ select remaining, reserved_future, available, paid_minor, unpaid_minor, status
     from public.pass_balances where pass_id = tests.i('p10') $$,
  $$ values (10, 1, 9, 4000::bigint, 12000::bigint, 'active'::text) $$,
  'pass_balances: C sees the same numbers for own pass'
);

-- A fully paid pass has nothing unpaid.
select tests.clear_authentication();
insert into tests.ids values ('p_paid', tests.create_pass('trainer_a', 'client_c', 5, 9000));
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
values (tests.i('pair_ac'), tests.i('p_paid'), 9000, 'RUB', 'card', now(), 'confirmed');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select paid_minor, unpaid_minor from public.pass_balances where pass_id = tests.i('p_paid') $$,
  $$ values (9000::bigint, 0::bigint) $$,
  'pass_balances: a payment of the full price leaves unpaid_minor 0'
);

-- Freezes move the expiry (MONEY-6). Base expiry: the start of the day 30 days from today in A's zone.
select tests.clear_authentication();
insert into tests.ids values
  ('p_frz', tests.create_pass('trainer_a', 'client_c', 8, 0, 'RUB', tests.midnight_a(tests.today_a() + 30)));
insert into public.pass_freezes (pass_id, period) values
  (tests.i('p_frz'), daterange(tests.today_a() + 1, tests.today_a() + 11)),
  (tests.i('p_frz'), daterange(tests.today_a() + 30, tests.today_a() + 35));   -- starts at the base expiry: ignored
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select freeze_days, effective_expires_at, frozen_today, status from public.pass_balances
     where pass_id = tests.i('p_frz') $$,
  $$ values (10, tests.midnight_a(tests.today_a() + 40), false, 'active'::text) $$,
  'pass_balances: a 10-day freeze moves effective_expires_at by 10 days; a freeze from the expiry on does not'
);

-- Each derived status.
select tests.clear_authentication();
insert into tests.ids values
  ('p_cancelled', tests.create_pass('trainer_a', 'client_c', 5)),
  ('p_one', tests.create_pass('trainer_a', 'client_c', 1)),
  ('p_expired', tests.create_pass('trainer_a', 'client_c', 5, 0, 'RUB', now() - interval '1 day')),
  ('p_extended', tests.create_pass('trainer_a', 'client_c', 5, 0, 'RUB', tests.midnight_a(tests.today_a()))),
  ('p_frozen', tests.create_pass('trainer_a', 'client_c', 5));
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.i('p_cancelled');
select tests.charge('trainer_a', 'client_c', 4, tests.i('p_one'));
-- p_extended ran out at today's midnight, but a 3-day freeze before that keeps it valid for 3 more days.
insert into public.pass_freezes (pass_id, period) values
  (tests.i('p_extended'), daterange(tests.today_a() - 5, tests.today_a() - 2)),
  (tests.i('p_frozen'), daterange(tests.today_a() - 1, tests.today_a() + 2));

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select b.status from public.pass_balances b
     join (values ('p_cancelled', 1), ('p_one', 2), ('p_expired', 3), ('p_frozen', 4), ('p_extended', 5), ('p10', 6))
       as x (name, n) on tests.i(x.name) = b.pass_id
     order by x.n $$,
  $$ values ('cancelled'::text), ('exhausted'), ('expired'), ('frozen'), ('active'), ('active') $$,
  'pass_balances: derived statuses cancelled, exhausted, expired, frozen and active'
);
select results_eq(
  $$ select remaining, frozen_today from public.pass_balances where pass_id in (tests.i('p_one'), tests.i('p_frozen'))
     order by remaining $$,
  $$ values (0, false), (5, true) $$,
  'pass_balances: an exhausted pass has remaining 0; a frozen one is frozen today'
);
select results_eq(
  $$ select effective_expires_at from public.pass_balances where pass_id = tests.i('p_extended') $$,
  $$ values (tests.midnight_a(tests.today_a() + 3)) $$,
  'pass_balances: an elapsed base expiry still counts the freeze days before it'
);
select is(
  (select effective_expires_at from public.pass_balances where pass_id = tests.i('p10')),
  null,
  'pass_balances: a pass without expiry has no effective expiry'
);

-- Visibility.
select tests.clear_authentication();
insert into tests.ids values
  ('p_bc', tests.create_pass('trainer_b', 'client_c', 10, 20000)),
  ('p_ae', tests.create_pass('trainer_a', 'client_e', 5, 9000));
select tests.authenticate_as('client_c');
select is(
  (select count(*) from public.pass_balances where client_id <> tests.u('client_c')),
  0::bigint,
  'pass_balances: C reads only C''s passes'
);
select is(
  (select count(*) from public.pass_balances where trainer_id = tests.u('trainer_b')),
  1::bigint,
  'pass_balances: C reads the pass of the other trainer too'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select pass_id from public.pass_balances $$, array[tests.i('p_bc')],
  'pass_balances: B reads 0 of A''s passes of the same client');
select tests.authenticate_as('client_e');
select results_eq(
  $$ select pass_id, remaining, unpaid_minor from public.pass_balances $$,
  $$ values (tests.i('p_ae'), 5, 9000::bigint) $$,
  'pass_balances: E still reads the balance of the ended pair'
);
select tests.authenticate_as('client_d');
select is_empty($$ select pass_id from public.pass_balances $$, 'pass_balances: D reads 0 of C''s passes');
select tests.authenticate_as('admin_x');
select is_empty($$ select pass_id from public.pass_balances $$, 'pass_balances: the admin reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select pass_id from public.pass_balances $$, 'pass_balances: a stranger reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select pass_id from public.pass_balances $$, '42501', null, 'pass_balances: anon has no access');

-- =========================================================================================================
-- coaching_balances: debt, settlement, waivers, currencies (MONEY-7)

select tests.clear_authentication();
-- A debt charge: D has no pass; the drop-in price is 2000 RUB.
insert into tests.ids values ('cd1', tests.charge('trainer_a', 'client_d', 5, null, 2000, 'RUB'));
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select available_sessions, debt_sessions, debt_amounts, unpaid_amounts from public.coaching_balances
     where coaching_id = tests.i('pair_ad') $$,
  $$ values (0, 1, '{"RUB": 2000}'::jsonb, '{}'::jsonb) $$,
  'coaching_balances: a charge without a pass is a debt of 1 (2000 RUB)'
);

-- A new 10-pass settles the debt charge.
select tests.clear_authentication();
insert into tests.ids values ('pd', tests.create_pass('trainer_a', 'client_d', 10, 16000));
select tests.ledger(tests.i('pair_ad'), 'settlement', -1, tests.i('pd'), null, tests.i('cd1'), 1600, 'RUB');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select available_sessions, debt_sessions, debt_amounts, unpaid_amounts from public.coaching_balances
     where coaching_id = tests.i('pair_ad') $$,
  $$ values (9, 0, '{}'::jsonb, '{"RUB": 16000}'::jsonb) $$,
  'coaching_balances: a new 10-pass plus the settlement gives debt 0 and 9 available (MONEY-7)'
);
select tests.authenticate_as('client_d');
select results_eq(
  $$ select available_sessions, debt_sessions from public.coaching_balances $$,
  $$ values (9, 0) $$,
  'coaching_balances: D sees the same balance'
);

-- Waiving the settled charge: a waiver plus a settlement_reversal give the session back to the pass.
select tests.clear_authentication();
select tests.ledger(tests.i('pair_ad'), 'waiver', 1, null, null, tests.i('cd1'), -2000, 'RUB');
select tests.ledger(tests.i('pair_ad'), 'settlement_reversal', 1, tests.i('pd'), null, tests.i('cd1'), -1600, 'RUB');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select available_sessions, debt_sessions from public.coaching_balances where coaching_id = tests.i('pair_ad') $$,
  $$ values (10, 0) $$,
  'coaching_balances: waiving the settled charge with a reversal gives 10 and debt 0'
);

-- Three more debt charges in two currencies and one without an amount.
select tests.clear_authentication();
insert into tests.ids values
  ('cd2', tests.charge('trainer_a', 'client_d', 4, null, 2000, 'RUB')),
  ('cd3', tests.charge('trainer_a', 'client_d', 3, null, 30, 'USD')),
  ('cd4', tests.charge('trainer_a', 'client_d', 2));
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select debt_sessions, debt_amounts from public.coaching_balances where coaching_id = tests.i('pair_ad') $$,
  $$ values (3, '{"RUB": 2000, "USD": 30}'::jsonb) $$,
  'coaching_balances: debt amounts are keyed per currency; a charge without an amount counts only in sessions'
);
select tests.clear_authentication();
select tests.ledger(tests.i('pair_ad'), 'waiver', 1, null, null, tests.i('cd3'), -30, 'USD');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select debt_sessions, debt_amounts from public.coaching_balances where coaching_id = tests.i('pair_ad') $$,
  $$ values (2, '{"RUB": 2000}'::jsonb) $$,
  'coaching_balances: waiving an unsettled debt charge lowers the debt'
);

-- Unpaid money per currency; a cancelled pass counts neither in sessions nor in money.
select tests.clear_authentication();
insert into tests.ids values
  ('pd_usd', tests.create_pass('trainer_a', 'client_d', 5, 300, 'USD')),
  ('pd_cancelled', tests.create_pass('trainer_a', 'client_d', 4, 5000));
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.i('pd_cancelled');
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
values (tests.i('pair_ad'), tests.i('pd'), 6000, 'RUB', 'cash', now(), 'confirmed');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select available_sessions, unpaid_amounts from public.coaching_balances where coaching_id = tests.i('pair_ad') $$,
  $$ values (15, '{"RUB": 10000, "USD": 300}'::jsonb) $$,
  'coaching_balances: unpaid amounts are keyed per currency and never added across currencies'
);

-- Visibility: one row per visible pair, ended ones included.
select set_eq(
  $$ select coaching_id from public.coaching_balances $$,
  array[tests.i('pair_ac'), tests.i('pair_ad'), tests.i('pair_ae'),
        tests.pair_id('trainer_a', 'client_f'), tests.pair_id('trainer_a', 'card_m')],
  'coaching_balances: A reads one row per own pair, the ended one included'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select coaching_id from public.coaching_balances $$, array[tests.i('pair_bc')],
  'coaching_balances: B reads only own pair');
select results_eq(
  $$ select available_sessions, unpaid_amounts from public.coaching_balances $$,
  $$ values (10, '{"RUB": 20000}'::jsonb) $$,
  'coaching_balances: B''s numbers come from B''s pass only'
);
select tests.authenticate_as('client_e');
select results_eq(
  $$ select coaching_id, available_sessions, unpaid_amounts from public.coaching_balances $$,
  $$ values (tests.i('pair_ae'), 5, '{"RUB": 9000}'::jsonb) $$,
  'coaching_balances: E still reads the balance of the ended pair'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select coaching_id from public.coaching_balances $$, 'coaching_balances: the admin reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select coaching_id from public.coaching_balances $$, 'coaching_balances: a stranger reads 0 rows');

-- =========================================================================================================
-- coaching_stats

-- A-C so far: c1's booking is no_show (3 days ago), p_one's booking attended (4 days ago), b_future confirmed in
-- 2 days, b_requested in 3 days, b_past confirmed yesterday. Add two attended, a late cancel and a cancel.
select tests.clear_authentication();
insert into tests.ids values
  ('s_att1', tests.create_session('trainer_a', now() - interval '10 days')),
  ('s_att2', tests.create_session('trainer_a', now() - interval '8 days')),
  ('s_late', tests.create_session('trainer_a', now() - interval '6 days')),
  ('s_cancel', tests.create_session('trainer_a', now() - interval '7 days')),
  ('s_next', tests.create_session('trainer_a', now() + interval '5 days'));
select tests.create_booking(tests.i('s_att1'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking(tests.i('s_att2'), 'trainer_a', 'client_c', 'attended');
insert into tests.ids values
  ('b_late', tests.create_booking(tests.i('s_late'), 'trainer_a', 'client_c')),
  ('b_cancel', tests.create_booking(tests.i('s_cancel'), 'trainer_a', 'client_c'));
select tests.create_booking(tests.i('s_next'), 'trainer_a', 'client_c');
update public.bookings set status = 'late_cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.i('b_late');
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.i('b_cancel');

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select attended_count, no_show_count, late_cancel_count, last_attended_at, next_session_at
     from public.coaching_stats where coaching_id = tests.i('pair_ac') $$,
  $$ values (3, 1, 1, now() - interval '4 days', now() + interval '2 days') $$,
  'coaching_stats: counts per status, the last attended session and the next confirmed one'
);
select tests.authenticate_as('client_c');
select results_eq(
  $$ select coaching_id, attended_count, no_show_count, late_cancel_count, last_attended_at, next_session_at
     from public.coaching_stats order by attended_count $$,
  $$ values (tests.i('pair_bc'), 0, 0, 0, null::timestamptz, null::timestamptz),
            (tests.i('pair_ac'), 3, 1, 1, now() - interval '4 days', now() + interval '2 days') $$,
  'coaching_stats: C reads both pairs with the same numbers; a pair without bookings has zeros'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select coaching_id from public.coaching_stats $$, array[tests.i('pair_bc')],
  'coaching_stats: B reads only own pair');
select tests.authenticate_as('admin_x');
select is_empty($$ select coaching_id from public.coaching_stats $$, 'coaching_stats: the admin reads 0 rows');

-- =========================================================================================================
-- price_grid (R21, MONEY-1/2)

select tests.clear_authentication();
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to, archived_at)
values
  (tests.u('trainer_a'), 'Drop-in', 1, 2000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 5', 5, 9000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 10', 10, 16000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 20', 20, 30000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 3 same price', 3, 6000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 2 dearer', 2, 5000, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Pack 2 half', 2, 3001, 'RUB', 'any', null),
  (tests.u('trainer_a'), 'Old 30', 30, 30000, 'RUB', 'any', now()),
  (tests.u('trainer_a'), 'Personal drop-in', 1, 1000, 'RUB', 'personal', null),
  (tests.u('trainer_a'), 'Personal 4', 4, 3600, 'RUB', 'personal', null),
  (tests.u('trainer_a'), 'Personal 8', 8, 7200, 'RUB', 'personal', null),
  (tests.u('trainer_a'), 'Group 10', 10, 15000, 'RUB', 'group', null),
  (tests.u('trainer_a'), 'Dollar 10', 10, 200, 'USD', 'any', null),
  (tests.u('trainer_b'), 'B pack', 10, 20000, 'RUB', 'any', null);

select tests.authenticate_as('client_c');
select results_eq(
  $$ select title, per_session_minor, savings_pct, is_best_value from public.price_grid
     where title in ('Drop-in', 'Pack 5', 'Pack 10', 'Pack 20') order by sessions_count $$,
  $$ values ('Drop-in'::text, 2000::bigint, null::integer, false),
            ('Pack 5', 1800, 10, false), ('Pack 10', 1600, 20, false), ('Pack 20', 1500, 25, true) $$,
  'price_grid: drop-in 2000 and packs 5x9000, 10x16000, 20x30000 give 1800/1600/1500, 10/20/25 %, badge on 20 (MONEY-1)'
);
select results_eq(
  $$ select title, per_session_minor, savings_pct, is_best_value from public.price_grid
     where title in ('Pack 3 same price', 'Pack 2 dearer') order by title $$,
  $$ values ('Pack 2 dearer'::text, 2500::bigint, null::integer, false), ('Pack 3 same price', 2000, null, false) $$,
  'price_grid: a pack at or above the drop-in price gets NULL savings and no badge (MONEY-2)'
);
select results_eq(
  $$ select per_session_minor, savings_pct from public.price_grid where title = 'Pack 2 half' $$,
  $$ values (1501::bigint, 24) $$,
  'price_grid: the per-session price rounds half up and the savings round down'
);
select results_eq(
  $$ select title, savings_pct, is_best_value from public.price_grid where applies_to = 'personal' order by sessions_count $$,
  $$ values ('Personal drop-in'::text, null::integer, false), ('Personal 4', 10, false), ('Personal 8', 10, true) $$,
  'price_grid: on a savings tie the larger pack gets the badge'
);
select results_eq(
  $$ select g.drop_in_price_minor, g.savings_pct, g.is_best_value, d.title
     from public.price_grid g join public.packages d on d.id = g.drop_in_package_id
     where g.title = 'Group 10' $$,
  $$ values (2000::bigint, 25, true, 'Drop-in'::text) $$,
  'price_grid: without a group drop-in, a group pack compares with the drop-in for any session'
);
select results_eq(
  $$ select drop_in_package_id, savings_pct, is_best_value from public.price_grid where title = 'Dollar 10' $$,
  $$ values (null::uuid, null::integer, false) $$,
  'price_grid: a pack in another currency does not use the RUB drop-in'
);
select is(
  (select count(*) from public.price_grid where trainer_id = tests.u('trainer_a') and title = 'Old 30'),
  0::bigint,
  'price_grid: an archived pack is not in the grid and takes no badge'
);
select is(
  (select count(*) from public.price_grid where is_best_value),
  3::bigint,
  'price_grid: one badge per trainer, currency and session type that has a saving (none for B or USD)'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select title from public.price_grid $$, array['B pack'], 'price_grid: B reads only own grid');
select tests.authenticate_as('stranger_s');
select is_empty($$ select package_id from public.price_grid $$, 'price_grid: a stranger reads 0 rows');

-- =========================================================================================================
-- public_profiles (R6)

select tests.clear_authentication();
update public.user_settings set display_name = 'Coach Anna' where user_id = tests.u('trainer_a');
select tests.authenticate_as('client_c');
select results_eq(
  $$ select display_name, is_managed_card from public.public_profiles where id = tests.u('trainer_a') $$,
  $$ values ('Coach Anna'::text, false) $$,
  'public_profiles: a pair partner sees the display name from the partner''s settings'
);
select results_eq(
  $$ select display_name from public.public_profiles where id = tests.u('client_c') $$,
  $$ values ('client_c'::text) $$,
  'public_profiles: without a last name the first name alone is shown'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select is_managed_card from public.public_profiles where id = tests.u('card_m') $$,
  $$ values (true) $$,
  'public_profiles: the trainer sees own card marked as a card'
);
select tests.authenticate_as('stranger_s');
select set_eq($$ select id from public.public_profiles $$, array[tests.u('stranger_s')],
  'public_profiles: a stranger reads only own row');
select hasnt_column('public', 'public_profiles', 'telegram_id', 'public_profiles: the view has no telegram_id column');

-- =========================================================================================================
-- session_occupancy and session_meeting_url (R18, R25)

-- An open online group session of A for 5: C confirmed, D requested; F (live pair) has no booking.
select tests.clear_authentication();
insert into tests.ids values
  ('s_group', tests.create_session('trainer_a', now() + interval '4 days', 'group', 5, true, 'https://meet.example.com/a'));
select tests.create_booking(tests.i('s_group'), 'trainer_a', 'client_c', 'confirmed');
select tests.create_booking(tests.i('s_group'), 'trainer_a', 'client_d', 'requested', 'client_session');

select tests.authenticate_as('trainer_a');
select results_eq($$ select occupied, capacity from public.session_occupancy(tests.i('s_group')) $$,
  $$ values (2, 5::smallint) $$, 'session_occupancy: A gets 2 of 5 (a request holds a seat)');
select is(public.session_meeting_url(tests.i('s_group')), 'https://meet.example.com/a',
  'session_meeting_url: A gets the link');
select tests.authenticate_as('client_c');
select results_eq($$ select occupied, capacity from public.session_occupancy(tests.i('s_group')) $$,
  $$ values (2, 5::smallint) $$, 'session_occupancy: a participant gets the counts');
select is(public.session_meeting_url(tests.i('s_group')), 'https://meet.example.com/a',
  'session_meeting_url: C with a confirmed booking gets the link');
select tests.authenticate_as('client_d');
select is(public.session_meeting_url(tests.i('s_group')), null, 'session_meeting_url: D with only a request gets NULL');
select tests.authenticate_as('client_f');
select results_eq($$ select occupied, capacity from public.session_occupancy(tests.i('s_group')) $$,
  $$ values (2, 5::smallint) $$, 'session_occupancy: a live-pair client gets the counts of an open session');
select is(public.session_meeting_url(tests.i('s_group')), null, 'session_meeting_url: F on an open session gets NULL');
select tests.authenticate_as('client_e');
select is_empty($$ select * from public.session_occupancy(tests.i('s_group')) $$,
  'session_occupancy: E (ended pair) gets no row');
select tests.authenticate_as('trainer_b');
select is_empty($$ select * from public.session_occupancy(tests.i('s_group')) $$, 'session_occupancy: B gets no row');
select is(public.session_meeting_url(tests.i('s_group')), null, 'session_meeting_url: B gets NULL');
select tests.authenticate_as('stranger_s');
select is_empty($$ select * from public.session_occupancy(tests.i('s_group')) $$,
  'session_occupancy: a stranger gets no row');
select tests.authenticate_as_anon();
select throws_ok($$ select public.session_meeting_url(gen_random_uuid()) $$, '42501', null,
  'session_meeting_url: anon cannot call it');

-- =========================================================================================================
-- Catalog

select tests.clear_authentication();
select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.oid in ('public.public_profiles'::regclass, 'public.pass_balances'::regclass,
                    'public.coaching_balances'::regclass, 'public.coaching_stats'::regclass, 'public.price_grid'::regclass)
      and c.reloptions @> array['security_invoker=true']
    order by 1),
  array['coaching_balances', 'coaching_stats', 'pass_balances', 'price_grid', 'public_profiles'],
  'every view of this file has security_invoker'
);
select ok(
  not has_table_privilege('authenticated', 'public.pass_balances', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.coaching_balances', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.coaching_stats', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.price_grid', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.public_profiles', 'INSERT, UPDATE, DELETE'),
  'the views are read-only for signed-in users'
);
select is(
  array(
    select p.proname || ' ' || p.prosecdef::text || ' ' || p.provolatile::text from pg_catalog.pg_proc p
    where p.oid in ('public.session_occupancy(uuid)'::regprocedure, 'public.session_meeting_url(uuid)'::regprocedure)
    order by 1),
  array['session_meeting_url true s', 'session_occupancy true s'],
  'session functions are stable security definer'
);

select * from finish();
rollback;

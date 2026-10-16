-- Passes and payments of migration 20261016214300_passes_payments.sql (PRD wave-1 §2.8 rules 4–16, MONEY-4,
-- MONEY-5, MONEY-7, MONEY-9, MONEY-10; data-model §3.4): create_pass with the debt it settles and an optional
-- payment, cancel_pass, change_pass_expiry, the pass choice and share helpers, and "Я оплатил" to the trainer.
begin;
\ir _helpers.psql
select plan(48);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d', 'ended');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
insert into tests.ids values ('pair_bc', tests.pair_id('trainer_b', 'client_c'));
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;

with r as (
  insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, validity_days, applies_to)
  values (tests.u('trainer_a'), '10 занятий', 10, 1600000, 'RUB', 30, 'personal') returning id
)
insert into tests.ids select 'pkg10', id from r;
with r as (
  insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, archived_at)
  values (tests.u('trainer_a'), 'Старый', 5, 500000, 'RUB', now()) returning id
)
insert into tests.ids select 'pkg_old', id from r;
with r as (
  insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
  values (tests.u('trainer_b'), 'У Бориса', 5, 500000, 'RUB') returning id
)
insert into tests.ids select 'pkg_b', id from r;

-- Debt of pair A–C, oldest first: a manual charge, a group session charge, another manual charge.
insert into tests.ids values ('group_session', tests.create_session('trainer_a', now() - interval '3 days', 'group', 5));
insert into tests.ids values ('group_booking', tests.create_booking(tests.id('group_session'), 'trainer_a', 'client_c', 'attended'));
with r as (
  insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, amount_minor, currency, charge_reason,
                                     note, occurred_at)
  values (tests.pair_id('trainer_a', 'client_c'), 'charge', -1, 200000, 'RUB', 'manual', 'долг', now() - interval '5 days')
  returning id
)
insert into tests.ids select 'debt1', id from r;
with r as (
  insert into public.ledger_entries (coaching_id, entry_type, booking_id, sessions_delta, amount_minor, currency,
                                     charge_reason, occurred_at)
  values (tests.pair_id('trainer_a', 'client_c'), 'charge', tests.id('group_booking'), -1, 200000, 'RUB', 'attended',
          (select starts_at from public.sessions where id = tests.id('group_session')))
  returning id
)
insert into tests.ids select 'debt_group', id from r;
with r as (
  insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, amount_minor, currency, charge_reason,
                                     note, occurred_at)
  values (tests.pair_id('trainer_a', 'client_c'), 'charge', -1, 200000, 'RUB', 'manual', 'долг', now() - interval '1 day')
  returning id
)
insert into tests.ids select 'debt3', id from r;

-- =========================================================================================================
-- Helpers
-- =========================================================================================================

select results_eq(
  $$ select private.pass_share_minor(1000, 3, k) from generate_series(1, 4) k $$,
  $$ values (333::bigint), (333::bigint), (334::bigint), (0::bigint) $$,
  'share: three sessions of 10.00 earn 3.33, 3.33 and 3.34, and nothing past the pass size'
);
select results_eq(
  $$ select private.pass_fits_kind(a, k)
     from (values ('any'::public.package_applies_to, 'group'::public.session_kind), ('personal', 'trial'),
                  ('personal', 'group'), ('group', 'personal'), ('group', null)) v (a, k) $$,
  $$ values (true), (true), (false), (false), (true) $$,
  'kind: any fits all, a trial counts as personal, a manual charge fits every pass'
);

-- =========================================================================================================
-- create_pass
-- =========================================================================================================

select tests.authenticate_as('trainer_a');
insert into tests.ids
select 'pass10', pass_id from public.create_pass(tests.pair_id('trainer_a', 'client_c'), tests.id('pkg10'),
  p_starts_on => date '2026-11-01');

select tests.clear_authentication();
select results_eq(
  $$ select title, sessions_total::integer, price_minor, currency::text, applies_to::text, is_drop_in, starts_on,
            expires_at, package_id, sold_by, status::text
     from public.passes where id = tests.id('pass10') $$,
  $$ values ('10 занятий'::text, 10, 1600000::bigint, 'RUB'::text, 'personal'::text, false, date '2026-11-01',
             timestamptz '2026-12-01 00:00:00+03', tests.id('pkg10'), tests.u('trainer_a'), 'active'::text) $$,
  'create: a pass from a package snapshots it and is valid through day 30 in the trainer time zone'
);
select results_eq(
  $$ select entry_type::text, sessions_delta, amount_minor from public.ledger_entries
     where pass_id = tests.id('pass10') order by entry_type = 'grant' desc, created_at $$,
  $$ values ('grant'::text, 10, 0::bigint), ('settlement', -1, 160000::bigint), ('settlement', -1, 160000::bigint) $$,
  'create: the grant gives 10 sessions and two settlements earn the pass share'
);
select results_eq(
  $$ select related_entry_id from public.ledger_entries
     where pass_id = tests.id('pass10') and entry_type = 'settlement' order by related_entry_id = tests.id('debt3') $$,
  $$ values (tests.id('debt1')), (tests.id('debt3')) $$,
  'create: a personal pass settles both manual debts and skips the group one (MONEY-7, rule 6)'
);
select results_eq(
  $$ select debt_sessions, debt_amounts from public.coaching_balances where coaching_id = tests.pair_id('trainer_a', 'client_c') $$,
  $$ values (1, '{"RUB": 200000}'::jsonb) $$,
  'create: one group session of debt is left'
);
select is(
  (select remaining from public.pass_balances where pass_id = tests.id('pass10')), 8,
  'create: 10 sessions minus the settled debt leave 8'
);
select is(
  (select count(*)::integer from public.money_events where pass_id = tests.id('pass10') and action = 'pass_created'), 1,
  'create: the sale is in the money history'
);

-- A custom drop-in for any session settles the oldest debt left, and pays for itself.
select tests.authenticate_as('trainer_a');
insert into tests.ids
select 'drop_in', pass_id from public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Разовое',
  p_sessions => 1, p_price_minor => 250000, p_currency => 'RUB', p_payment_minor => 250000, p_payment_method => 'sbp');
select results_eq(
  $$ select is_drop_in, expires_at is null, (select count(*)::integer from public.ledger_entries e
       where e.pass_id = p.id and e.entry_type = 'settlement' and e.related_entry_id = tests.id('debt_group'))
     from public.passes p where p.id = tests.id('drop_in') $$,
  $$ values (true, true, 1) $$,
  'create: a custom 1-session pass is a drop-in without expiry and settles the group debt'
);
select results_eq(
  $$ select status::text, direction::text, amount_minor, method::text, confirmed_by from public.payments
     where pass_id = tests.id('drop_in') $$,
  $$ values ('confirmed'::text, 'in'::text, 250000::bigint, 'sbp'::text, tests.u('trainer_a')) $$,
  'create: the payment given with the pass is stored as confirmed by the trainer'
);
select results_eq(
  $$ select status, paid_minor, unpaid_minor, remaining from public.pass_balances where pass_id = tests.id('drop_in') $$,
  $$ values ('exhausted'::text, 250000::bigint, 0::bigint, 0) $$,
  'create: the drop-in is paid and used up by the debt'
);
select is(
  (select debt_sessions from public.coaching_balances where coaching_id = tests.pair_id('trainer_a', 'client_c')), 0,
  'create: no debt is left'
);
select is(
  (select settled from public.create_pass(tests.pair_id('trainer_a', 'client_c'), tests.id('pkg10'))), 0,
  'create: without debt nothing is settled'
);

-- Who may sell what.
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_d'), tests.id('pkg10')) $$,
  'P0001', 'coaching_ended', 'create: an ended pair gets no new pass'
);
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), tests.id('pkg_old')) $$,
  'P0001', 'package_not_found', 'create: an archived package cannot be sold'
);
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), tests.id('pkg_b')) $$,
  'P0001', 'package_not_found', 'create: another trainer''s package cannot be sold'
);
select throws_ok(
  $$ select public.create_pass(tests.id('pair_bc'), tests.id('pkg_b')) $$,
  'P0001', 'coaching_not_found', 'create: another trainer''s pair is not found'
);
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'X', p_sessions => 0,
       p_price_minor => 100, p_currency => 'RUB') $$,
  '22023', 'pass_invalid', 'create: a custom pass needs 1 to 200 sessions'
);
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'X', p_sessions => 3,
       p_price_minor => 100, p_currency => null) $$,
  '22023', 'pass_invalid', 'create: a custom pass needs a currency'
);
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), tests.id('pkg10'), p_payment_minor => 100) $$,
  '22023', 'payment_invalid', 'create: a payment needs a method'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Сам себе', p_sessions => 10,
       p_price_minor => 0, p_currency => 'RUB') $$,
  'P0001', 'coaching_not_found', 'create: the client cannot give themselves a pass'
);
select throws_ok(
  $$ insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, starts_on)
     values (tests.pair_id('trainer_a', 'client_c'), 'X', 1, 0, 'RUB', current_date) $$,
  '42501', null, 'create: nobody inserts a pass directly'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.create_pass(gen_random_uuid()) $$, '42501', null, 'create: anon cannot call it'
);

-- =========================================================================================================
-- pick_pass: the nearest expiry first, frozen and cancelled passes never (MONEY-4, rule 14)
-- =========================================================================================================

select tests.clear_authentication();
insert into tests.ids values
  ('pass_late', tests.create_pass('trainer_b', 'client_c', 5, 500000, 'RUB', now() + interval '60 days')),
  ('pass_soon', tests.create_pass('trainer_b', 'client_c', 5, 500000, 'RUB', now() + interval '20 days')),
  ('pass_open', tests.create_pass('trainer_b', 'client_c', 5, 500000, 'RUB'));
select is(
  private.pick_pass(tests.pair_id('trainer_b', 'client_c'), 'personal', now()), tests.id('pass_soon'),
  'pick: the pass that expires first is used (MONEY-4)'
);
select is(
  private.pick_pass(tests.pair_id('trainer_b', 'client_c'), 'personal', now(), tests.id('pass_open')), tests.id('pass_open'),
  'pick: the reserved pass wins while it qualifies'
);
insert into public.pass_freezes (pass_id, period)
values (tests.id('pass_soon'), daterange(current_date - 1, current_date + 10));
select is(
  private.pick_pass(tests.pair_id('trainer_b', 'client_c'), 'personal', now()), tests.id('pass_late'),
  'pick: a frozen pass is skipped on its frozen days'
);
select is(
  private.pick_pass(tests.pair_id('trainer_b', 'client_c'), 'personal', now() + interval '70 days'), tests.id('pass_open'),
  'pick: expired passes are skipped, a pass without expiry is last'
);
select is(
  private.pick_pass(tests.pair_id('trainer_a', 'client_d'), 'personal', now()), null,
  'pick: no qualifying pass means debt'
);

-- =========================================================================================================
-- change_pass_expiry (MONEY-5)
-- =========================================================================================================

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), date '2026-12-15', '  Болел две недели  ') $$,
  'expiry: the trainer moves the last day with a reason'
);
select tests.clear_authentication();
select results_eq(
  $$ select p.expires_at, (select e.reason from public.money_events e where e.pass_id = p.id and e.action = 'pass_changed')
     from public.passes p where p.id = tests.id('pass10') $$,
  $$ values (timestamptz '2026-12-16 00:00:00+03', 'Болел две недели'::text) $$,
  'expiry: valid through 15 December, and the history keeps the reason'
);
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), null, 'Без срока') $$, 'expiry: the expiry can be removed'
);
select is((select expires_at from public.passes where id = tests.id('pass10')), null, 'expiry: the pass has no end now');
select throws_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), date '2026-12-15', '   ') $$,
  '22023', 'reason_required', 'expiry: a reason is required'
);
select throws_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), date '2026-10-01', 'Ошибка') $$,
  '22023', 'invalid_range', 'expiry: the last day cannot be before the start'
);
select throws_ok(
  $$ update public.passes set expires_at = now() where id = tests.id('pass10') $$,
  '42501', null, 'expiry: the column is not writable directly'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), date '2027-12-15', 'Хочу') $$,
  'P0001', 'pass_not_found', 'expiry: the client cannot extend own pass'
);

-- =========================================================================================================
-- cancel_pass (MONEY-10)
-- =========================================================================================================

select tests.clear_authentication();
insert into tests.ids values ('future_session', tests.create_session('trainer_a', now() + interval '2 days'));
insert into tests.ids values ('future_booking', tests.create_booking(tests.id('future_session'), 'trainer_a', 'client_c'));
update public.bookings set reserved_pass_id = tests.id('pass10') where id = tests.id('future_booking');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.cancel_pass(tests.id('pass10'), '') $$, '22023', 'reason_required', 'cancel: a reason is required'
);
select lives_ok($$ select public.cancel_pass(tests.id('pass10'), 'Клиент уехал') $$, 'cancel: the trainer cancels a used pass');
select tests.clear_authentication();
select results_eq(
  $$ select entry_type::text, sessions_delta, note from public.ledger_entries
     where pass_id = tests.id('pass10') and entry_type = 'refund' $$,
  $$ values ('refund'::text, -8, 'Клиент уехал'::text) $$,
  'cancel: a refund row takes the 8 sessions left'
);
select results_eq(
  $$ select status::text, cancelled_by, cancel_reason, (select status from public.pass_balances b where b.pass_id = p.id)
     from public.passes p where p.id = tests.id('pass10') $$,
  $$ values ('cancelled'::text, tests.u('trainer_a'), 'Клиент уехал'::text, 'cancelled'::text) $$,
  'cancel: the pass is cancelled by the trainer with the reason'
);
select is(
  (select reason from public.money_events where pass_id = tests.id('pass10') and action = 'pass_cancelled'), 'Клиент уехал',
  'cancel: the history keeps the reason'
);
select is(
  (select reserved_pass_id from public.bookings where id = tests.id('future_booking')), null,
  'cancel: the future booking is no longer reserved on the pass'
);
select tests.authenticate_as('trainer_a');
select lives_ok($$ select public.cancel_pass(tests.id('pass10'), 'Ещё раз') $$, 'cancel: cancelling again changes nothing');
select throws_ok(
  $$ select public.change_pass_expiry(tests.id('pass10'), date '2027-01-01', 'Продлить') $$,
  'P0001', 'pass_cancelled', 'cancel: a cancelled pass is not extended'
);
select throws_ok(
  $$ delete from public.passes where id = tests.id('drop_in') $$,
  'P0001', 'pass_in_use', 'cancel: a pass with settlements and payments is cancelled, not deleted'
);

-- =========================================================================================================
-- "Я оплатил": the trainer hears about it, the balance does not move
-- =========================================================================================================

select tests.clear_authentication();
insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 5, 900000, 'RUB'));
select tests.authenticate_as('client_c');
with r as (
  insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
  values (tests.pair_id('trainer_a', 'client_c'), tests.id('pass_c'), 450000, 'RUB', 'sbp', now(), 'reported')
  returning id
)
insert into tests.ids select 'report', id from r;
select tests.clear_authentication();
select results_eq(
  $$ select user_id, payload ->> 'amount_minor', payload ->> 'pass_title' from public.notification_outbox
     where type = 'payment_reported' $$,
  $$ values (tests.u('trainer_a'), '450000'::text, '5 sessions'::text) $$,
  'report: the trainer gets one payment_reported message'
);
select results_eq(
  $$ select paid_minor, unpaid_minor from public.pass_balances where pass_id = tests.id('pass_c') $$,
  $$ values (0::bigint, 900000::bigint) $$,
  'report: a reported payment does not count until the trainer confirms it'
);
select tests.authenticate_as('trainer_a');
update public.payments set status = 'confirmed' where id = tests.id('report');
select tests.clear_authentication();
select results_eq(
  $$ select paid_minor, unpaid_minor from public.pass_balances where pass_id = tests.id('pass_c') $$,
  $$ values (450000::bigint, 450000::bigint) $$,
  'report: once confirmed, half the price is paid (MONEY-9: partial)'
);

select * from finish();
rollback;

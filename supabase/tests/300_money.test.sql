-- Money policies of migration 20261015123400_money_policies.sql (contract §1.4 file 18, §6 300_money):
-- packages, passes and the pass delete guard, pass_freezes and its started-freeze guard, payments and its
-- column guard, payment_links. Also: another trainer of the same client never sees these rows, an ended pair
-- keeps its accounting, and the admin sees no money rows, not even with break-glass access.
begin;
\ir _helpers.psql
select plan(145);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
-- Today in A's time zone (the zone that decides whether a freeze has started).
create function tests.today_a() returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone p.time_zone)::date from public.profiles p where p.id = tests.user_id('trainer_a')
$$;

insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e'));

-- Packages: A has a hidden pack and an archived pack, B has one pack.
insert into public.packages (id, trainer_id, title, sessions_count, price_minor, currency, is_public, archived_at)
values
  (gen_random_uuid(), tests.u('trainer_a'), 'Hidden 5', 5, 9000, 'RUB', false, null),
  (gen_random_uuid(), tests.u('trainer_a'), 'Old 8', 8, 12000, 'RUB', true, now()),
  (gen_random_uuid(), tests.u('trainer_b'), 'B 10', 10, 20000, 'RUB', true, null);
insert into tests.ids select 'pkg_a_hidden', id from public.packages where title = 'Hidden 5';
insert into tests.ids select 'pkg_a_archived', id from public.packages where title = 'Old 8';
insert into tests.ids select 'pkg_b', id from public.packages where title = 'B 10';

-- Passes (each with its grant row).
insert into tests.ids values
  ('pass_ac', tests.create_pass('trainer_a', 'client_c', 10, 16000)),
  ('pass_ac_del', tests.create_pass('trainer_a', 'client_c', 5)),
  ('pass_ac_charged', tests.create_pass('trainer_a', 'client_c', 5)),
  ('pass_ac_paid', tests.create_pass('trainer_a', 'client_c', 5, 9000)),
  ('pass_ac_cancelled', tests.create_pass('trainer_a', 'client_c', 5)),
  ('pass_bc', tests.create_pass('trainer_b', 'client_c', 10, 20000)),
  ('pass_ad', tests.create_pass('trainer_a', 'client_d', 5, 9000)),
  ('pass_ae', tests.create_pass('trainer_a', 'client_e', 5, 9000));
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.i('pass_ac_cancelled');

-- Charges: an attended past session on pass_ac_charged (A-C) and on pass_ad (A-D).
insert into tests.ids values
  ('session_c', tests.create_session('trainer_a', now() - interval '2 days')),
  ('session_d', tests.create_session('trainer_a', now() - interval '3 days'));
insert into tests.ids values
  ('booking_c', tests.create_booking(tests.i('session_c'), 'trainer_a', 'client_c', 'attended')),
  ('booking_d', tests.create_booking(tests.i('session_d'), 'trainer_a', 'client_d', 'attended'));
insert into public.ledger_entries
  (coaching_id, entry_type, pass_id, booking_id, sessions_delta, amount_minor, currency, charge_reason, occurred_at)
values
  (tests.i('pair_ac'), 'charge', tests.i('pass_ac_charged'), tests.i('booking_c'), -1, 0, 'RUB', 'attended',
   (select starts_at from public.sessions where id = tests.i('session_c'))),
  (tests.i('pair_ad'), 'charge', tests.i('pass_ad'), tests.i('booking_d'), -1, 1800, 'RUB', 'attended',
   (select starts_at from public.sessions where id = tests.i('session_d')));

-- Confirmed payments entered by the server: on pass_ac_paid, on pass_ad and on the ended pair's pass.
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
values
  (tests.i('pair_ac'), tests.i('pass_ac_paid'), 9000, 'RUB', 'cash', now(), 'confirmed', 'fixture paid'),
  (tests.i('pair_ad'), tests.i('pass_ad'), 9000, 'RUB', 'cash', now(), 'confirmed', 'fixture ad'),
  (tests.i('pair_ae'), tests.i('pass_ae'), 9000, 'RUB', 'cash', now(), 'confirmed', 'fixture ae'),
  (tests.i('pair_bc'), tests.i('pass_bc'), 20000, 'RUB', 'card', now(), 'confirmed', 'fixture bc');
insert into tests.ids select 'pay_ae', id from public.payments where note = 'fixture ae';
insert into tests.ids select 'pay_bc', id from public.payments where note = 'fixture bc';

-- Payment links of A and B.
insert into public.payment_links (trainer_id, title, url, kind)
values
  (tests.u('trainer_a'), 'SBP A', 'https://pay.example.com/a', 'sbp'),
  (tests.u('trainer_b'), 'SBP B', 'https://pay.example.com/b', 'sbp');
insert into tests.ids select 'link_a', id from public.payment_links where title = 'SBP A';

-- The admin holds a live break-glass grant on C for every category: money is not a category, so it opens nothing.
select tests.create_break_glass('admin_x', 'client_c', enum_range(null::public.share_category));

-- =========================================================================================================
-- packages

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'Drop-in', 1, 2000, 'RUB'), (tests.u('trainer_a'), 'Pack 10', 10, 16000, 'RUB') $$,
  'packages: A inserts a drop-in and a pack'
);
select results_eq(
  $$ update public.packages set title = 'Pack of 10' where title = 'Pack 10' returning title $$,
  $$ values ('Pack of 10'::text) $$,
  'packages: A updates own package'
);
select results_eq(
  $$ update public.packages set archived_at = now() where title = 'Pack of 10' returning archived_at is not null $$,
  $$ values (true) $$,
  'packages: A archives own package'
);
select throws_ok(
  $$ delete from public.packages where title = 'Pack of 10' $$,
  '42501', null, 'packages: delete raises 42501 (archive instead)'
);
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_b'), 'For B', 5, 1000, 'RUB') $$,
  '42501', null, 'packages: A cannot insert a package for B'
);
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, price_updated_at)
     values (tests.u('trainer_a'), 'Stamped', 5, 1000, 'RUB', now() - interval '1 year') $$,
  '42501', null, 'packages: price_updated_at is not insertable'
);
select throws_ok(
  $$ update public.packages set price_updated_at = now() - interval '1 year' where title = 'Drop-in' $$,
  '42501', null, 'packages: price_updated_at is not writable'
);
select throws_ok(
  $$ update public.packages set trainer_id = tests.u('trainer_b') where title = 'Drop-in' $$,
  '42501', null, 'packages: trainer_id is not writable'
);

-- price_updated_at follows price and session count changes only.
select tests.clear_authentication();
update public.packages set price_updated_at = '2025-01-01 00:00+00' where trainer_id = tests.u('trainer_a');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.packages set title = 'Single session' where title = 'Drop-in' returning price_updated_at $$,
  $$ values ('2025-01-01 00:00+00'::timestamptz) $$,
  'packages: a title change keeps price_updated_at'
);
select results_eq(
  $$ update public.packages set price_minor = 2200 where title = 'Single session' returning price_updated_at = now() $$,
  $$ values (true) $$,
  'packages: a price change stamps price_updated_at'
);
select results_eq(
  $$ update public.packages set sessions_count = 6 where id = tests.i('pkg_a_hidden') returning price_updated_at = now() $$,
  $$ values (true) $$,
  'packages: a session count change stamps price_updated_at'
);

-- Checks.
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'Zero', 0, 1000, 'RUB') $$,
  '23514', null, 'packages: sessions_count 0 violates the check'
);
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'Negative', 5, -1, 'RUB') $$,
  '23514', null, 'packages: a negative price violates the check'
);
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'Lower case', 5, 1000, 'rub') $$,
  '23514', null, 'packages: currency rub violates the domain check'
);

-- One live drop-in per trainer, currency and type.
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'Second drop-in', 1, 2500, 'RUB') $$,
  '23505', null, 'packages: a second live drop-in with the same key raises 23505'
);
select lives_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to)
     values (tests.u('trainer_a'), 'Group drop-in', 1, 1000, 'RUB', 'group') $$,
  'packages: a drop-in for another session type is allowed'
);
select lives_ok(
  $$ update public.packages set archived_at = now() where title = 'Single session' $$,
  'packages: A archives the drop-in'
);
select lives_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('trainer_a'), 'New drop-in', 1, 2500, 'RUB') $$,
  'packages: after archiving, a new drop-in with the same key is allowed'
);

-- Who reads packages (R81).
select set_eq(
  $$ select title from public.packages $$,
  array['Hidden 5', 'Old 8', 'Pack of 10', 'Single session', 'Group drop-in', 'New drop-in'],
  'packages: A reads every own package, archived ones too'
);
select tests.authenticate_as('client_c');
select set_eq(
  $$ select title from public.packages $$,
  array['Hidden 5', 'Group drop-in', 'New drop-in', 'B 10'],
  'packages: C reads the live packages of both trainers, is_public = false included, archived ones not'
);
select is_empty(
  $$ update public.packages set title = 'Mine now' where id = tests.i('pkg_a_hidden') returning 1 $$,
  'packages: C cannot update A''s package (0 rows)'
);
select tests.authenticate_as('client_e');
select set_eq(
  $$ select title from public.packages $$,
  array['Hidden 5', 'Group drop-in', 'New drop-in'],
  'packages: E (ended pair) still reads A''s live packages'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select title from public.packages $$, array['B 10'], 'packages: B reads 0 of A''s packages');
select is_empty(
  $$ update public.packages set title = 'Taken' where id = tests.i('pkg_a_hidden') returning 1 $$,
  'packages: B cannot update A''s package (0 rows)'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.packages $$, 'packages: a stranger reads 0 rows');
select throws_ok(
  $$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
     values (tests.u('stranger_s'), 'Not a trainer', 5, 1000, 'RUB') $$,
  '23503', null, 'packages: a user without a trainer profile cannot add packages (23503)'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.packages $$, 'packages: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.packages $$, '42501', null, 'packages: anon has no access');

-- =========================================================================================================
-- passes

select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.passes $$,
  array[tests.i('pass_ac'), tests.i('pass_ac_del'), tests.i('pass_ac_charged'), tests.i('pass_ac_paid'),
        tests.i('pass_ac_cancelled'), tests.i('pass_bc')],
  'passes: C reads own passes of both pairs'
);
select is_empty(
  $$ update public.passes set note = 'mine' where id = tests.i('pass_ac') returning 1 $$,
  'passes: C''s update changes 0 rows'
);
select is_empty(
  $$ delete from public.passes where id = tests.i('pass_ac_del') returning 1 $$,
  'passes: C''s delete changes 0 rows'
);

select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.passes $$,
  array[tests.i('pass_ac'), tests.i('pass_ac_del'), tests.i('pass_ac_charged'), tests.i('pass_ac_paid'),
        tests.i('pass_ac_cancelled'), tests.i('pass_ad'), tests.i('pass_ae')],
  'passes: A reads passes of own pairs only, the ended pair included (no pass of B)'
);
select throws_ok(
  $$ insert into public.passes (coaching_id, trainer_id, client_id, title, sessions_total, price_minor, currency, starts_on)
     values (tests.i('pair_ac'), tests.u('trainer_a'), tests.u('client_c'), 'Direct', 5, 0, 'RUB', current_date) $$,
  '42501', null, 'passes: insert raises 42501 (create_pass RPC only)'
);
select results_eq(
  $$ update public.passes set title = 'Ten', note = 'paid in cash'
     where id = tests.i('pass_ac') returning title, note $$,
  $$ values ('Ten'::text, 'paid in cash'::text) $$,
  'passes: A updates title and note'
);
select throws_ok(
  $$ update public.passes set expires_at = now() + interval '60 days' where id = tests.i('pass_ac') $$,
  '42501', null, 'passes: expires_at is not writable (extending takes a reason, through an RPC)'
);
select throws_ok(
  $$ update public.passes set price_minor = 1 where id = tests.i('pass_ac') $$,
  '42501', null, 'passes: price_minor is not writable'
);
select throws_ok(
  $$ update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.i('pass_ac') $$,
  '42501', null, 'passes: status is not writable (cancel_pass RPC)'
);
select is_empty(
  $$ update public.passes set note = 'edit' where id = tests.i('pass_ac_cancelled') returning 1 $$,
  'passes: a cancelled pass cannot be edited (0 rows)'
);
select results_eq(
  $$ update public.passes set note = 'after the end' where id = tests.i('pass_ae') returning note $$,
  $$ values ('after the end'::text) $$,
  'passes: A still edits a pass of the ended pair'
);

select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.passes $$, array[tests.i('pass_bc')],
  'passes: B reads only own pass, 0 of A''s (MONEY-12)');
select is_empty(
  $$ update public.passes set note = 'b' where id = tests.i('pass_ac') returning 1 $$,
  'passes: B cannot update A''s pass (0 rows)'
);
select is_empty(
  $$ delete from public.passes where id = tests.i('pass_ac_del') returning 1 $$,
  'passes: B cannot delete A''s pass (0 rows)'
);
select tests.authenticate_as('client_e');
select set_eq($$ select id from public.passes $$, array[tests.i('pass_ae')],
  'passes: E still reads the pass of the ended pair');
select tests.authenticate_as('client_d');
select set_eq($$ select id from public.passes $$, array[tests.i('pass_ad')],
  'passes: D reads only own pass');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.passes $$, 'passes: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.passes $$, 'passes: the admin reads 0 rows, even with break-glass on C');

-- Checks and tenant keys (as postgres: passes come from an RPC).
select tests.clear_authentication();
select throws_ok(
  $$ insert into public.passes (coaching_id, package_id, title, sessions_total, price_minor, currency, starts_on)
     values (tests.i('pair_ac'), tests.i('pkg_b'), 'B pack for A', 10, 0, 'RUB', current_date) $$,
  '23503', null, 'passes: a package of B on A''s pair raises 23503'
);
select throws_ok(
  $$ insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, starts_on, is_drop_in)
     values (tests.i('pair_ac'), 'Drop-in of 2', 2, 0, 'RUB', current_date, true) $$,
  '23514', null, 'passes: is_drop_in with 2 sessions violates the check'
);

-- Pass delete (R27, MONEY-10).
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.passes where id = tests.i('pass_ac_del') returning id $$,
  $$ values (tests.i('pass_ac_del')) $$,
  'passes: A deletes a pass that has only its grant'
);
select throws_ok(
  $$ delete from public.passes where id = tests.i('pass_ac_charged') $$,
  'P0001', 'pass_in_use', 'passes: a pass with a charge raises pass_in_use'
);
select throws_ok(
  $$ delete from public.passes where id = tests.i('pass_ac_paid') $$,
  'P0001', 'pass_in_use', 'passes: a pass with a payment raises pass_in_use'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.ledger_entries where pass_id = tests.i('pass_ac_del')),
  0::bigint,
  'passes: the grant row of the deleted pass is gone too'
);
delete from public.coachings where id = tests.i('pair_ad');
select is(
  (select count(*) from public.passes where coaching_id = tests.i('pair_ad'))
    + (select count(*) from public.ledger_entries where coaching_id = tests.i('pair_ad'))
    + (select count(*) from public.payments where coaching_id = tests.i('pair_ad')),
  0::bigint,
  'passes: deleting the pair still removes its passes, ledger rows and payments'
);

-- =========================================================================================================
-- pass_freezes

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.pass_freezes (pass_id, period, reason)
     values (tests.i('pass_ac'), daterange(tests.today_a() - 3, tests.today_a() + 5), 'flu') $$,
  'pass_freezes: A freezes an active pass (a freeze that has started)'
);
select lives_ok(
  $$ insert into public.pass_freezes (pass_id, period, reason)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 10, tests.today_a() + 12), 'trip') $$,
  'pass_freezes: A adds a future freeze'
);
select is(
  (select created_by from public.pass_freezes where reason = 'flu'),
  tests.u('trainer_a'),
  'pass_freezes: created_by is stamped as A'
);
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period, created_by)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 20, tests.today_a() + 21), tests.u('client_c')) $$,
  '42501', null, 'pass_freezes: created_by is not insertable'
);
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 4, tests.today_a() + 7)) $$,
  '23P01', null, 'pass_freezes: an overlapping freeze raises 23P01'
);
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 30, null)) $$,
  '23514', null, 'pass_freezes: an unbounded upper end violates the check'
);
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period)
     values (tests.i('pass_ac_cancelled'), daterange(tests.today_a() + 1, tests.today_a() + 2)) $$,
  '42501', null, 'pass_freezes: a freeze on a cancelled pass fails RLS'
);

-- Started freeze: only its end may move, and not below today.
select throws_ok(
  $$ update public.pass_freezes set period = daterange(tests.today_a() - 2, tests.today_a() + 5) where reason = 'flu' $$,
  '42501', 'forbidden', 'pass_freezes: moving the start of a started freeze raises forbidden'
);
select throws_ok(
  $$ update public.pass_freezes set period = daterange(tests.today_a() - 3, tests.today_a() - 1) where reason = 'flu' $$,
  '42501', 'forbidden', 'pass_freezes: ending a started freeze before today raises forbidden'
);
select results_eq(
  $$ update public.pass_freezes set period = daterange(tests.today_a() - 3, tests.today_a()) where reason = 'flu'
     returning upper(period) = tests.today_a() $$,
  $$ values (true) $$,
  'pass_freezes: ending a started freeze early (today) is allowed'
);
select results_eq(
  $$ update public.pass_freezes set reason = 'flu, back early' where reason = 'flu' returning reason $$,
  $$ values ('flu, back early'::text) $$,
  'pass_freezes: the reason of a started freeze can change'
);
select is_empty(
  $$ delete from public.pass_freezes where reason = 'flu, back early' returning 1 $$,
  'pass_freezes: a started freeze cannot be deleted (0 rows)'
);
select results_eq(
  $$ update public.pass_freezes set period = daterange(tests.today_a() + 9, tests.today_a() + 14) where reason = 'trip'
     returning lower(period) = tests.today_a() + 9 $$,
  $$ values (true) $$,
  'pass_freezes: a future freeze can be moved'
);
select throws_ok(
  $$ update public.pass_freezes set pass_id = tests.i('pass_ac_paid') where reason = 'trip' $$,
  '42501', null, 'pass_freezes: pass_id is not writable'
);

select tests.authenticate_as('client_c');
select is(
  (select count(*) from public.pass_freezes where pass_id = tests.i('pass_ac')),
  2::bigint,
  'pass_freezes: C reads the freezes of own pass'
);
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 40, tests.today_a() + 41)) $$,
  '42501', null, 'pass_freezes: C cannot insert a freeze'
);
select is_empty(
  $$ update public.pass_freezes set reason = 'mine' where pass_id = tests.i('pass_ac') returning 1 $$,
  'pass_freezes: C cannot update a freeze (0 rows)'
);
select is_empty(
  $$ delete from public.pass_freezes where reason = 'trip' returning 1 $$,
  'pass_freezes: C cannot delete a freeze (0 rows)'
);
select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.pass_freezes $$, 'pass_freezes: B reads 0 of A''s freezes');
select throws_ok(
  $$ insert into public.pass_freezes (pass_id, period)
     values (tests.i('pass_ac'), daterange(tests.today_a() + 40, tests.today_a() + 41)) $$,
  '42501', null, 'pass_freezes: B''s insert on A''s pass fails RLS'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.pass_freezes $$, 'pass_freezes: the admin reads 0 rows');

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.pass_freezes where reason = 'trip' returning reason $$,
  $$ values ('trip'::text) $$,
  'pass_freezes: A deletes a future freeze'
);

-- =========================================================================================================
-- payments

-- The client reports a payment.
select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
     values (tests.i('pair_ac'), tests.i('pass_ac'), 5000, 'RUB', 'sbp', now(), 'reported', 'c report 1') $$,
  'payments: C reports a payment on own pair'
);
select lives_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status, note)
     values (tests.i('pair_ac'), 3000, 'RUB', 'cash', now(), 'reported', 'c report 2') $$,
  'payments: C reports a payment on account (no pass)'
);
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
values (tests.i('pair_ac'), null, 8000, 'RUB', 'sbp', now() - interval '1 day', 'reported', 'c report 3'),
       (tests.i('pair_ac'), null, 4000, 'RUB', 'sbp', now() - interval '1 day', 'reported', 'c report 4');
select results_eq(
  $$ update public.payments set pass_id = tests.i('pass_ac_paid') where note = 'c report 3' returning pass_id $$,
  $$ values (tests.i('pass_ac_paid')) $$,
  'payments: C moves own report to another pass of the pair'
);
select results_eq(
  $$ select reported_by, client_id, trainer_id from public.payments where note = 'c report 1' $$,
  $$ values (tests.u('client_c'), tests.u('client_c'), tests.u('trainer_a')) $$,
  'payments: reported_by is stamped and the pair columns are filled'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), 1000, 'RUB', 'cash', now(), 'confirmed') $$,
  '42501', null, 'payments: C inserting confirmed fails RLS'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status, direction)
     values (tests.i('pair_ac'), 1000, 'RUB', 'cash', now(), 'reported', 'refund') $$,
  '42501', null, 'payments: C inserting a refund fails RLS'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, client_id, trainer_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ad'), tests.u('client_c'), tests.u('trainer_a'), 1000, 'RUB', 'cash', now(), 'reported') $$,
  '23503', null, 'payments: C inserting into the A-D pair raises 23503'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, client_id, trainer_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), tests.u('client_c'), tests.u('trainer_b'), 1000, 'RUB', 'cash', now(), 'reported') $$,
  '23503', null, 'payments: C inserting with B''s trainer_id raises 23503'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status, reported_by)
     values (tests.i('pair_ac'), 1000, 'RUB', 'cash', now(), 'reported', tests.u('trainer_a')) $$,
  '42501', null, 'payments: reported_by is not insertable'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), tests.i('pass_ac'), 1000, 'USD', 'cash', now(), 'reported') $$,
  'P0001', 'currency_mismatch', 'payments: a currency other than the pass currency raises currency_mismatch'
);

-- The client edits and withdraws own report while it is reported.
select results_eq(
  $$ update public.payments set amount_minor = 5500, method = 'bank_transfer', note = 'c report 1 fixed'
     where note = 'c report 1' returning amount_minor $$,
  $$ values (5500::bigint) $$,
  'payments: C edits own reported payment'
);
select throws_ok(
  $$ update public.payments set status = 'confirmed' where note = 'c report 1 fixed' $$,
  '42501', null, 'payments: C cannot confirm own report'
);
select throws_ok(
  $$ update public.payments set void_reason = 'why not' where note = 'c report 1 fixed' $$,
  '42501', 'forbidden', 'payments: C cannot set a void reason without withdrawing'
);
select throws_ok(
  $$ update public.payments set status = 'voided' where note = 'c report 2' $$,
  '23514', null, 'payments: withdrawing without a reason violates the check'
);
select results_eq(
  $$ update public.payments set status = 'voided', void_reason = 'paid twice by mistake' where note = 'c report 2'
     returning status, voided_at is not null $$,
  $$ values ('voided'::public.payment_status, true) $$,
  'payments: C withdraws own report (voided with a reason)'
);
select is_empty(
  $$ update public.payments set note = 'again' where note = 'c report 2' returning 1 $$,
  'payments: C cannot change a voided report (0 rows)'
);
select throws_ok(
  $$ update public.payments set direction = 'refund' where note = 'c report 1 fixed' $$,
  '42501', null, 'payments: direction is not writable'
);
select throws_ok(
  $$ update public.payments set confirmed_by = tests.u('client_c') where note = 'c report 1 fixed' $$,
  '42501', null, 'payments: confirmed_by is not writable'
);
select throws_ok(
  $$ delete from public.payments where note = 'c report 1 fixed' $$,
  '42501', null, 'payments: delete raises 42501 (void instead)'
);
select set_eq(
  $$ select note from public.payments $$,
  array['fixture paid', 'fixture bc', 'c report 1 fixed', 'c report 2', 'c report 3', 'c report 4'],
  'payments: C reads own payments in both pairs'
);

-- The trainer enters, confirms and voids.
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
     values (tests.i('pair_ac'), tests.i('pass_ac'), 8000, 'RUB', 'cash', now(), 'confirmed', 'a entry') $$,
  'payments: A enters a confirmed payment'
);
select results_eq(
  $$ select confirmed_by, confirmed_at is not null from public.payments where note = 'a entry' $$,
  $$ values (tests.u('trainer_a'), true) $$,
  'payments: confirmed_by and confirmed_at are stamped'
);
select lives_ok(
  $$ insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status, note)
     values (tests.i('pair_ac'), tests.i('pass_ac'), 'refund', 1000, 'RUB', 'cash', now(), 'confirmed', 'a refund') $$,
  'payments: A enters a refund'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), 1000, 'RUB', 'cash', now(), 'reported') $$,
  '42501', null, 'payments: A inserting reported fails RLS'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), tests.i('pass_bc'), 1000, 'RUB', 'cash', now(), 'confirmed') $$,
  '23503', null, 'payments: a pass of another pair raises 23503'
);
select throws_ok(
  $$ insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), tests.i('pass_ac'), 1000, 'EUR', 'cash', now(), 'confirmed') $$,
  'P0001', 'currency_mismatch', 'payments: A''s payment in another currency than the pass raises currency_mismatch'
);
select results_eq(
  $$ update public.payments set status = 'confirmed' where note = 'c report 1 fixed' returning confirmed_by $$,
  $$ values (tests.u('trainer_a')) $$,
  'payments: A confirms C''s report (confirmed_by stamped)'
);
select throws_ok(
  $$ update public.payments set amount_minor = 1 where note = 'c report 1 fixed' $$,
  '42501', 'forbidden', 'payments: A changing amount_minor raises forbidden'
);
select throws_ok(
  $$ update public.payments set note = 'trainer note' where note = 'a entry' $$,
  '42501', 'forbidden', 'payments: A changing the note raises forbidden'
);
-- Every detail column of C's still reported payment, one at a time (on account, so a currency change is not
-- refused by the pass currency check first).
select throws_ok(
  format('update public.payments set %I = %s where note = %L', c.col, c.val, 'c report 4'),
  '42501', 'forbidden', format('payments: A changing %s of C''s report raises forbidden', c.col)
)
from (values
  ('amount_minor', '1'),
  ('currency', quote_literal('USD')),
  ('method', quote_literal('cash')),
  ('paid_at', quote_literal((now() - interval '90 days')::text)),
  ('note', quote_literal('trainer note')),
  ('pass_id', quote_literal(tests.i('pass_ac')::text))
) as c (col, val)
order by c.col;
select throws_ok(
  $$ update public.payments set void_reason = 'looks odd' where note = 'c report 4' $$,
  '42501', 'forbidden', 'payments: A giving a void reason without voiding raises forbidden'
);
-- A confirm conditioned on what A saw: C changes the amount meanwhile, so A's confirm changes 0 rows.
select tests.authenticate_as('client_c');
update public.payments set amount_minor = 800000 where note = 'c report 3';
select tests.authenticate_as('trainer_a');
select is_empty(
  $$ update public.payments set status = 'confirmed' where note = 'c report 3' and amount_minor = 8000 returning 1 $$,
  'payments: a confirm conditioned on the amount A saw changes 0 rows after C edited it'
);
select throws_ok(
  $$ update public.payments set status = 'voided' where note = 'a entry' $$,
  '23514', null, 'payments: voiding without a reason violates the check'
);
select results_eq(
  $$ update public.payments set status = 'voided', void_reason = 'wrong amount' where note = 'a entry'
     returning status, voided_at is not null $$,
  $$ values ('voided'::public.payment_status, true) $$,
  'payments: A voids a confirmed payment with a reason'
);
select throws_ok(
  $$ update public.payments set void_reason = 'client never paid' where note = 'a entry' $$,
  '42501', 'forbidden', 'payments: A cannot rewrite the void reason of a voided payment'
);
select results_eq(
  $$ select void_reason from public.payments where note = 'a entry' $$,
  $$ values ('wrong amount'::text) $$,
  'payments: the void reason stays as given when voiding'
);
select throws_ok(
  $$ update public.payments set status = 'confirmed' where note = 'a entry' $$,
  'P0001', 'invalid_transition', 'payments: voided -> confirmed raises invalid_transition'
);
select throws_ok(
  $$ update public.payments set status = 'reported' where note = 'a refund' $$,
  'P0001', 'invalid_transition', 'payments: confirmed -> reported raises invalid_transition'
);
select throws_ok(
  $$ delete from public.payments where note = 'a refund' $$,
  '42501', null, 'payments: A''s delete raises 42501'
);
select results_eq(
  $$ select note from public.payments where id = tests.i('pay_ae') $$,
  $$ values ('fixture ae'::text) $$,
  'payments: A still reads payments of the ended pair'
);
select is_empty(
  $$ select id from public.payments where id = tests.i('pay_bc') $$,
  'payments: A reads 0 of B''s payments with the same client'
);

-- After confirmation the report is the trainer's.
select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.payments set amount_minor = 1 where note = 'c report 1 fixed' returning 1 $$,
  'payments: after confirmation C''s update changes 0 rows'
);
select is_empty(
  $$ update public.payments set status = 'voided', void_reason = 'no' where note = 'c report 1 fixed' returning 1 $$,
  'payments: after confirmation C cannot void it (0 rows)'
);

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
     values (tests.i('pair_ac'), 1000, 'RUB', 'cash', now(), 'confirmed') $$,
  '42501', null, 'payments: B inserting into A''s pair fails RLS'
);
select set_eq($$ select id from public.payments $$, array[tests.i('pay_bc')],
  'payments: B reads only own pair''s payments');
select is_empty(
  $$ update public.payments set status = 'voided', void_reason = 'b' where note = 'a refund' returning 1 $$,
  'payments: B cannot void A''s payment (0 rows)'
);
select tests.authenticate_as('client_e');
select set_eq($$ select id from public.payments $$, array[tests.i('pay_ae')],
  'payments: E still reads payments of the ended pair');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.payments $$, 'payments: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.payments $$, 'payments: the admin reads 0 rows, even with break-glass on C');

-- The guards bind signed-in callers only: RPCs and jobs run as postgres and are trusted.
select tests.clear_authentication();
select lives_ok(
  $$ update public.pass_freezes set period = daterange(tests.today_a() - 4, tests.today_a())
     where reason = 'flu, back early' $$,
  'pass_freezes: the started-freeze guard does not bind server code'
);
select lives_ok(
  $$ update public.payments set note = 'server fix' where note = 'a refund' $$,
  'payments: the column guard does not bind server code'
);

-- =========================================================================================================
-- payment_links

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.payment_links (trainer_id, title, url)
     values (tests.u('trainer_a'), 'Plain', 'http://pay.example.com') $$,
  '23514', null, 'payment_links: an http:// link violates the check (MONEY-11)'
);
select lives_ok(
  $$ insert into public.payment_links (trainer_id, title, url, kind)
     values (tests.u('trainer_a'), 'Bank A', 'https://bank.example.com/a', 'bank') $$,
  'payment_links: A adds an https:// link'
);
select throws_ok(
  $$ insert into public.payment_links (trainer_id, title, url)
     values (tests.u('trainer_b'), 'For B', 'https://x.example.com') $$,
  '42501', null, 'payment_links: A cannot add a link for B'
);
select results_eq(
  $$ update public.payment_links set archived_at = now() where title = 'Bank A' returning archived_at is not null $$,
  $$ values (true) $$,
  'payment_links: A archives own link'
);
select throws_ok(
  $$ delete from public.payment_links where id = tests.i('link_a') $$,
  '42501', null, 'payment_links: delete raises 42501'
);
select set_eq(
  $$ select title from public.payment_links $$,
  array['SBP A', 'Bank A'],
  'payment_links: A still reads own archived link'
);
select tests.authenticate_as('client_c');
select set_eq(
  $$ select title from public.payment_links $$,
  array['SBP A', 'SBP B'],
  'payment_links: C reads the live links of both trainers, not A''s archived one'
);
select is_empty(
  $$ update public.payment_links set url = 'https://evil.example.com' where id = tests.i('link_a') returning 1 $$,
  'payment_links: C cannot update A''s link (0 rows)'
);
select tests.authenticate_as('client_e');
select set_eq(
  $$ select title from public.payment_links $$, array['SBP A'],
  'payment_links: E (ended pair) still reads A''s live links'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select title from public.payment_links $$, array['SBP B'], 'payment_links: B reads 0 of A''s links');
select is_empty(
  $$ update public.payment_links set title = 'B' where id = tests.i('link_a') returning 1 $$,
  'payment_links: B cannot update A''s link (0 rows)'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.payment_links $$, 'payment_links: a stranger reads 0 rows');

-- =========================================================================================================
-- Deleting a trainer whose freezes and notes were written in the same transaction (tests.delete_trainer: the
-- trainer profile first, then the account), as the account deletion job does.

select tests.clear_authentication();
select tests.create_trainer('trainer_t');
select tests.create_user('client_u');
select tests.create_pair('trainer_t', 'client_u');
insert into tests.ids values
  ('pair_tu', tests.pair_id('trainer_t', 'client_u')),
  ('pass_tu', tests.create_pass('trainer_t', 'client_u', 5)),
  ('session_t', tests.create_session('trainer_t', now() - interval '1 day'));
select tests.set_claims('trainer_t');
insert into public.pass_freezes (pass_id, period, reason)
values (tests.i('pass_tu'), daterange(current_date + 3, current_date + 5), 'holiday');
insert into public.coaching_notes (coaching_id, author_id, session_id, body)
values (tests.i('pair_tu'), tests.u('trainer_t'), tests.i('session_t'), 'Knee feels better');
select tests.clear_authentication();
select lives_ok(
  $$ select tests.delete_trainer('trainer_t') $$,
  'account deletion: a trainer with freezes and notes written in this transaction is deleted'
);
select is_empty(
  $$ select 1 from public.passes where id = tests.i('pass_tu')
     union all select 1 from public.pass_freezes where pass_id = tests.i('pass_tu')
     union all select 1 from public.coaching_notes where coaching_id = tests.i('pair_tu')
     union all select 1 from public.coachings where id = tests.i('pair_tu') $$,
  'account deletion: the pair, its pass, freeze and notes are gone'
);

select tests.clear_authentication();
select * from finish();
rollback;

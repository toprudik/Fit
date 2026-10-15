-- Ledger policies of migration 20261015123500_bookings_ledger_policies.sql (contract §1.4 file 19, §6 310_ledger),
-- with the ledger invariants of 20261015120600_bookings_ledger_tables.sql: row checks, uniques, append-only
-- (R28) and the cross-row validation trigger (data-model §3, R84).
begin;
\ir _helpers.psql
select plan(78);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A with a pass; Z wrote a ledger
-- row and later deletes the account.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_user('actor_z');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- One ledger row of a pair, as an RPC would write it. Names are tests.ids keys; occurred_at defaults to the
-- booking's session start (rule 7) or now().
create function tests.ledger(
  p_pair text,
  p_type public.ledger_entry_type,
  p_delta integer,
  p_pass text default null,
  p_booking text default null,
  p_related text default null,
  p_amount bigint default 0,
  p_currency text default null,
  p_reason public.charge_reason default null,
  p_note text default null,
  p_occurred_at timestamptz default null
) returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.ledger_entries (
    coaching_id, entry_type, sessions_delta, pass_id, booking_id, related_entry_id, amount_minor, currency,
    charge_reason, note, occurred_at
  ) values (
    tests.i(p_pair), p_type, p_delta, tests.i(p_pass), tests.i(p_booking), tests.i(p_related), p_amount,
    p_currency::public.currency_code, p_reason, p_note,
    coalesce(p_occurred_at,
             (select s.starts_at from public.bookings b join public.sessions s on s.id = b.session_id
              where b.id = tests.i(p_booking)),
             now())
  )
  returning id into v_id;
  return v_id;
end $$;

insert into tests.ids values
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pass_ac', tests.create_pass('trainer_a', 'client_c', 10, 10000)),
  ('pass_ac2', tests.create_pass('trainer_a', 'client_c', 5, 5000)),
  ('pass_ad', tests.create_pass('trainer_a', 'client_d', 5, 5000)),
  ('pass_bc', tests.create_pass('trainer_b', 'client_c', 5, 5000)),
  ('pass_ae', tests.create_pass('trainer_a', 'client_e', 5, 5000)),
  ('s1', tests.create_session('trainer_a', now() - interval '4 days')),
  ('s2', tests.create_session('trainer_a', now() - interval '3 days')),
  ('s3', tests.create_session('trainer_a', now() - interval '2 days')),
  ('s4', tests.create_session('trainer_a', now() - interval '1 day')),
  ('s_b1', tests.create_session('trainer_b', now() - interval '2 days'));
-- The grant row of each pass: grant_ac, grant_ac2, grant_ad, grant_bc.
insert into tests.ids
select 'grant_' || substr(i.name, 6), e.id
from tests.ids i join public.ledger_entries e on e.pass_id = i.id
where i.name like 'pass%';
insert into tests.ids values
  ('bk1', tests.create_booking(tests.i('s1'), 'trainer_a', 'client_c', 'attended')),
  ('bk2', tests.create_booking(tests.i('s2'), 'trainer_a', 'client_c', 'attended')),
  ('bk3', tests.create_booking(tests.i('s3'), 'trainer_a', 'client_c', 'attended')),
  ('bk4', tests.create_booking(tests.i('s4'), 'trainer_a', 'client_c', 'attended')),
  ('bk_b1', tests.create_booking(tests.i('s_b1'), 'trainer_b', 'client_c', 'attended'));
-- A charge on a pass, a debt charge without a pass, and a charge plus waiver in B's pair.
insert into tests.ids values
  ('charge1', tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk1', p_amount => 1000,
                           p_currency => 'RUB', p_reason => 'attended')),
  ('debt2', tests.ledger('pair_ac', 'charge', -1, p_booking => 'bk2', p_amount => 1000, p_currency => 'RUB',
                         p_reason => 'attended')),
  ('charge_b', tests.ledger('pair_bc', 'charge', -1, p_pass => 'pass_bc', p_booking => 'bk_b1', p_amount => 1000,
                            p_currency => 'RUB', p_reason => 'attended'));
insert into tests.ids values
  ('waiver_b', tests.ledger('pair_bc', 'waiver', 1, p_pass => 'pass_bc', p_related => 'charge_b', p_amount => -1000,
                            p_currency => 'RUB'));

-- Who should read which rows, computed as the owner.
create table tests.expect as
select 'client_c' as who, id from public.ledger_entries where client_id = tests.u('client_c')
union all select 'client_d', id from public.ledger_entries where coaching_id = tests.i('pair_ad')
union all select 'client_e', id from public.ledger_entries where client_id = tests.u('client_e')
union all select 'trainer_a', id from public.ledger_entries where trainer_id = tests.u('trainer_a')
union all select 'trainer_b', id from public.ledger_entries where coaching_id = tests.i('pair_bc');
grant select on tests.expect to authenticated;

-- =========================================================================================================
-- Visibility

select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.ledger_entries $$, $$ select id from tests.expect where who = 'client_c' $$,
  'visibility: C reads the ledger of both own pairs'
);
select tests.authenticate_as('client_d');
select set_eq(
  $$ select id from public.ledger_entries $$, $$ select id from tests.expect where who = 'client_d' $$,
  'visibility: D reads only own pair''s rows'
);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.ledger_entries $$, $$ select id from tests.expect where who = 'trainer_a' $$,
  'visibility: A reads the rows of own pairs (the ended one too), not B-C'
);
select tests.authenticate_as('client_e');
select set_eq(
  $$ select id from public.ledger_entries $$, $$ select id from tests.expect where who = 'client_e' $$,
  'visibility: E keeps reading the ledger after the pair ended (accounting stays, §4.3)'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select id from public.ledger_entries $$, $$ select id from tests.expect where who = 'trainer_b' $$,
  'visibility: B reads 0 of A''s rows'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.ledger_entries $$, 'visibility: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.ledger_entries $$, 'visibility: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.ledger_entries $$, '42501', null, 'visibility: anon has no access');

-- Writes are RPC and trigger only.
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, note, occurred_at)
     values (tests.i('pair_ac'), 'adjustment', tests.i('pass_ac'), 5, 'gift', now()) $$,
  '42501', null, 'writes: the trainer cannot insert'
);
select throws_ok(
  $$ update public.ledger_entries set sessions_delta = 0 where id = tests.i('charge1') $$,
  '42501', null, 'writes: the trainer cannot update'
);
select throws_ok(
  $$ delete from public.ledger_entries where id = tests.i('charge1') $$,
  '42501', null, 'writes: the trainer cannot delete'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.ledger_entries (coaching_id, entry_type, related_entry_id, sessions_delta, occurred_at)
     values (tests.i('pair_ac'), 'waiver', tests.i('debt2'), 1, now()) $$,
  '42501', null, 'writes: the client cannot insert (no self-waiver)'
);
select throws_ok(
  $$ delete from public.ledger_entries where id = tests.i('debt2') $$,
  '42501', null, 'writes: the client cannot delete a debt'
);

-- =========================================================================================================
-- Row checks (as the server): every entry type's shape, the revenue sign and the charge rules.

select tests.clear_authentication();
select throws_ok($$ select tests.ledger('pair_ac', 'grant', 0, p_pass => 'pass_ac') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a grant of 0 sessions fails');
select throws_ok($$ select tests.ledger('pair_ac', 'grant', 3) $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"', 'checks: a grant without a pass fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -2, p_pass => 'pass_ac', p_booking => 'bk3', p_reason => 'attended') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"', 'checks: a charge of 2 sessions fails');
select throws_ok($$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk3') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a charge without a reason fails');
select throws_ok($$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a waiver without its charge fails');
select throws_ok($$ select tests.ledger('pair_ac', 'settlement', -1, p_related => 'debt2') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a settlement without a pass fails');
select throws_ok($$ select tests.ledger('pair_ac', 'settlement_reversal', 1, p_pass => 'pass_ac') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a settlement_reversal without its charge fails');
select throws_ok($$ select tests.ledger('pair_ac', 'refund', 1, p_pass => 'pass_ac') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: a refund that adds sessions fails');
select throws_ok($$ select tests.ledger('pair_ac', 'adjustment', 1, p_note => 'gift') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: an adjustment without a pass fails');
select throws_ok($$ select tests.ledger('pair_ac', 'adjustment', 1, p_pass => 'pass_ac') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: an adjustment without a note fails');
select throws_ok($$ select tests.ledger('pair_ac', 'adjustment', 0, p_pass => 'pass_ac', p_note => 'nothing') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"',
  'checks: an adjustment of 0 sessions fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', 1, p_pass => 'pass_ac', p_booking => 'bk3', p_reason => 'attended') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_type_check"', 'checks: an unknown combination (a charge that adds a session) fails');
-- Revenue sign (R84).
select throws_ok(
  $$ select tests.ledger('pair_ac', 'grant', 1, p_pass => 'pass_ac', p_amount => 100, p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a grant with money fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk3', p_reason => 'attended',
                         p_amount => -100, p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a negative charge fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'charge1', p_amount => 1000, p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a positive waiver fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement', -1, p_pass => 'pass_ac', p_related => 'debt2', p_amount => -1000,
                         p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a negative settlement fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement_reversal', 1, p_pass => 'pass_ac', p_related => 'debt2', p_amount => 1000,
                         p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a positive settlement_reversal fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'refund', -1, p_pass => 'pass_ac', p_amount => 100, p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: a refund with money fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'adjustment', 1, p_pass => 'pass_ac', p_note => 'gift', p_amount => 100, p_currency => 'RUB') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_amount_sign_check"', 'sign: an adjustment with money fails');
-- Charge rules.
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'charge1', p_amount => -1000,
                         p_currency => 'RUB', p_reason => 'attended') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_charge_reason_check"', 'checks: a charge_reason on a waiver fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk3', p_reason => 'attended', p_amount => 1000) $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_currency_check"', 'checks: an amount without a currency fails');
select throws_ok($$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_reason => 'no_show') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_charge_booking_check"',
  'checks: a no_show charge without a booking fails');
select throws_ok($$ select tests.ledger('pair_ac', 'charge', -1, p_reason => 'manual') $$, '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_manual_charge_check"',
  'checks: a manual charge without a note fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_reason => 'manual', p_note => 'debt again', p_booking => 'bk3') $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_manual_charge_check"', 'checks: a manual charge with a booking fails');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'adjustment', 1, p_pass => 'pass_ac', p_note => repeat('x', 501)) $$,
  '23514', 'new row for relation "ledger_entries" violates check constraint "ledger_entries_note_check"', 'checks: a note over 500 characters fails');
select lives_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_reason => 'manual', p_note => 'debt charged again after a waiver',
                         p_amount => 1000, p_currency => 'RUB') $$,
  'checks: a manual debt charge with a note and no booking passes (R84)');
select lives_ok(
  $$ select tests.ledger('pair_ac', 'adjustment', 1, p_pass => 'pass_ac', p_note => 'gift session') $$,
  'checks: an adjustment with a pass and a note passes');

-- =========================================================================================================
-- Uniques: one charge per booking, one waiver, one settlement and one reversal per charge.

select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk1', p_amount => 1000,
                         p_currency => 'RUB', p_reason => 'no_show') $$,
  '23505', null, 'uniques: a second charge for one booking raises 23505');
select lives_ok(
  $$ insert into tests.ids values ('waiver1', tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'charge1',
                                                           p_amount => -1000, p_currency => 'RUB')) $$,
  'uniques: a waiver mirroring its charge passes');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'charge1', p_amount => -1000, p_currency => 'RUB') $$,
  '23505', null, 'uniques: a second waiver of one charge raises 23505 (SCHED-13)');
select lives_ok(
  $$ insert into tests.ids values ('settle2', tests.ledger('pair_ac', 'settlement', -1, p_pass => 'pass_ac', p_related => 'debt2',
                                                           p_amount => 1000, p_currency => 'RUB')) $$,
  'uniques: a settlement of a debt charge from a pass passes');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement', -1, p_pass => 'pass_ac2', p_related => 'debt2', p_amount => 1000, p_currency => 'RUB') $$,
  '23505', null, 'uniques: a second settlement of one charge raises 23505');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement_reversal', 1, p_pass => 'pass_ac', p_related => 'debt2', p_amount => -500,
                         p_currency => 'RUB') $$,
  'P0001', 'ledger_invalid', 'validation: a reversal that does not mirror the settlement raises ledger_invalid');
select lives_ok(
  $$ select tests.ledger('pair_ac', 'settlement_reversal', 1, p_pass => 'pass_ac', p_related => 'debt2', p_amount => -1000,
                         p_currency => 'RUB') $$,
  'uniques: a reversal mirroring the settlement passes');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement_reversal', 1, p_pass => 'pass_ac', p_related => 'debt2', p_amount => -1000,
                         p_currency => 'RUB') $$,
  '23505', null, 'uniques: a second reversal of one charge raises 23505');

-- =========================================================================================================
-- Validation (ledger_entries_validate): rules that span rows.

select throws_ok(
  $$ select tests.ledger('pair_ac', 'adjustment', 1, p_pass => 'pass_ad', p_note => 'wrong pass') $$,
  '23503', null, 'validation: a pass of another pair raises 23503');
select throws_ok(
  $$ select tests.ledger('pair_ad', 'waiver', 1, p_related => 'debt2') $$,
  '23503', null, 'validation: a waiver of another pair''s charge raises 23503');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'grant_ac') $$,
  'P0001', 'ledger_invalid', 'validation: a waiver of a grant raises ledger_invalid');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'settlement', -1, p_pass => 'pass_ac2', p_related => 'charge1', p_amount => 1000,
                         p_currency => 'RUB') $$,
  'P0001', 'ledger_invalid', 'validation: a settlement of a pass-backed charge raises ledger_invalid');
insert into tests.ids values
  ('charge3', tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk3', p_amount => 1000,
                           p_currency => 'RUB', p_reason => 'attended'));
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac', p_related => 'charge3', p_amount => -500, p_currency => 'RUB') $$,
  'P0001', 'ledger_invalid', 'validation: a waiver with the wrong amount raises ledger_invalid');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'waiver', 1, p_pass => 'pass_ac2', p_related => 'charge3', p_amount => -1000, p_currency => 'RUB') $$,
  'P0001', 'ledger_invalid', 'validation: a waiver on another pass than its charge raises ledger_invalid');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk4', p_amount => 1000,
                         p_currency => 'EUR', p_reason => 'attended') $$,
  'P0001', 'ledger_invalid', 'validation: a currency other than the pass currency raises ledger_invalid');
select throws_ok(
  $$ select tests.ledger('pair_ac', 'charge', -1, p_pass => 'pass_ac', p_booking => 'bk4', p_amount => 1000,
                         p_currency => 'RUB', p_reason => 'attended', p_occurred_at => now()) $$,
  'P0001', 'ledger_invalid', 'validation: a charge whose occurred_at differs from the session start raises ledger_invalid');
select throws_ok(
  $$ select tests.ledger('pair_ad', 'refund', -6, p_pass => 'pass_ad') $$,
  'P0001', 'pass_overdrawn', 'validation: overdrawing a pass raises pass_overdrawn');
select lives_ok(
  $$ select tests.ledger('pair_ad', 'refund', -5, p_pass => 'pass_ad') $$,
  'validation: refunding the whole remaining balance passes');
select throws_ok(
  $$ select tests.ledger('pair_ad', 'adjustment', -1, p_pass => 'pass_ad', p_note => 'one more') $$,
  'P0001', 'pass_overdrawn', 'validation: an empty pass cannot go below zero');

-- =========================================================================================================
-- Immutability (R28): no role may change or delete a row; the pair may move and the creator may disappear.

select throws_ok($$ update public.ledger_entries set sessions_delta = -2 where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing sessions_delta raises as postgres');
select throws_ok($$ update public.ledger_entries set amount_minor = 0 where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing amount_minor raises as postgres');
select throws_ok($$ update public.ledger_entries set entry_type = 'grant', charge_reason = null, sessions_delta = 1 where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing entry_type raises as postgres');
select throws_ok($$ update public.ledger_entries set pass_id = tests.i('pass_ac2') where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing pass_id raises as postgres');
select throws_ok($$ update public.ledger_entries set created_by = tests.u('trainer_a') where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: created_by may only be cleared');
select throws_ok($$ delete from public.ledger_entries where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: a direct delete raises as postgres');
select throws_ok($$ truncate public.ledger_entries $$, 'P0001', 'append_only', 'append-only: truncate raises as postgres');
select tests.authenticate_as_service_role();
select throws_ok($$ update public.ledger_entries set sessions_delta = -2 where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing sessions_delta raises as service_role');
select throws_ok($$ update public.ledger_entries set amount_minor = 1 where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing amount_minor raises as service_role');
select throws_ok($$ update public.ledger_entries set pass_id = tests.i('pass_ac2') where id = tests.i('charge1') $$,
  'P0001', 'append_only', 'append-only: changing pass_id raises as service_role');
select throws_ok($$ delete from public.ledger_entries where id = tests.i('debt2') $$,
  'P0001', 'append_only', 'append-only: a direct delete raises as service_role');
select throws_ok($$ truncate public.ledger_entries $$, 'P0001', 'append_only', 'append-only: truncate raises as service_role');

-- created_by: stamped from the signed-in caller (also inside a definer RPC), kept for server jobs, cleared
-- when the author's account goes.
select tests.clear_authentication();
select tests.set_claims('trainer_a');
select results_eq(
  $$ insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, note, occurred_at, created_by)
     values (tests.i('pair_ac'), 'adjustment', tests.i('pass_ac'), 1, 'stamped', now(), tests.u('actor_z'))
     returning created_by $$,
  $$ values (tests.u('trainer_a')) $$,
  'created_by: stamped as the signed-in caller even when another id is sent'
);
select tests.clear_authentication();
with z as (
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, note, occurred_at, created_by)
  values (tests.i('pair_ac'), 'adjustment', tests.i('pass_ac2'), 1, 'by a former assistant', now(), tests.u('actor_z'))
  returning id
)
insert into tests.ids select 'by_z', id from z;
delete from auth.users where id = tests.u('actor_z');
select results_eq(
  $$ select created_by, note from public.ledger_entries where id = tests.i('by_z') $$,
  $$ values (null::uuid, 'by a former assistant') $$,
  'created_by: deleting the creator''s profile clears created_by and keeps the row'
);

-- The pair moves to the stub (account deletion): client_id cascades into the ledger.
select tests.create_deleted_stub();
select lives_ok(
  $$ update public.coachings set client_id = private.deleted_client_id() where id = tests.i('pair_ad') $$,
  'reassignment: moving the pair to the stub passes the append-only trigger'
);
select is_empty(
  $$ select 1 from public.ledger_entries where coaching_id = tests.i('pair_ad') and client_id <> private.deleted_client_id() $$,
  'reassignment: every ledger row of the pair now points to the stub'
);
select tests.authenticate_as('client_d');
select is_empty($$ select id from public.ledger_entries $$, 'reassignment: D no longer reads the moved rows');
select tests.authenticate_as('trainer_a');
select ok(
  exists (select 1 from public.ledger_entries where coaching_id = tests.i('pair_ad')),
  'reassignment: A keeps reading the anonymized pair''s ledger'
);

-- Deleting a pair (trainer account deletion) cascades through passes, bookings and the ledger, waivers included.
select tests.clear_authentication();
delete from public.coachings where id = tests.i('pair_bc');
select is_empty(
  $$ select 1 from public.ledger_entries where coaching_id = tests.i('pair_bc')
     union all select 1 from public.passes where coaching_id = tests.i('pair_bc')
     union all select 1 from public.bookings where coaching_id = tests.i('pair_bc') $$,
  'cascade: deleting the pair removes its ledger rows, passes and bookings'
);

select * from finish();
rollback;

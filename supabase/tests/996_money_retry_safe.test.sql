-- A double tap or a retry after a lost answer does not repeat a money action (migration
-- 20261021084317_money_retry_safe.sql). The same request key sells one pass with one payment; the same start records
-- one past session with one charge.
begin;
\ir _helpers.psql
select plan(21);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_d']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d']) h;

create function tests.sell(p_client text, p_key uuid) returns table (pass_id uuid, settled integer)
language sql security definer set search_path = '' as $$
  select * from public.create_pass(tests.pair_id('trainer_a', p_client), p_title => 'Десять занятий', p_sessions => 10,
    p_price_minor => 1000000, p_currency => 'RUB', p_payment_minor => 1000000, p_payment_method => 'cash',
    p_request_id => p_key)
$$;
create function tests.past(p_client text, p_days int) returns table (session_id uuid, booking_id uuid)
language sql security definer set search_path = '' as $$
  select * from public.record_past_session(tests.pair_id('trainer_a', p_client),
    pg_catalog.date_trunc('hour', pg_catalog.now()) - pg_catalog.make_interval(days => p_days), 60::smallint, 'offline')
$$;
create function tests.count_rows(p_client text, p_what text) returns integer
language sql stable security definer set search_path = '' as $$
  select case p_what
    when 'passes' then (select count(*) from public.passes p where p.coaching_id = tests.pair_id('trainer_a', p_client))
    when 'payments' then (select count(*) from public.payments p where p.coaching_id = tests.pair_id('trainer_a', p_client))
    when 'bookings' then (select count(*) from public.bookings b where b.coaching_id = tests.pair_id('trainer_a', p_client))
    else (select count(*) from public.ledger_entries e
          where e.coaching_id = tests.pair_id('trainer_a', p_client) and e.entry_type::text = p_what)
  end::integer
$$;

-- Past sessions: the same start twice is one session, one booking, one charge.
select tests.authenticate_as('trainer_a');
create temp table first_past as select * from tests.past('client_c', 2);
create temp table second_past as select * from tests.past('client_c', 2);
select tests.clear_authentication();
select is((select session_id from second_past), (select session_id from first_past), 'a repeated past session returns the first one');
select is(tests.count_rows('client_c', 'bookings'), 1, 'one booking for the repeated start');
select is(tests.count_rows('client_c', 'charge'), 1, 'one charge for the repeated start');

select tests.authenticate_as('trainer_a');
select tests.past('client_c', 3);
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
select tests.past('client_c', 1);
select tests.past('client_d', 1);
select tests.clear_authentication();
select is(tests.count_rows('client_c', 'charge'), 3, 'an earlier or a later start is another session and charge');

-- A cancelled session at that start does not block a new one.
update public.sessions s set status = 'cancelled', cancelled_at = now(), completed_at = null from public.bookings b
where b.session_id = s.id and b.coaching_id = tests.pair_id('trainer_a', 'client_d');
select tests.authenticate_as('trainer_a');
select tests.past('client_d', 1);
select tests.clear_authentication();
select is(tests.count_rows('client_d', 'bookings'), 2, 'a cancelled session at that start does not count');

-- Passes: the same key twice is one pass, one grant, one payment, and the debt is settled once.
select tests.authenticate_as('trainer_a');
create temp table first_sale as select * from tests.sell('client_c', 'a0000000-0000-4000-8000-000000000001');
create temp table second_sale as select * from tests.sell('client_c', 'a0000000-0000-4000-8000-000000000001');
select tests.clear_authentication();
select is((select settled from first_sale), 3, 'the first sale settles the three debt sessions');
select is((select pass_id from second_sale), (select pass_id from first_sale), 'a repeated key returns the pass sold with it');
select is((select settled from second_sale), 0, 'the repeat settles nothing');
select is(tests.count_rows('client_c', 'passes'), 1, 'one pass for the repeated key');
select is(tests.count_rows('client_c', 'grant'), 1, 'one grant for the repeated key');
select is(tests.count_rows('client_c', 'payments'), 1, 'one payment for the repeated key');
select is(tests.count_rows('client_c', 'settlement'), 3, 'the debt is settled once');

-- The same key on other terms is refused.
select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Десять занятий',
  p_sessions => 10, p_price_minor => 900000, p_currency => 'RUB', p_payment_minor => 1000000, p_payment_method => 'cash',
  p_request_id => 'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'request_reused', 'the same key with another price is refused');
select throws_ok($$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Десять занятий',
  p_sessions => 10, p_price_minor => 1000000, p_currency => 'RUB',
  p_request_id => 'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'request_reused', 'the same key without the payment is refused');
select throws_ok($$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Восемь занятий',
  p_sessions => 10, p_price_minor => 1000000, p_currency => 'RUB', p_payment_minor => 1000000, p_payment_method => 'cash',
  p_request_id => 'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'request_reused', 'the same key with another title is refused');
select throws_ok($$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Десять занятий',
  p_sessions => 10, p_price_minor => 1000000, p_currency => 'RUB', p_payment_minor => 500000, p_payment_method => 'cash',
  p_request_id => 'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'request_reused', 'the same key with another payment is refused');
select throws_ok($$ select public.create_pass(tests.pair_id('trainer_a', 'client_c'), p_title => 'Десять занятий',
  p_sessions => 10, p_price_minor => 1000000, p_currency => 'RUB', p_payment_minor => 1000000, p_payment_method => 'cash',
  p_starts_on => current_date + 7, p_request_id => 'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'request_reused',
  'the same key with another start day is refused');
select tests.clear_authentication();

-- Another key, no key, or the same key in another pair: a new sale each time.
select tests.authenticate_as('trainer_a');
select tests.sell('client_c', 'a0000000-0000-4000-8000-000000000002');
select tests.sell('client_c', null);
select tests.sell('client_c', null);
select tests.sell('client_d', 'a0000000-0000-4000-8000-000000000001');
select tests.clear_authentication();
select is(tests.count_rows('client_c', 'passes'), 4, 'another key and calls without a key each sell a pass');
select is(tests.count_rows('client_d', 'passes'), 1, 'the key of one pair does not block another pair');
select is(tests.count_rows('client_d', 'settlement'), 2, 'the other pair settles its own debt');

-- A waived debt charge is not settled by a later sale.
select tests.authenticate_as('trainer_a');
select tests.past('client_d', 2);
select public.waive_charge(e.id, 'QA') from public.ledger_entries e
where e.coaching_id = tests.pair_id('trainer_a', 'client_d') and e.entry_type = 'charge';
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
select is((select settled from tests.sell('client_d', null)), 0, 'a waived charge is not settled by a new pass');
select tests.clear_authentication();

select * from finish();
rollback;

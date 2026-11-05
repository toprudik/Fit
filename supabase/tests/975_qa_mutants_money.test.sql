-- Money branches that the pre-beta mutation run (04.11) broke without any test noticing: which debts a new pass
-- settles and in what order, which pass a booking or a charge picks, and a zero payment with a sale.
begin;
\ir _helpers.psql
select plan(12);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) h;

create table tests.ids (name text primary key, id uuid not null);
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
-- A debt of the pair: an attended session charged without a pass, days ago.
create function tests.debt(p_client text, p_days integer) returns uuid language sql set search_path = '' as $$
  select private.post_charge(tests.create_booking(tests.create_session('trainer_a', now() - make_interval(days => p_days)),
                                                  'trainer_a', p_client, 'attended'), 'attended')
$$;
create function tests.settled(p_charge uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.ledger_entries s where s.related_entry_id = p_charge and s.entry_type = 'settlement')
$$;

-- settle_debt: client_c owes two sessions, the new pass has one. The older debt goes first, and only one.
insert into tests.ids values ('c_old', tests.debt('client_c', 5)), ('c_new', tests.debt('client_c', 2));
insert into tests.ids values ('c_pass', tests.create_pass('trainer_a', 'client_c', 1));
select is(private.settle_debt(tests.id('c_pass')), 1, 'a one-session pass settles one debt, not two');
select ok(tests.settled(tests.id('c_old')) and not tests.settled(tests.id('c_new')), 'the oldest debt is settled first');

-- A pass that is not active settles nothing.
insert into tests.ids values ('d_debt', tests.debt('client_d', 3));
insert into tests.ids values ('d_pass', tests.create_pass('trainer_a', 'client_d', 3));
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.id('d_pass');
select is(private.settle_debt(tests.id('d_pass')), 0, 'a cancelled pass settles no debt');
select ok(not tests.settled(tests.id('d_debt')), 'the debt stays open');

-- A session already paid from a pass is no debt: a second pass leaves it alone.
insert into tests.ids values ('e_pass1', tests.create_pass('trainer_a', 'client_e', 1));
update public.passes set starts_on = current_date - 10 where id = tests.id('e_pass1');
insert into tests.ids values ('e_paid', tests.debt('client_e', 2));
insert into tests.ids values ('e_pass2', tests.create_pass('trainer_a', 'client_e', 2));
select is((select pass_id from public.ledger_entries where id = tests.id('e_paid')), tests.id('e_pass1'),
  'the session was charged to the first pass');
select is(private.settle_debt(tests.id('e_pass2')), 0, 'a charge already paid from a pass is not settled again');

-- pick_pass: a pass that starts next week does not pay for a session today.
insert into tests.ids values ('f_later', tests.create_pass('trainer_a', 'client_f', 5));
update public.passes set starts_on = current_date + 7 where id = tests.id('f_later');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_f'), 'personal', now()), null,
  'a pass that has not started yet is not picked');

-- booking_auto_confirm: of two passes the one that ends first holds the booking; a pass that ends exactly when the
-- session starts does not.
insert into tests.ids values
  ('g_long', tests.create_pass('trainer_a', 'client_g', 5, 0, 'RUB', now() + interval '60 days')),
  ('g_short', tests.create_pass('trainer_a', 'client_g', 5, 0, 'RUB', now() + interval '20 days'));
select is((select pass_id from private.booking_auto_confirm(tests.pair_id('trainer_a', 'client_g'), 'personal',
                                                               now() + interval '3 days')),
  tests.id('g_short'), 'the pass that ends first holds the booking');
select is((select pass_id from private.booking_auto_confirm(tests.pair_id('trainer_a', 'client_g'), 'personal',
                                                               (select expires_at from public.passes where id = tests.id('g_short')))),
  tests.id('g_long'), 'a pass ending exactly at the start of the session does not cover it');

-- create_pass: a payment of zero is not a payment.
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select * from public.create_pass(%L, p_title => 'Пакет', p_sessions => 5, p_price_minor => 500000,
                                                            p_currency => 'RUB', p_payment_minor => 0, p_payment_method => 'cash') $$,
                        tests.pair_id('trainer_a', 'client_g')),
  '22023', 'payment_invalid', 'a sale with a payment of zero is refused');
select lives_ok(format($$ select * from public.create_pass(%L, p_title => 'Пакет', p_sessions => 5, p_price_minor => 500000,
                                                           p_currency => 'RUB', p_payment_minor => 1, p_payment_method => 'cash') $$,
                       tests.pair_id('trainer_a', 'client_g')),
  'a payment of one kopeck is taken');
select tests.clear_authentication();
select is((select count(*)::int from public.payments where coaching_id = tests.pair_id('trainer_a', 'client_g')), 1,
  'only the valid sale recorded a payment');

select * from finish();
rollback;

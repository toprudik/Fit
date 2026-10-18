-- Debt bookings by the client (migration 20261018200317_debt_booking_limit.sql, docs/decisions.md Q22). Without the
-- trainer's permission a client holds one unpaid session at a time, as a request; with it the client books without
-- confirmation up to the trainer's number. Unpaid sessions are charged debt plus live bookings no pass covers. The
-- limit holds for slots, group sessions, moves and waitlist offers; the trainer books in debt with no limit.
-- Slots freed inside a transaction reach the queue at commit (deferred triggers), so the test fires them with
-- "set constraints all immediate".
begin;
\ir _helpers.psql
select plan(24);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_d', 'client_e', 'client_k', 'client_p', 'client_t',
  'client_w', 'client_f', 'client_g', 'client_h', 'client_i', 'client_x']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d', 'client_e', 'client_k', 'client_p',
  'client_t', 'client_w', 'client_f', 'client_g', 'client_h', 'client_i', 'client_x']) h;
select tests.create_pass('trainer_a', 'client_x', 10);

create function tests.slot(p_days int) returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.starts_at = date_trunc('hour', now()) + pg_catalog.make_interval(days => p_days)
$$;
grant execute on function tests.slot(int) to authenticated;
insert into public.slots (trainer_id, starts_at, ends_at)
select tests.user_id('trainer_a'), date_trunc('hour', now()) + make_interval(days => d),
       date_trunc('hour', now()) + make_interval(days => d, hours => 1)
from generate_series(8, 30) d;
create function tests.entry(p_client text) returns public.waitlist_entries language sql stable security definer
set search_path = '' as $$
  select w.* from public.waitlist_entries w where w.client_id = tests.user_id(p_client) order by w.joined_at desc limit 1
$$;
grant execute on function tests.entry(text) to authenticated;
create function tests.unpaid_bookings(p_client text) returns integer language sql stable security definer
set search_path = '' as $$
  select count(*)::integer from public.bookings b
  where b.client_id = tests.user_id(p_client) and b.status in ('requested', 'confirmed') and b.reserved_pass_id is null
$$;

select is((select debt_limit_sessions from public.coachings where id = tests.pair_id('trainer_a', 'client_c')), 1::smallint,
  'a new pair allows one unpaid session when the trainer gives the permission');

-- =========================================================================================================
-- Without the permission: one debt booking at a time, as a request

select tests.create_session('trainer_a', now() + interval '12 days 3 hours', 'group', 5) as group5 \gset
update public.sessions set open_for_booking = true where id = :'group5';
select tests.authenticate_as('client_c');
select b.booking_id as booking_c, b.status::text as status_c from public.book_slot(tests.slot(8)) b \gset
select is(:'status_c'::text, 'requested', 'no permission: a session without a pass comes to the trainer as a request');
select throws_ok(format($$ select * from public.book_slot(%L) $$, tests.slot(9)), 'P0001', 'debt_limit',
  'no permission: a second slot in debt is refused');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'group5'), 'P0001', 'debt_limit',
  'no permission: a group session in debt is refused too');
select tests.clear_authentication();
select is((select count(*)::integer from public.bookings where session_id = :'group5'), 0,
  'no permission: the refused group booking takes no seat');
select tests.authenticate_as('trainer_a');
select public.decide_booking(:'booking_c', true);
select tests.authenticate_as('client_c');
select throws_ok(format($$ select * from public.book_slot(%L) $$, tests.slot(9)), 'P0001', 'debt_limit',
  'no permission: a confirmed debt session still counts');
select is((select status::text from public.reschedule_my_booking(:'booking_c', tests.slot(10))), 'requested',
  'no permission: the debt session can be moved, and the move comes as a request');
select tests.clear_authentication();

-- =========================================================================================================
-- With the permission: no confirmation, up to the trainer's number

update public.coachings set self_book_on_debt = true, debt_limit_sessions = 2 where id = tests.pair_id('trainer_a', 'client_d');
select tests.authenticate_as('client_d');
select is((select status::text from public.book_slot(tests.slot(11))), 'confirmed', 'permission: the first debt session is confirmed');
select is((select status::text from public.book_slot(tests.slot(12))), 'confirmed', 'permission: so is the second of 2');
select throws_ok(format($$ select * from public.book_slot(%L) $$, tests.slot(13)), 'P0001', 'debt_limit',
  'permission: the third is refused');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'group5'), 'P0001', 'debt_limit',
  'permission: group sessions count toward the same number');
select tests.clear_authentication();

-- =========================================================================================================
-- A charged debt session counts; the trainer books in debt with no limit

select tests.create_session('trainer_a', now() - interval '2 days') as past_e \gset
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_e'), 'charge', -1,
        tests.create_booking(:'past_e', 'trainer_a', 'client_e', 'attended'), 'attended', now() - interval '2 days');
select tests.authenticate_as('client_e');
select throws_ok(format($$ select * from public.book_slot(%L) $$, tests.slot(14)), 'P0001', 'debt_limit',
  'charged debt: the client cannot book in debt on their own');
select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select * from public.create_session(%L, %L, 60::smallint, 'offline') $$,
  tests.pair_id('trainer_a', 'client_e'), now() + interval '15 days 2 hours'), 'trainer: schedules a session in debt');
select lives_ok(format($$ select * from public.create_session(%L, %L, 60::smallint, 'offline') $$,
  tests.pair_id('trainer_a', 'client_e'), now() + interval '16 days 2 hours'), 'trainer: and another one');
select tests.clear_authentication();
select is(tests.unpaid_bookings('client_e'), 2, 'trainer: both are booked in debt');

-- A charged session counts once: with 2 allowed and one charged, the client books one more.
update public.coachings set self_book_on_debt = true, debt_limit_sessions = 2 where id = tests.pair_id('trainer_a', 'client_k');
select tests.create_session('trainer_a', now() - interval '3 days') as past_k \gset
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_k'), 'charge', -1,
        tests.create_booking(:'past_k', 'trainer_a', 'client_k', 'attended'), 'attended', now() - interval '3 days');
select tests.authenticate_as('client_k');
select is((select status::text from public.book_slot(tests.slot(15))), 'confirmed', 'a charged session is not counted twice');
select tests.clear_authentication();

-- =========================================================================================================
-- What does not count, and what does

select tests.create_pass('trainer_a', 'client_p', 1);
select tests.authenticate_as('client_p');
select b.status::text as status_p from public.book_slot(tests.slot(16)) b \gset
select is((select status::text from public.book_slot(tests.slot(17))), 'requested',
  'a session covered by a pass leaves room for one debt request');
select tests.clear_authentication();

select tests.create_session('trainer_a', now() + interval '3 days') as trial_session \gset
select tests.create_booking(:'trial_session', 'trainer_a', 'client_t', 'confirmed') as trial_booking \gset
update public.bookings set source = 'trial' where id = :'trial_booking';
select tests.authenticate_as('client_t');
select is((select status::text from public.book_slot(tests.slot(18))), 'requested',
  'a confirmed trial leaves room for one debt request');
select tests.clear_authentication();

select tests.create_session('trainer_a', now() + interval '15 minutes') as soon \gset
select tests.create_booking(:'soon', 'trainer_a', 'client_w', 'attended');
select tests.authenticate_as('client_w');
select throws_ok(format($$ select * from public.book_slot(%L) $$, tests.slot(19)), 'P0001', 'debt_limit',
  'a check-in not charged yet still counts');
select tests.clear_authentication();

-- =========================================================================================================
-- Waitlist offers: past the limit the offer goes to the next in line

select tests.create_session('trainer_a', now() + interval '20 days 5 hours', 'group', 1) as group1 \gset
update public.sessions set open_for_booking = true where id = :'group1';
select tests.authenticate_as('client_x');
select b.booking_id as booking_x from public.book_group_session(:'group1') b \gset
select tests.authenticate_as('client_f');
select b.status from public.book_slot(tests.slot(21)) b;
select place from public.join_waitlist(:'group1');
select tests.authenticate_as('client_g');
select place from public.join_waitlist(:'group1');
select tests.authenticate_as('client_x');
select public.cancel_my_booking(:'booking_x', 'Не смогу', false);
set constraints all immediate;
set constraints all deferred;
select tests.authenticate_as('client_f');
select is((select status::text from public.accept_waitlist_offer((tests.entry('client_f')).id)), 'declined',
  'group offer: past the limit the client cannot take the seat');
select tests.clear_authentication();
select is(row((tests.entry('client_f')).status, (tests.entry('client_g')).status)::text,
  row('declined'::public.waitlist_status, 'offered'::public.waitlist_status)::text,
  'group offer: it goes to the next in line');

select tests.authenticate_as('client_x');
select b.booking_id as booking_x2 from public.book_slot(tests.slot(25)) b \gset
select tests.authenticate_as('client_h');
select b.status from public.book_slot(tests.slot(26)) b;
select place from public.join_slot_waitlist(tests.slot(25));
select tests.authenticate_as('client_i');
select place from public.join_slot_waitlist(tests.slot(25));
select tests.authenticate_as('client_x');
select public.cancel_my_booking(:'booking_x2', 'Не смогу', false);
set constraints all immediate;
set constraints all deferred;
select tests.authenticate_as('client_h');
select is((select status::text from public.accept_waitlist_offer((tests.entry('client_h')).id)), 'declined',
  'slot offer: past the limit the client cannot take the slot');
select tests.clear_authentication();
select is(row((tests.entry('client_h')).status, (tests.entry('client_i')).status)::text,
  row('declined'::public.waitlist_status, 'offered'::public.waitlist_status)::text,
  'slot offer: it goes to the next in line');
select is((select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
           where s.slot_id = tests.slot(25) and b.client_id = tests.user_id('client_h')), 0,
  'slot offer: the refused client gets no booking');

select * from finish();
rollback;

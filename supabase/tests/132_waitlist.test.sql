-- Waitlist of migration 20261017003700_waitlist.sql (PRD wave-2 §9, 9.1–9.6): joining a full group, places,
-- the offer to the first in line when a seat frees, an offer holding its seat, accept with and without a pass,
-- decline and expiry passing it on, no offers in the last 30 minutes, the queue closing, the trainer's offer.
-- Seats freed inside a transaction reach the queue at commit (deferred triggers), so the test fires them with
-- "set constraints all immediate".
begin;
\ir _helpers.psql
select plan(39);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_a', 'client_f');
select tests.create_pair('trainer_a', 'client_g');
select tests.pair_id('trainer_a', 'client_g') as pair_g \gset
select tests.create_pass('trainer_a', 'client_e', 5);

-- The outbox, readable from any role in the test.
create function tests.outbox() returns setof public.notification_outbox language sql stable security definer
set search_path = '' as $$ select * from public.notification_outbox $$;
grant execute on function tests.outbox() to authenticated;
create function tests.entry(p_client text, p_session uuid) returns public.waitlist_entries language sql stable
security definer set search_path = '' as $$
  select w.* from public.waitlist_entries w where w.client_id = tests.user_id(p_client) and w.session_id = p_session
  order by w.joined_at desc limit 1
$$;
grant execute on function tests.entry(text, uuid) to authenticated;

select tests.authenticate_as('trainer_a');
select session_id as yoga from public.create_group_session(now() + interval '8 days', 60::smallint, 2::smallint, 'Йога', 'online') \gset

-- =========================================================================================================
-- Joining (9.1)

select tests.authenticate_as('client_c');
select lives_ok(format($$ select * from public.book_group_session(%L) $$, :'yoga'), 'setup: client c books');
select tests.authenticate_as('client_e');
select throws_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'P0001', 'seats_available',
  'join: not while a seat is free');
select tests.authenticate_as('client_d');
select b.booking_id as booking_d from public.book_group_session(:'yoga') b \gset

select tests.authenticate_as('client_e');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'yoga'), 'P0001', 'session_full',
  'book: a full group says session_full');
select throws_ok(format($$ select * from public.group_booking_preview(%L) $$, :'yoga'), 'P0001', 'session_full',
  'preview: a full group says session_full');
select is((select place from public.join_waitlist(:'yoga')), 1, 'join: the first in the queue has place 1');
select throws_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'P0001', 'already_waiting', 'join: not twice');
select tests.authenticate_as('client_f');
select is((select place from public.join_waitlist(:'yoga')), 2, 'join: the next has place 2');
select is(
  (select row(g.taken, g.my_waitlist_status, g.my_waitlist_place)::text
   from public.bookable_group_sessions(tests.user_id('trainer_a'), now(), now() + interval '14 days') g where g.session_id = :'yoga'),
  row(2, 'waiting'::public.waitlist_status, 2)::text, 'list: the client sees the group full and their place');
select tests.authenticate_as('client_c');
select throws_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'P0001', 'already_booked',
  'join: not for someone already booked');
select is((select count(*)::int from public.waitlist_entries), 0, 'rls: a client sees nobody else''s place in the queue');
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.waitlist_entries where session_id = :'yoga'), 2, 'rls: the trainer sees the queue');
select throws_ok($$ insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id) select session_id, coaching_id, client_id, trainer_id from public.waitlist_entries limit 1 $$,
  '42501', null, 'rls: nobody writes the queue directly');

-- =========================================================================================================
-- A freed seat goes to the first in line, and the offer holds it (9.2, 9.5)

select tests.authenticate_as('trainer_a');
select public.decide_booking(:'booking_d', false, 'Не получится');
set constraints all immediate;
set constraints all deferred;
select tests.clear_authentication();
select is((select status from tests.entry('client_e', :'yoga')), 'offered'::public.waitlist_status,
  'offer: the first in line gets the freed seat');
select is((select status from tests.entry('client_f', :'yoga')), 'waiting'::public.waitlist_status, 'offer: only the first one');
select ok(
  (select offer_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes' from tests.entry('client_e', :'yoga')),
  'offer: 30 minutes to answer when the session is more than 3 hours away');
select is(
  (select count(*)::int from tests.outbox() o where o.type = 'waitlist_offer' and o.user_id = tests.user_id('client_e')),
  1, 'offer: the client gets the offer by bot');
select ok(
  (select o.deliver_after <= now() from tests.outbox() o where o.type = 'waitlist_offer' and o.user_id = tests.user_id('client_e')),
  'offer: it does not wait for quiet hours');
select tests.authenticate_as('client_g');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'yoga'), 'P0001', 'session_full',
  'offer: the offered seat is not free for anyone else (9.5)');
select throws_ok(format($$ select * from public.accept_waitlist_offer(%L) $$, (tests.entry('client_f', :'yoga')).id), 'P0001',
  'waitlist_not_found', 'accept: not someone else''s entry');

-- =========================================================================================================
-- Accepting (9.3, 9.4)

select tests.authenticate_as('client_e');
select (tests.entry('client_e', :'yoga')).id as entry_e \gset
select is(
  (select row(v.status, v.confirmed, v.sessions_left, v.inside_deadline)::text from public.waitlist_entry_view(:'entry_e') v),
  row('offered'::public.waitlist_status, true, 4, false)::text,
  'view: the offer says the pass pays and a cancel is still free');
select is((select status from public.accept_waitlist_offer(:'entry_e')), 'confirmed'::public.booking_status,
  'accept: with a pass the booking is confirmed');
select is(
  (select row(b.source, w.status)::text from public.bookings b join public.waitlist_entries w on w.booking_id = b.id where w.id = :'entry_e'),
  row('waitlist'::public.booking_source, 'accepted'::public.waitlist_status)::text, 'accept: a waitlist booking, the entry is accepted');
select throws_ok(format($$ select * from public.accept_waitlist_offer(%L) $$, :'entry_e'), 'P0001', 'waitlist_not_found',
  'accept: not twice');

-- Client c's request ends, f gets the seat, and f has no pass: a request
select tests.clear_authentication();
update public.sessions set starts_at = now() + interval '2 hours', ends_at = now() + interval '3 hours' where id = :'yoga';
select b.id as booking_c from public.bookings b where b.session_id = :'yoga' and b.client_id = tests.user_id('client_c') \gset
select tests.authenticate_as('client_c');
select public.withdraw_booking_request(:'booking_c');
set constraints all immediate;
set constraints all deferred;
select tests.clear_authentication();
select ok(
  (select offer_expires_at between now() + interval '9 minutes' and now() + interval '11 minutes' from tests.entry('client_f', :'yoga')),
  'offer: 10 minutes when the session is less than 3 hours away');
select tests.authenticate_as('client_f');
select (tests.entry('client_f', :'yoga')).id as entry_f \gset
select is(
  (select row(v.confirmed, v.inside_deadline)::text from public.waitlist_entry_view(:'entry_f') v),
  row(false, true)::text, 'view: without a pass it will be a request, and a cancel would be charged (9.4)');
select is((select status from public.accept_waitlist_offer(:'entry_f')), 'requested'::public.booking_status,
  'accept: without a pass it is a request to the trainer');

-- =========================================================================================================
-- Decline and expiry pass the seat on

select tests.clear_authentication();
update public.sessions set starts_at = now() + interval '8 days', ends_at = now() + interval '8 days 1 hour', capacity = 3
where id = :'yoga';
select tests.authenticate_as('client_g');
select throws_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'P0001', 'seats_available',
  'more seats: the new seat is free to book');
select tests.authenticate_as('client_c');
select lives_ok(format($$ select * from public.book_group_session(%L) $$, :'yoga'), 'setup: client c takes the new seat');
select tests.authenticate_as('client_g');
select lives_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'setup: client g waits');
select tests.authenticate_as('client_d');
select lives_ok(format($$ select * from public.join_waitlist(%L) $$, :'yoga'), 'setup: client d waits after g');
select tests.clear_authentication();
select b.id as booking_c2 from public.bookings b where b.session_id = :'yoga' and b.client_id = tests.user_id('client_c') and b.status = 'requested' \gset
select tests.authenticate_as('client_c');
select public.withdraw_booking_request(:'booking_c2');
set constraints all immediate;
set constraints all deferred;
select tests.authenticate_as('client_g');
select public.leave_waitlist((tests.entry('client_g', :'yoga')).id);
select tests.clear_authentication();
select is(
  (select row((tests.entry('client_g', :'yoga')).status, (tests.entry('client_d', :'yoga')).status)::text),
  row('declined'::public.waitlist_status, 'offered'::public.waitlist_status)::text, 'decline: the offer goes to the next one');
update public.waitlist_entries set offer_expires_at = now() - interval '1 minute' where id = (tests.entry('client_d', :'yoga')).id;
select private.process_waitlists();
select is((tests.entry('client_d', :'yoga')).status, 'expired'::public.waitlist_status, 'expiry: an unanswered offer runs out');

-- =========================================================================================================
-- The trainer's offer, the last 30 minutes, the queue closing (9.6, rule 7, 8)

select tests.authenticate_as('trainer_a');
select session_id as late from public.create_group_session(now() + interval '20 minutes', 60::smallint, 2::smallint, 'Поздняя', 'online') \gset
select session_id as cancelled from public.create_group_session(now() + interval '9 days', 60::smallint, 2::smallint, 'Отменится', 'online') \gset
select tests.clear_authentication();
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id, joined_at)
select s, :'pair_g', tests.user_id('client_g'), tests.user_id('trainer_a'), now() - interval '1 hour'
from unnest(array[:'late', :'cancelled']::uuid[]) s;
select is(private.waitlist_offer_next(:'late'), 0, 'last 30 minutes: no new offers (9.6)');
select is(private.waitlist_offer_next(:'cancelled'), 1, 'offer: the job offers a seat that is free');
update public.waitlist_entries set status = 'waiting', offered_at = null, offer_expires_at = null
where session_id = :'cancelled';
select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.trainer_offer_waitlist(%L) $$, (tests.entry('client_g', :'cancelled')).id),
  'trainer: offers a seat out of turn');
select lives_ok(format($$ select public.cancel_session(%L, 'Зал закрыт') $$, :'cancelled'), 'setup: the trainer cancels a session');
set constraints all immediate;
set constraints all deferred;
select tests.clear_authentication();
select is((tests.entry('client_g', :'cancelled')).status, 'closed'::public.waitlist_status, 'close: a cancelled session closes its queue');
update public.sessions set starts_at = now() - interval '1 minute', ends_at = now() + interval '59 minutes' where id = :'late';
select private.process_waitlists();
select is((tests.entry('client_g', :'late')).status, 'closed'::public.waitlist_status, 'close: the queue closes when the session starts');
select is(
  (select count(*)::int from tests.outbox() o where o.type = 'waitlist_closed' and o.user_id = tests.user_id('client_g')),
  2, 'close: one "no seat" message per closed entry');

select * from finish();
rollback;

-- Waitlist for booked personal slots of migration 20261017181547_slot_waitlist.sql (PRD wave-2 §9): joining a
-- booked slot, the offer to the first in line when the slot opens again, an offer holding the slot, accept with
-- and without a pass, decline and expiry passing it on, the offer deadline, the queue closing, the trainer's offer.
-- Slots freed inside a transaction reach the queue at commit (deferred triggers), so the test fires them with
-- "set constraints all immediate".
begin;
\ir _helpers.psql
select plan(29);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_a', 'client_f');
select tests.create_pair('trainer_b', 'client_x');
select tests.create_pass('trainer_a', 'client_d', 5);

create function tests.outbox() returns setof public.notification_outbox language sql stable security definer
set search_path = '' as $$ select * from public.notification_outbox $$;
grant execute on function tests.outbox() to authenticated;
create function tests.entry(p_client text, p_slot uuid) returns public.waitlist_entries language sql stable
security definer set search_path = '' as $$
  select w.* from public.waitlist_entries w where w.client_id = tests.user_id(p_client) and w.slot_id = p_slot
  order by w.joined_at desc limit 1
$$;
grant execute on function tests.entry(text, uuid) to authenticated;
create function tests.slot_status(p_slot uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.status::text from public.slots s where s.id = p_slot), 'gone')
$$;
grant execute on function tests.slot_status(uuid) to authenticated;

insert into public.slots (trainer_id, starts_at, ends_at) values
  (tests.user_id('trainer_a'), now() + interval '8 days', now() + interval '8 days 1 hour'),
  (tests.user_id('trainer_a'), now() + interval '9 days', now() + interval '9 days 1 hour'),
  (tests.user_id('trainer_a'), now() + interval '10 days', now() + interval '10 days 1 hour');
select s.id as slot1 from public.slots s where s.starts_at = now() + interval '8 days' \gset
select s.id as slot2 from public.slots s where s.starts_at = now() + interval '9 days' \gset
select s.id as slot3 from public.slots s where s.starts_at = now() + interval '10 days' \gset

-- =========================================================================================================
-- Joining

select tests.authenticate_as('client_d');
select throws_ok(format($$ select * from public.join_slot_waitlist(%L) $$, :'slot1'), 'P0001', 'seats_available',
  'join: not while the slot is free');
select tests.authenticate_as('client_c');
select b.booking_id as booking_c from public.book_slot(:'slot1') b \gset
select throws_ok(format($$ select * from public.join_slot_waitlist(%L) $$, :'slot1'), 'P0001', 'already_booked',
  'join: not for the one who booked it');
select tests.authenticate_as('client_x');
select throws_ok(format($$ select * from public.join_slot_waitlist(%L) $$, :'slot1'), 'P0001', 'slot_unavailable',
  'join: not for a client of another trainer');
select is((select count(*)::int from public.waitlist_slots(tests.user_id('trainer_a'), now(), now() + interval '30 days')), 0,
  'list: a client of another trainer sees nothing');

select tests.authenticate_as('client_d');
select is(
  (select row(w.waiting, w.my_entry_id is null)::text
   from public.waitlist_slots(tests.user_id('trainer_a'), now(), now() + interval '30 days') w where w.slot_id = :'slot1'),
  row(0, true)::text, 'list: the booked slot is offered for the queue');
select is((select place from public.join_slot_waitlist(:'slot1')), 1, 'join: the first in the queue has place 1');
select throws_ok(format($$ select * from public.join_slot_waitlist(%L) $$, :'slot1'), 'P0001', 'already_waiting', 'join: not twice');
select tests.authenticate_as('client_e');
select is((select place from public.join_slot_waitlist(:'slot1')), 2, 'join: the next has place 2');
select is((select count(*)::int from public.waitlist_entries), 1, 'rls: a client sees only their own entry');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.waitlist_slots(tests.user_id('trainer_a'), now(), now() + interval '30 days')), 0,
  'list: the client who booked it does not see it');
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.waitlist_entries where slot_id = :'slot1'), 2, 'rls: the trainer sees the queue');

-- =========================================================================================================
-- The slot opens again: an offer to the first in line, and the offer holds the slot

select tests.authenticate_as('trainer_a');
select public.decide_booking(:'booking_c', false, 'Не получится');
set constraints all immediate;
set constraints all deferred;
select tests.clear_authentication();
select is(tests.slot_status(:'slot1'), 'open', 'reopen: the declined request frees the slot');
select is((select status from tests.entry('client_d', :'slot1')), 'offered'::public.waitlist_status,
  'offer: the first in line gets the slot');
select is((select status from tests.entry('client_e', :'slot1')), 'waiting'::public.waitlist_status, 'offer: only the first one');
select ok(
  (select offer_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes' from tests.entry('client_d', :'slot1')),
  'offer: 30 minutes to answer');
select is(
  (select (o.payload ->> 'slot_id')::uuid from tests.outbox() o where o.type = 'waitlist_offer' and o.user_id = tests.user_id('client_d')),
  :'slot1'::uuid, 'offer: the client gets the offer by bot, naming the slot');
select tests.authenticate_as('client_f');
select throws_ok(format($$ select * from public.book_slot(%L) $$, :'slot1'), 'P0001', 'slot_unavailable',
  'offer: the held slot is not free for anyone else');
select is((select place from public.join_slot_waitlist(:'slot1')), 2, 'join: a held slot can be queued for');

-- =========================================================================================================
-- Accepting

select tests.authenticate_as('client_d');
select (tests.entry('client_d', :'slot1')).id as entry_d \gset
select is(
  (select row(v.status, v.confirmed, v.sessions_left, v.starts_at = now() + interval '8 days')::text
   from public.waitlist_entry_view(:'entry_d') v),
  row('offered'::public.waitlist_status, true, 4, true)::text, 'view: the slot, and the pass pays for it');
select is((select status from public.accept_waitlist_offer(:'entry_d')), 'confirmed'::public.booking_status,
  'accept: with a pass the booking is confirmed');
select is(
  (select row(b.source, w.status, tests.slot_status(:'slot1'))::text
   from public.bookings b join public.waitlist_entries w on w.booking_id = b.id where w.id = :'entry_d'),
  row('waitlist'::public.booking_source, 'accepted'::public.waitlist_status, 'booked')::text,
  'accept: a waitlist booking, the entry is accepted, the slot is booked');

-- =========================================================================================================
-- Decline and expiry pass it on

select tests.authenticate_as('client_c');
select b.booking_id as booking_c2 from public.book_slot(:'slot2') b \gset
select tests.authenticate_as('client_d');
select (j.entry_id) as entry_d2 from public.join_slot_waitlist(:'slot2') j \gset
select tests.authenticate_as('client_e');
select (j.entry_id) as entry_e2 from public.join_slot_waitlist(:'slot2') j \gset
select tests.authenticate_as('client_f');
select (j.entry_id) as entry_f2 from public.join_slot_waitlist(:'slot2') j \gset
select tests.authenticate_as('client_c');
select public.withdraw_booking_request(:'booking_c2');
set constraints all immediate;
set constraints all deferred;
select tests.authenticate_as('client_d');
select public.leave_waitlist(:'entry_d2');
select tests.clear_authentication();
select is(
  (select array_agg(w.status order by w.joined_at)::text from public.waitlist_entries w where w.slot_id = :'slot2'),
  '{declined,offered,waiting}', 'decline: the slot goes to the next in line');

update public.waitlist_entries set offer_expires_at = now() - interval '1 second' where id = :'entry_e2';
select is(private.process_slot_waitlists(), 1, 'expiry: the job passes the slot on');
select is(
  (select array_agg(w.status order by w.joined_at)::text from public.waitlist_entries w where w.slot_id = :'slot2'),
  '{declined,expired,offered}', 'expiry: the offer that ran out is expired, the last one gets it');
select tests.authenticate_as('client_f');
select is((select status from public.accept_waitlist_offer(:'entry_f2')), 'requested'::public.booking_status,
  'accept: without a pass it is a request');

-- =========================================================================================================
-- The offer deadline and the queue closing

select tests.clear_authentication();
update public.slots set status = 'booked', starts_at = now() + interval '1 hour', ends_at = now() + interval '2 hours'
where id = :'slot3';
select tests.authenticate_as('client_e');
select throws_ok(format($$ select * from public.join_slot_waitlist(%L) $$, :'slot3'), 'P0001', 'slot_unavailable',
  'join: not once the slot is inside the booking notice');
select tests.clear_authentication();
update public.slots set starts_at = now() + interval '10 days', ends_at = now() + interval '10 days 1 hour' where id = :'slot3';
select tests.authenticate_as('client_e');
select (j.entry_id) as entry_e3 from public.join_slot_waitlist(:'slot3') j \gset

-- The trainer offers out of turn only once the slot is free
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.trainer_offer_waitlist(%L) $$, :'entry_e3'), 'P0001', 'session_full',
  'trainer: a booked slot cannot be offered');
select tests.clear_authentication();
alter table public.slots disable trigger slots_offer_reopened;
update public.slots set status = 'open' where id = :'slot3';
alter table public.slots enable trigger slots_offer_reopened;
select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.trainer_offer_waitlist(%L) $$, :'entry_e3'), 'trainer: offers a free slot to the queue');

select tests.clear_authentication();
delete from public.slots where id = :'slot3';
select is(
  (select count(*)::int from public.notification_outbox o
   where o.type = 'waitlist_closed' and o.payload ->> 'entry_id' = :'entry_e3' and o.user_id = tests.user_id('client_e')),
  1, 'close: a removed slot closes its queue with one message');

select * from finish();
rollback;

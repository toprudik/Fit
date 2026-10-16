-- Group sessions of migration 20261016235700_group_sessions.sql (PRD wave-1 §2.6.3, §2.6.4-1, SCHED-15, SCHED-16):
-- create_group_session, add_group_participant, bookable_group_sessions, book_group_session, the last seat,
-- a declined request keeping the session, and cancelling a group without a charge.
begin;
\ir _helpers.psql
select plan(43);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_b', 'client_f');
select tests.create_pair('trainer_a', 'client_g');
select tests.pair_id('trainer_a', 'client_c') as pair_c, tests.pair_id('trainer_a', 'client_d') as pair_d,
       tests.pair_id('trainer_a', 'client_e') as pair_e, tests.pair_id('trainer_b', 'client_f') as pair_f \gset
select tests.create_pass('trainer_a', 'client_c', 5);

-- The day of the given ISO weekday 7 to 13 days ahead in Moscow, at the given wall time.
create function tests.next_at(p_isodow int, p_time time) returns timestamptz language sql stable set search_path = '' as $$
  select (d::date + p_time) at time zone 'Europe/Moscow' from pg_catalog.generate_series(
    (now() at time zone 'Europe/Moscow')::date + 7, (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d
  where extract(isodow from d) = p_isodow
$$;
-- The outbox, readable from any role in the test.
create function tests.outbox() returns setof public.notification_outbox language sql stable security definer
set search_path = '' as $$ select * from public.notification_outbox $$;
grant execute on function tests.outbox() to authenticated;
select tests.next_at(2, '19:00') as tue19, tests.next_at(4, '19:00') as thu19 \gset

-- =========================================================================================================
-- create_group_session (PRD 2.6.3)

select tests.authenticate_as('client_c');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 3::smallint, 'Йога', 'online') $$, :'tue19'),
  '42501', 'not_a_trainer', 'create: only a trainer');

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 3::smallint, '  ', 'online') $$, :'tue19'),
  '22023', 'invalid_title', 'create: a group needs a title');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 1::smallint, 'Йога', 'online') $$, :'tue19'),
  '22023', 'invalid_capacity', 'create: at least two seats');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 101::smallint, 'Йога', 'online') $$, :'tue19'),
  '22023', 'invalid_capacity', 'create: at most a hundred seats');
select throws_ok($$ select * from public.create_group_session(now() - interval '1 hour', 60::smallint, 3::smallint, 'Йога', 'online') $$,
  '22023', 'in_past', 'create: not in the past');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 3::smallint, 'Йога', 'online', null, 'ftp://x') $$, :'tue19'),
  '22023', 'invalid_link', 'create: an online link is https');

select session_id as group1 from public.create_group_session(:'tue19', 60::smallint, 3::smallint, ' Йога ', 'online', null,
  'https://meet.example/g') \gset
select is(
  (select row(s.kind, s.title, s.capacity, s.open_for_booking, s.recurrence_id is null, s.ends_at - s.starts_at)::text
   from public.sessions s where s.id = :'group1'),
  row('group'::public.session_kind, 'Йога'::text, 3::smallint, true, true, interval '60 minutes')::text,
  'create: one group session with its title, seats and self-booking');
select is((select count(*)::int from public.bookings where session_id = :'group1'), 0, 'create: it starts empty');

select * from public.create_group_session(:'thu19', 90::smallint, 10::smallint, 'Круговая', 'offline',
  p_open_for_booking => false, p_weekdays => '{4}', p_count => 4::smallint) \gset rep_
select is(:rep_created, 4, 'create: a weekly repeat makes its sessions');
select is(
  (select row(r.kind, r.coaching_id is null, r.capacity, r.title, r.open_for_booking)::text
   from public.recurrences r join public.sessions s on s.recurrence_id = r.id where s.id = :'rep_session_id'),
  row('group'::public.session_kind, true, 10::smallint, 'Круговая'::text, false)::text,
  'create: the repeat is a group rule without a pair');
select is(
  (select count(distinct s.capacity)::int + count(*)::int from public.sessions s
   where s.recurrence_id = (select recurrence_id from public.sessions where id = :'rep_session_id') and s.kind = 'group'),
  5, 'create: every occurrence is a group session with the same seats');
select throws_ok(format($$ select * from public.create_group_session(%L, 60::smallint, 3::smallint, 'Йога', 'online', p_weekdays => '{1}', p_count => 3::smallint) $$, :'tue19'),
  '22023', 'invalid_repeat', 'create: the first day is one of the repeat''s weekdays');

-- roll_recurrences keeps a group repeat going
select * from public.create_group_session(:'tue19', 60::smallint, 4::smallint, 'Растяжка', 'offline', p_weekdays => '{2}',
  p_until => ((:'tue19'::timestamptz at time zone 'Europe/Moscow')::date + 300)) \gset roll_
select tests.clear_authentication();
select r.id as roll_rule from public.recurrences r join public.sessions s on s.recurrence_id = r.id where s.id = :'roll_session_id' \gset
delete from public.sessions where recurrence_id = :'roll_rule' and starts_at > now() + interval '30 days';
update public.recurrences set materialized_until = (now() at time zone 'Europe/Moscow')::date + 30 where id = :'roll_rule';
select ok(private.roll_recurrences() > 0, 'roll: the daily job extends a group repeat');
select is(
  (select bool_and(s.kind = 'group' and s.title = 'Растяжка') from public.sessions s where s.recurrence_id = :'roll_rule'),
  true, 'roll: the new occurrences are group sessions');

-- =========================================================================================================
-- add_group_participant: the trainer books a client, confirmed at once, К1 (Q20)

select tests.authenticate_as('trainer_a');

select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.add_group_participant(%L, %L) $$, :'group1', :'pair_d'), 'add: the trainer adds a client');
select is(
  (select row(b.status, b.source)::text from public.bookings b where b.session_id = :'group1' and b.coaching_id = :'pair_d'),
  row('confirmed'::public.booking_status, 'trainer'::public.booking_source)::text,
  'add: the client is confirmed at once');
select is(
  (select count(*)::int from tests.outbox() o
   where o.type = 'booking_assigned' and o.user_id = tests.user_id('client_d') and o.session_id = :'group1'),
  1, 'add: the client gets К1');
select throws_ok(format($$ select public.add_group_participant(%L, %L) $$, :'group1', :'pair_d'), 'P0001', 'already_booked',
  'add: not twice');
select throws_ok(format($$ select public.add_group_participant(%L, %L) $$, :'group1', :'pair_f'), '42501', 'not_your_client',
  'add: not another trainer''s client');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select public.add_group_participant(%L, %L) $$, :'group1', :'pair_f'), 'P0001', 'session_not_found',
  'add: not on another trainer''s session');

-- =========================================================================================================
-- The client side (PRD 2.6.4-1)

select tests.authenticate_as('client_c');
select is(
  (select row(g.title, g.capacity, g.taken, g.my_booking_id is null)::text
   from public.bookable_group_sessions(tests.user_id('trainer_a'), now(), now() + interval '14 days') g where g.session_id = :'group1'),
  row('Йога'::text, 3::smallint, 1, true)::text,
  'list: a client sees the open group with its seats taken');
select is(
  (select count(*)::int from public.bookable_group_sessions(tests.user_id('trainer_a'), now(), now() + interval '14 days') g
   where g.session_id = :'rep_session_id'),
  0, 'list: a group closed to self-booking is not listed');
select tests.authenticate_as('client_f');
select is(
  (select count(*)::int from public.bookable_group_sessions(tests.user_id('trainer_a'), now(), now() + interval '14 days')),
  0, 'list: nothing of a trainer who is not yours');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'group1'), 'P0001', 'slot_unavailable',
  'book: not a group of a trainer who is not yours');

select tests.authenticate_as('client_c');
select is(
  (select row(p.confirmed, p.sessions_left)::text from public.group_booking_preview(:'group1') p),
  row(true, 4)::text, 'preview: a pass confirms it, one session less');
select is(
  (select row(b.status)::text from public.book_group_session(:'group1') b),
  row('confirmed'::public.booking_status)::text, 'book: a client with a pass is confirmed');
select is(
  (select count(*)::int from tests.outbox() o
   where o.type = 'booking_created' and o.user_id = tests.user_id('trainer_a') and o.payload ->> 'title' = 'Йога'),
  1, 'book: the trainer gets Т1 with the group''s title');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'group1'), 'P0001', 'already_booked',
  'book: not twice');
select isnt(
  (select g.my_booking_id from public.bookable_group_sessions(tests.user_id('trainer_a'), now(), now() + interval '14 days') g
   where g.session_id = :'group1'),
  null, 'list: the client''s own booking is shown');

select tests.authenticate_as('client_e');
select is((select p.confirmed from public.group_booking_preview(:'group1') p), false, 'preview: without a pass it is a request');
select b.booking_id as req_e from public.book_group_session(:'group1') b \gset
select is((select status from public.bookings where id = :'req_e'), 'requested'::public.booking_status,
  'book: without a pass or debt it is a request that holds a seat');

-- SCHED-15: the last seat
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.add_group_participant(%L, %L) $$, :'group1', :'pair_c'), 'P0001', 'already_booked',
  'add: a client already on it is not added again');
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ update public.sessions set capacity = 2 where id = %L $$, :'group1'), 'P0001', 'capacity_below_occupied',
  'capacity: not below the seats taken');
select tests.authenticate_as('client_g');
select throws_ok(format($$ select * from public.book_group_session(%L) $$, :'group1'), 'P0001', 'session_full',
  'book: no seat left, session_full (SCHED-15)');

-- A declined request frees the seat and keeps the session
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(:'req_e', false, 'Мест нет'), 'declined'::public.booking_status, 'decline: the trainer declines');
select is((select status from public.sessions where id = :'group1'), 'scheduled'::public.session_status,
  'decline: the group session stays');
select tests.authenticate_as('client_g');
select lives_ok(format($$ select * from public.book_group_session(%L) $$, :'group1'), 'book: the freed seat can be taken');

-- The trainer raises the seats
select tests.authenticate_as('trainer_a');
select lives_ok(format($$ update public.sessions set capacity = 5 where id = %L $$, :'group1'), 'capacity: the trainer adds seats');
select public.update_session(:'group1', :'tue19'::timestamptz + interval '1 hour', 60::smallint, 'online', null,
  'https://meet.example/g');
select is((select title from public.sessions where id = :'group1'), 'Йога', 'move: a group keeps its title when moved without one');

-- =========================================================================================================
-- SCHED-16: cancelling a group cancels every participant without a charge, one message each

select lives_ok(format($$ select public.cancel_session(%L, 'Зал закрыт') $$, :'group1'), 'cancel: the trainer cancels the group');
select is(
  (select count(*)::int from public.bookings b where b.session_id = :'group1' and b.status = 'cancelled' and b.cancelled_by_role = 'trainer'),
  3, 'cancel: every live participant is cancelled by the trainer');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.ledger_entries l join public.bookings b on b.id = l.booking_id where b.session_id = :'group1'),
  0, 'cancel: nobody is charged');
select is(
  (select count(distinct o.user_id)::int from tests.outbox() o
   where o.type = 'booking_cancelled_by_trainer' and o.session_id = :'group1'),
  3, 'cancel: each participant gets one message');

select * from finish();
rollback;

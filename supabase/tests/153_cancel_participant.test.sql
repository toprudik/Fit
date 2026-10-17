-- One participant off a group session, migration 20261018012317_cancel_participant.sql (PRD 2.6.3-4, 2.6.5): the
-- trainer cancels one booking with a reason, nothing is charged, the client is told, the group keeps going and the
-- seat goes to the waitlist.
begin;
\ir _helpers.psql
select plan(12);

select tests.create_trainer('trainer_a');
select tests.create_trainer('stranger_t');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_w');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_w');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('group', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '1 day', 'group', 2, true));
insert into tests.ids values ('past', tests.create_session('trainer_a', date_trunc('hour', now()) - interval '1 day', 'group', 4));
insert into tests.ids values ('personal', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days'));
insert into tests.ids values ('b_c', tests.create_booking(tests.id('group'), 'trainer_a', 'client_c'));
insert into tests.ids values ('b_d', tests.create_booking(tests.id('group'), 'trainer_a', 'client_d'));
insert into tests.ids values ('b_past', tests.create_booking(tests.id('past'), 'trainer_a', 'client_c'));
insert into tests.ids values ('b_personal', tests.create_booking(tests.id('personal'), 'trainer_a', 'client_d'));
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id)
values (tests.id('group'), tests.pair_id('trainer_a', 'client_w'), tests.user_id('client_w'), tests.user_id('trainer_a'));

-- Gates -------------------------------------------------------------------------------------------------------

select tests.authenticate_as('stranger_t');
select throws_ok(format($$ select public.cancel_participant(%L, 'Травма') $$, tests.id('b_c')),
  'P0002', 'booking_not_found', 'another trainer cannot take someone off the group');
select tests.authenticate_as('client_c');
select throws_ok(format($$ select public.cancel_participant(%L, 'Травма') $$, tests.id('b_c')),
  'P0002', 'booking_not_found', 'nor can the client, who cancels their own booking another way');

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.cancel_participant(%L, '  ') $$, tests.id('b_c')),
  '22023', 'reason_required', 'a reason is required');
select throws_ok(format($$ select public.cancel_participant(%L, 'Травма') $$, tests.id('b_past')),
  'P0002', 'booking_not_found', 'a session that started is not changed');
select throws_ok(format($$ select public.cancel_participant(%L, 'Травма') $$, tests.id('b_personal')),
  'P0002', 'booking_not_found', 'a personal session is cancelled as a whole');

-- One booking off --------------------------------------------------------------------------------------------

select lives_ok(format($$ select public.cancel_participant(%L, 'Травма колена') $$, tests.id('b_c')),
  'the trainer takes one participant off the group');
set constraints all immediate;
select tests.clear_authentication();
select results_eq(
  format($$ select status::text, cancelled_by_role::text, cancel_reason from public.bookings where id = %L $$, tests.id('b_c')),
  $$ values ('cancelled', 'trainer', 'Травма колена') $$,
  'the booking is cancelled by the trainer with the reason');
select is((select status::text from public.bookings where id = tests.id('b_d')), 'confirmed', 'the others keep their seats');
select is((select status::text from public.sessions where id = tests.id('group')), 'scheduled', 'the session goes on');
select is((select count(*)::int from public.ledger_entries where booking_id = tests.id('b_c')), 0, 'nothing is charged');
select results_eq(
  $$ select user_id, payload->>'reason', (payload->>'booking_only')::boolean from public.notification_outbox
     where type = 'booking_cancelled_by_trainer' $$,
  format($$ values (%L::uuid, 'Травма колена', true) $$, tests.user_id('client_c')),
  'only that client is told, about their booking');
select is((select status::text from public.waitlist_entries where client_id = tests.user_id('client_w')), 'offered',
  'the freed seat goes to the waitlist');

select * from finish();
rollback;

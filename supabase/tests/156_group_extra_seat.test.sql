-- Out of turn into a full group, migration 20261018053317_group_extra_seat.sql (PRD wave-2 §9-7): the trainer
-- adds a client to a full group session, it grows by one seat, and the client's queue entry is accepted.
begin;
\ir _helpers.psql
select plan(8);

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
insert into tests.ids values ('group', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '1 day', 'group', 2));
insert into tests.ids values ('free', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days', 'group', 3));
select tests.create_booking(tests.id('group'), 'trainer_a', 'client_c');
select tests.create_booking(tests.id('group'), 'trainer_a', 'client_d');
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id)
values (tests.id('group'), tests.pair_id('trainer_a', 'client_w'), tests.user_id('client_w'), tests.user_id('trainer_a'));
insert into tests.ids values ('w', tests.pair_id('trainer_a', 'client_w')), ('c', tests.pair_id('trainer_a', 'client_c'));

select tests.authenticate_as('stranger_t');
select throws_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('group'), tests.id('w')),
  'P0001', 'session_not_found', 'another trainer cannot add to the group');

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.add_group_participant(%L, %L) $$, tests.id('group'), tests.id('w')),
  'P0001', 'session_full', 'the plain add stops at a full group');
select throws_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('group'), tests.id('c')),
  'P0001', 'already_booked', 'a client already in the group is not added twice');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('group'), tests.id('w')),
  'the trainer adds the waiting client out of turn');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('free'), tests.id('c')),
  'a group with free seats takes the client as usual');
select tests.clear_authentication();

select is((select capacity::int from public.sessions where id = tests.id('group')), 3, 'the full group got one more seat');
select is((select capacity::int from public.sessions where id = tests.id('free')), 3, 'the group with seats kept its size');
select results_eq(
  $$ select w.status::text, b.status::text from public.waitlist_entries w join public.bookings b on b.id = w.booking_id $$,
  $$ values ('accepted', 'confirmed') $$,
  'the queue entry is accepted with the confirmed booking');

select * from finish();
rollback;

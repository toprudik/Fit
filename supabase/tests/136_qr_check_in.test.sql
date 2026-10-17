-- QR check-in of migration 20261017032700_qr_check_in.sql (PRD wave-3 §5): the trainer's rotating code, the
-- client's check-in with its charge, the window, a second scan, a stale code and a request "на месте".
begin;
\ir _helpers.psql
select plan(19);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_user('client_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
-- The code of a window relative to now: 0 is the current one, -1 the previous one.
create function tests.code(p_session uuid, p_offset integer default 0) returns text language sql stable
security definer set search_path = '' as $$
  select private.check_in_code(p_session, private.check_in_window(now()) + p_offset)
$$;
grant execute on function tests.code(uuid, integer) to authenticated;

insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 3, 900000));
insert into tests.ids values ('group', tests.create_session('trainer_a', now() + interval '10 minutes', 'group', 3, true));
insert into tests.ids values ('later', tests.create_session('trainer_a', now() + interval '2 hours', 'group', 3, true));
insert into tests.ids values ('past', tests.create_session('trainer_a', now() - interval '2 hours', 'group', 3, true));
insert into tests.ids values ('b_c', tests.create_booking(tests.id('group'), 'trainer_a', 'client_c'));
insert into tests.ids values ('b_c_later', tests.create_booking(tests.id('later'), 'trainer_a', 'client_c'));

-- The trainer's QR
select tests.authenticate_as('trainer_a');
select ok(
  (select code = tests.code(tests.id('group')) and checked_in = '[]'::jsonb and refresh_at > now()
   from public.session_check_in_qr(tests.id('group'))),
  'qr: the trainer gets the current code, nobody checked in yet');
select is((select code from public.session_check_in_qr(tests.id('later'))), null,
  'qr: no code before check-in opens');
select throws_ok(format($$ select * from public.session_check_in_qr(%L) $$, tests.id('past')),
  'P0001', 'check_in_closed', 'qr: no code after the window');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select * from public.session_check_in_qr(%L) $$, tests.id('group')),
  'P0001', 'session_not_found', 'qr: another trainer gets nothing');

-- The client's check-in
select tests.authenticate_as('client_c');
select is((select outcome from public.check_in_by_qr(tests.id('group'), 'AAAAAAAAAA')), 'expired',
  'check-in: a wrong code does not work');
select is((select outcome from public.check_in_by_qr(tests.id('group'), tests.code(tests.id('group'), -2))), 'expired',
  'check-in: a code older than 30 seconds does not work (5.3)');
select is((select outcome from public.check_in_by_qr(tests.id('group'), tests.code(tests.id('group'), -1))), 'checked_in',
  'check-in: the code of the previous window still works');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = tests.id('b_c')), 'attended',
  'check-in: the booking is attended');
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_c') and entry_type = 'charge'),
  1::bigint, 'check-in: the session is charged like the trainer''s mark');
select is((select method::text from public.check_ins where booking_id = tests.id('b_c')), 'qr',
  'check-in: the check-in is recorded');

select tests.authenticate_as('client_c');
select is((select outcome from public.check_in_by_qr(tests.id('group'), tests.code(tests.id('group')))), 'already',
  'check-in: a second scan changes nothing (5.4)');
select tests.clear_authentication();
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_c') and entry_type = 'charge'),
  1::bigint, 'check-in: a second scan does not charge again');

select tests.authenticate_as('client_c');
select results_eq(
  format($$ select outcome, opens_at from public.check_in_by_qr(%L, %L) $$, tests.id('later'), tests.code(tests.id('later'))),
  format($$ select 'too_early'::text, starts_at - interval '30 minutes' from public.sessions where id = %L $$, tests.id('later')),
  'check-in: two hours early it says when it opens (5.2)');
select is((select outcome from public.check_in_by_qr(tests.id('past'), tests.code(tests.id('past')))), 'closed',
  'check-in: after the window it is closed');

-- Without a booking
select tests.authenticate_as('client_e');
select is((select outcome from public.check_in_by_qr(tests.id('group'), tests.code(tests.id('group')))), 'requested',
  'on site: a client of the trainer without a booking asks for a free seat (5.5)');
select tests.clear_authentication();
select ok(
  (select b.status = 'requested' and e.payload = '{"on_site": true}'::jsonb
   from public.bookings b join public.booking_events e on e.booking_id = b.id
   where b.session_id = tests.id('group') and b.client_id = tests.user_id('client_e')),
  'on site: the request is marked "на месте"');
select tests.authenticate_as('client_x');
select is((select outcome from public.check_in_by_qr(tests.id('group'), tests.code(tests.id('group')))), 'no_booking',
  'on site: someone who is not the trainer''s client gets "Нет записи"');

-- Who sees it
select tests.authenticate_as('trainer_a');
select is(
  (select checked_in -> 0 ->> 'first_name' from public.session_check_in_qr(tests.id('group'))),
  (select first_name from public.profiles where id = tests.user_id('client_c')),
  'qr: the trainer sees who checked in (5.1)');
select tests.authenticate_as('client_e');
select is((select count(*) from public.check_ins), 0::bigint, 'rls: another client does not see the check-in');

select * from finish();
rollback;

-- The printed check-in QR of a location, migration 20261017034731_location_check_in.sql (PRD wave-3 §5 rule 2b):
-- the trainer's token, the check-in to the nearest booking there, a renewed token and the session QR still working.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create table tests.tokens (name text primary key, token text not null);
grant select, insert, update on tests.tokens to authenticated;
create function tests.token(p_name text) returns text language sql stable set search_path = '' as $$
  select token from tests.tokens where name = p_name
$$;
create function tests.code(p_session uuid) returns text language sql stable security definer set search_path = '' as $$
  select private.check_in_code(p_session, private.check_in_window(now()))
$$;
grant execute on function tests.code(uuid) to authenticated;

insert into tests.ids values ('gym', gen_random_uuid()), ('park', gen_random_uuid());
insert into public.locations (id, trainer_id, name) values
  (tests.id('gym'), tests.user_id('trainer_a'), 'Зал'), (tests.id('park'), tests.user_id('trainer_a'), 'Парк');
insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 5, 900000));
insert into tests.ids values ('now', tests.create_session('trainer_a', now() + interval '10 minutes', 'group', 5, true));
insert into tests.ids values ('later', tests.create_session('trainer_a', now() + interval '1 day', 'group', 5, true));
insert into tests.ids values ('elsewhere', tests.create_session('trainer_a', now() + interval '5 minutes', 'group', 5, true));
update public.sessions set location_id = tests.id('gym') where id in (tests.id('now'), tests.id('later'));
update public.sessions set location_id = tests.id('park') where id = tests.id('elsewhere');
insert into tests.ids values ('b_now', tests.create_booking(tests.id('now'), 'trainer_a', 'client_c'));
insert into tests.ids values ('b_later', tests.create_booking(tests.id('later'), 'trainer_a', 'client_c'));
insert into tests.ids values ('b_e_later', tests.create_booking(tests.id('later'), 'trainer_a', 'client_e'));
insert into tests.ids values ('b_e_park', tests.create_booking(tests.id('elsewhere'), 'trainer_a', 'client_e'));

-- The trainer's token
select tests.authenticate_as('trainer_a');
insert into tests.tokens values ('gym', public.location_check_in_token(tests.id('gym')));
select ok(tests.token('gym') ~ '^[A-Za-z0-9_-]{22}$', 'token: the trainer gets a token for the printed QR');
select is(public.location_check_in_token(tests.id('gym')), tests.token('gym'), 'token: the same token next time');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select public.location_check_in_token(%L) $$, tests.id('gym')),
  'P0001', 'location_not_found', 'token: another trainer gets nothing');
select tests.authenticate_as('client_c');
select throws_ok('select * from public.location_check_in_tokens', '42501', null, 'token: a client cannot read tokens');

-- The client's check-in
select results_eq(
  format($$ select outcome, booking_id from public.check_in_by_location(%L) $$, tests.token('gym')),
  format($$ values ('checked_in'::text, %L::uuid) $$, tests.id('b_now')),
  'check-in: the booking at this location with an open window is checked in');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = tests.id('b_now')), 'attended', 'check-in: attended');
select is((select status::text from public.bookings where id = tests.id('b_later')), 'confirmed',
  'check-in: tomorrow''s booking there stays as it is');
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_now') and entry_type = 'charge'),
  1::bigint, 'check-in: charged once');
select tests.authenticate_as('client_c');
select is((select outcome from public.check_in_by_location(tests.token('gym'))), 'already',
  'check-in: a second scan changes nothing');

select tests.authenticate_as('client_e');
select results_eq(
  format($$ select outcome, opens_at from public.check_in_by_location(%L) $$, tests.token('gym')),
  format($$ select 'too_early'::text, starts_at - interval '30 minutes' from public.sessions where id = %L $$, tests.id('later')),
  'check-in: only a later booking there says when check-in opens; one at another location is not touched');
select is((select outcome from public.check_in_by_location('AAAAAAAAAAAAAAAAAAAAAA')), 'expired',
  'check-in: an unknown token does not work');

-- A renewed token
select tests.authenticate_as('trainer_a');
insert into tests.tokens select 'old', token from tests.tokens where name = 'gym';
update tests.tokens set token = public.location_check_in_token(tests.id('gym'), true) where name = 'gym';
select tests.authenticate_as('client_c');
select ok(
  tests.token('gym') <> tests.token('old')
  and (select outcome from public.check_in_by_location(tests.token('old'))) = 'expired'
  and (select outcome from public.check_in_by_location(tests.token('gym'))) = 'already',
  'renew: the old print stops working, the new one works');

-- The session QR goes through the same step
select tests.clear_authentication();
update public.bookings set status = 'confirmed', attendance_marked_at = null where id = tests.id('b_e_park');
select tests.authenticate_as('client_e');
select is((select outcome from public.check_in_by_qr(tests.id('elsewhere'), tests.code(tests.id('elsewhere')))), 'checked_in',
  'session qr: still checks in');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = tests.id('b_e_park')), 'attended', 'session qr: attended');

select * from finish();
rollback;

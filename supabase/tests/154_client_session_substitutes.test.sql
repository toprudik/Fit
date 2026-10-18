-- Who runs a session for the client, migration 20261018052847_client_session_substitutes.sql (PRD wave-3 §1):
-- the client of a booked session sees its substitute's name, nobody else does.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('owner_a', 'client_c');
select tests.create_pair('owner_a', 'client_d');
update public.profiles set first_name = 'Пётр', last_name = 'Тестов' where id = tests.user_id('sub_s');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('covered', tests.create_session('owner_a', date_trunc('hour', now()) + interval '1 day', 'group', 4));
insert into tests.ids values ('own', tests.create_session('owner_a', date_trunc('hour', now()) + interval '2 days', 'group', 4));
select tests.create_booking(tests.id('covered'), 'owner_a', 'client_c');
select tests.create_booking(tests.id('own'), 'owner_a', 'client_c');
update public.sessions set conducted_by = tests.user_id('sub_s') where id = tests.id('covered');

select tests.authenticate_as('client_c');
select results_eq(
  format($$ select session_id, name from public.my_session_substitutes(array[%L, %L]::uuid[]) $$, tests.id('covered'), tests.id('own')),
  format($$ values (%L::uuid, 'Пётр Тестов') $$, tests.id('covered')),
  'the client sees who runs the covered session, and nothing for the one their trainer runs');

select tests.authenticate_as('client_d');
select is((select count(*)::int from public.my_session_substitutes(array[tests.id('covered')])), 0,
  'a client without a booking of the session sees nothing');

select tests.authenticate_as('client_c');
select is((select count(*)::int from public.my_session_substitutes('{}')), 0, 'no sessions, no rows');

select tests.clear_authentication();
set role anon;
select throws_ok($$ select * from public.my_session_substitutes('{}') $$, '42501', null, 'anon cannot call it');
reset role;

select function_privs_are('public', 'my_session_substitutes', array['uuid[]'], 'authenticated', array['EXECUTE'],
  'authenticated can call it');

select * from finish();
rollback;

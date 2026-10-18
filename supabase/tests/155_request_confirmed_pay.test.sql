-- How a confirmed request is paid, migration 20261018002317_request_confirmed_pay.sql (PRD wave-1 §3 К2):
-- the booking_confirmed message says pass, single session or debt.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_user('client_p');
select tests.create_user('client_s');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_p');
select tests.create_pair('trainer_a', 'client_s');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pass('trainer_a', 'client_p', 5);
select tests.create_pass('trainer_a', 'client_s', 1);

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.pay(p_booking text) returns text language sql stable set search_path = '' as $$
  select pg_catalog.concat_ws(' / ', o.payload->>'pay', o.payload->>'pass_title') from public.notification_outbox o
  where o.type = 'booking_confirmed' and o.booking_id = tests.id(p_booking)
$$;
insert into tests.ids select 'b_' || c, tests.create_booking(
  tests.create_session('trainer_a', date_trunc('hour', now()) + n * interval '1 day'), 'trainer_a', 'client_' || c, 'requested', 'client_slot')
from (values ('p', 1), ('s', 2), ('d', 3)) v(c, n);

select tests.authenticate_as('trainer_a');
select public.decide_booking(tests.id('b_' || c), true) from (values ('p'), ('s'), ('d')) v(c);
select tests.clear_authentication();

select is(tests.pay('b_p'), 'pass / 5 sessions', 'a pass pays: the message names it');
select is(tests.pay('b_s'), 'single / 1 sessions', 'a one-session pass is a single session');
select is(tests.pay('b_d'), 'debt', 'without a pass the session goes on debt');
select is((select reserved_pass_id from public.bookings where id = tests.id('b_d')), null::uuid, 'and nothing is reserved');

select * from finish();
rollback;

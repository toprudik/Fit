-- The daily digest names the client of a personal session whatever the booking's live status
-- (20261024025317_digest_client_name.sql): it used to read «клиент без имени» once the client had checked in
-- or while the booking still waited for an answer.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
update public.user_settings set time_zone = 'Europe/Moscow' where user_id = tests.user_id('trainer_a');
update public.coaching_trainer_meta set client_alias = 'Катя' where coaching_id = tests.pair_id('trainer_a', 'client_c');
update public.coaching_trainer_meta set client_alias = 'Дима' where coaching_id = tests.pair_id('trainer_a', 'client_d');
update public.coaching_trainer_meta set client_alias = 'Ева' where coaching_id = tests.pair_id('trainer_a', 'client_e');

create table tests.ids (name text primary key, id uuid not null);
create function tests.at(p_time text) returns timestamptz language sql stable set search_path = '' as $$
  select (((pg_catalog.now() at time zone 'Europe/Moscow')::date + 1) + p_time::time) at time zone 'Europe/Moscow'
$$;
insert into tests.ids values
  ('s_attended', tests.create_session('trainer_a', tests.at('08:45'))),
  ('s_requested', tests.create_session('trainer_a', tests.at('10:00'))),
  ('s_confirmed', tests.create_session('trainer_a', tests.at('12:00')));
select tests.create_booking((select id from tests.ids where name = 's_attended'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking((select id from tests.ids where name = 's_requested'), 'trainer_a', 'client_d', 'requested', 'client_slot');
select tests.create_booking((select id from tests.ids where name = 's_confirmed'), 'trainer_a', 'client_e');

create table tests.digest as
select e ->> 'name' as name, (e ->> 'starts_at')::timestamptz as starts_at
from pg_catalog.jsonb_array_elements(
  private.daily_digest_payload(tests.user_id('trainer_a'), (pg_catalog.now() at time zone 'Europe/Moscow')::date + 1)
    -> 'sessions') e;

select is((select name from tests.digest where starts_at = tests.at('08:45')), 'Катя', 'a client who already checked in is named');
select is((select name from tests.digest where starts_at = tests.at('10:00')), 'Дима', 'a booking waiting for an answer is named');
select is((select name from tests.digest where starts_at = tests.at('12:00')), 'Ева', 'a confirmed booking is named');

select * from finish();
rollback;

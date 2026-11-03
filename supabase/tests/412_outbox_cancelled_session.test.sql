-- «Новое занятие» and «Занятие перенесено» held back by quiet hours go out only while the client still has a live
-- booking on that session (20261103083213_outbox_skip_cancelled_session.sql, QA 30): the trainer cancelled a session
-- at 23:10 that they had made at 23:00, and the client got «Новое занятие» at 08:00.
begin;
\ir _helpers.psql
select plan(2);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('s_live', tests.create_session('trainer_a', now() + interval '1 day')),
  ('s_cancelled', tests.create_session('trainer_a', now() + interval '2 days'));
insert into tests.ids values
  ('b_live', tests.create_booking(tests.i('s_live'), 'trainer_a', 'client_c')),
  ('b_cancelled', tests.create_booking(tests.i('s_cancelled'), 'trainer_a', 'client_c'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'trainer',
    cancel_reason = 'Тренер отменил'
where id = tests.i('b_cancelled');

select private.enqueue_notification('booking_assigned', 'k:assigned:live', '{}', tests.user_id('client_c'),
  p_session_id => tests.i('s_live'));
select private.enqueue_notification('booking_assigned', 'k:assigned:cancelled', '{}', tests.user_id('client_c'),
  p_session_id => tests.i('s_cancelled'));
select private.enqueue_notification('session_changed', 'k:changed:live', '{}', tests.user_id('client_c'),
  p_session_id => tests.i('s_live'));
select private.enqueue_notification('session_changed', 'k:changed:cancelled', '{}', tests.user_id('client_c'),
  p_session_id => tests.i('s_cancelled'));

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:assigned:live', 'k:changed:live'],
  'claim: messages about a session the client is still booked on go out');
select is(
  array(select o.dedupe_key || '=' || o.last_error from public.notification_outbox o where o.status = 'skipped' and o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:assigned:cancelled=booking_outdated', 'k:changed:cancelled=booking_outdated'],
  'claim: messages about a session the client is no longer booked on are skipped');

select * from finish();
rollback;

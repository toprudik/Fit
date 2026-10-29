-- Messages held back by quiet hours go out only while still true (20261029195517_outbox_skip_outdated.sql):
-- «Новая запись» for a booking cancelled since, a request already answered, and «Подмену … пока никто не принял»
-- once the session has begun or the substitute was accepted are skipped at claim.
begin;
\ir _helpers.psql
select plan(2);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('s1', tests.create_session('trainer_a', now() + interval '1 day')),
  ('s2', tests.create_session('trainer_a', now() + interval '2 days')),
  ('s3', tests.create_session('trainer_a', now() + interval '3 days')),
  ('s4', tests.create_session('trainer_a', now() + interval '4 days')),
  ('s_started', tests.create_session('trainer_a', now() - interval '1 day')),
  ('s_later', tests.create_session('trainer_a', now() + interval '5 hours'));
insert into tests.ids values
  ('b_cancelled', tests.create_booking(tests.i('s1'), 'trainer_a', 'client_c')),
  ('b_live', tests.create_booking(tests.i('s2'), 'trainer_a', 'client_c')),
  ('b_answered', tests.create_booking(tests.i('s3'), 'trainer_a', 'client_c', 'requested', 'client_slot')),
  ('b_waiting', tests.create_booking(tests.i('s4'), 'trainer_a', 'client_c', 'requested', 'client_slot'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client' where id = tests.i('b_cancelled');
update public.bookings set status = 'confirmed', confirmed_at = now() where id = tests.i('b_answered');

with x as (insert into public.delegations (owner_trainer_id, kind, session_id, scopes)
  values (tests.user_id('trainer_a'), 'substitute', tests.i('s_started'), '{schedule}') returning id)
insert into tests.ids select 'd_started', id from x;
with x as (insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, status, accepted_at)
  values (tests.user_id('trainer_a'), tests.user_id('trainer_b'), 'substitute', tests.i('s_later'), '{schedule}', 'active', now()) returning id)
insert into tests.ids select 'd_accepted', id from x;
with x as (insert into public.delegations (owner_trainer_id, kind, session_id, scopes)
  values (tests.user_id('trainer_a'), 'substitute', tests.i('s_later'), '{schedule}') returning id)
insert into tests.ids select 'd_pending', id from x;

select private.enqueue_notification('booking_created', 'k:cancelled', '{}', tests.user_id('trainer_a'), p_booking_id => tests.i('b_cancelled'));
select private.enqueue_notification('booking_created', 'k:live', '{}', tests.user_id('trainer_a'), p_booking_id => tests.i('b_live'));
select private.enqueue_notification('booking_requested', 'k:answered', '{}', tests.user_id('trainer_a'), p_booking_id => tests.i('b_answered'));
select private.enqueue_notification('booking_requested', 'k:waiting', '{}', tests.user_id('trainer_a'), p_booking_id => tests.i('b_waiting'));
select private.enqueue_notification('delegation', 'k:d:started',
  pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', tests.i('d_started')), tests.user_id('trainer_a'));
select private.enqueue_notification('delegation', 'k:d:accepted',
  pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', tests.i('d_accepted')), tests.user_id('trainer_a'));
select private.enqueue_notification('delegation', 'k:d:pending',
  pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', tests.i('d_pending')), tests.user_id('trainer_a'));

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:d:pending', 'k:live', 'k:waiting'],
  'claim: a live booking, an open request and a pending substitute before the session go out');
select is(
  array(select o.dedupe_key || '=' || o.last_error from public.notification_outbox o where o.status = 'skipped' and o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:answered=booking_outdated', 'k:cancelled=booking_outdated', 'k:d:accepted=delegation_outdated',
        'k:d:started=delegation_outdated'],
  'claim: a cancelled booking, an answered request and a settled or started substitute are skipped');

select * from finish();
rollback;

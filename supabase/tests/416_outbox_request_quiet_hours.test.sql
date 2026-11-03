-- A client's booking request for a session that starts before the trainer's quiet hours end goes out at once,
-- silently; a later one still waits for the morning (QA 44, 20261103142155_request_ignores_quiet_hours.sql).
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
-- The trainer's quiet hours run from an hour ago to three hours from now.
update public.user_settings s
set quiet_hours_start = ((now() at time zone coalesce(s.time_zone, 'UTC')) - interval '1 hour')::time,
    quiet_hours_end = ((now() at time zone coalesce(s.time_zone, 'UTC')) + interval '3 hours')::time
where s.user_id = tests.user_id('trainer_a');

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('soon', tests.create_session('trainer_a', now() + interval '1 hour')),
  ('later', tests.create_session('trainer_a', now() + interval '6 hours'));

select private.enqueue_notification('booking_requested', 'r:' || name, '{}', tests.user_id('trainer_a'),
  p_session_id => id)
from tests.ids;
select private.enqueue_notification('booking_cancelled_by_client', 'c:soon', '{}', tests.user_id('trainer_a'),
  p_session_id => (select id from tests.ids where name = 'soon'));

select ok(
  (select deliver_after <= now() from public.notification_outbox where dedupe_key = 'r:soon'),
  'enqueue: a request for a session inside quiet hours is not held');
select ok(
  (select deliver_after > now() + interval '2 hours' from public.notification_outbox where dedupe_key = 'r:later'),
  'enqueue: a request for a session after quiet hours waits for their end');
select ok(
  (select deliver_after > now() + interval '2 hours' from public.notification_outbox where dedupe_key = 'c:soon'),
  'enqueue: other trainer messages about that session still wait');

-- Changing quiet hours requeues held messages; the urgent request stays due.
update public.user_settings s
set quiet_hours_end = ((now() at time zone coalesce(s.time_zone, 'UTC')) + interval '4 hours')::time
where s.user_id = tests.user_id('trainer_a');
select ok(
  (select deliver_after <= now() from public.notification_outbox where dedupe_key = 'r:soon'),
  'requeue: the urgent request stays due after quiet hours change');

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id order by 1),
  array['r:soon'], 'claim: only the urgent request goes out');
select is(
  (select c.silent from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key = 'r:soon'),
  true, 'claim: and it goes out silently');

select * from finish();
rollback;

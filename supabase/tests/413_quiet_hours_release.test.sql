-- Changing quiet hours moves held messages to the new end (20261103083444_quiet_hours_release_outbox.sql, QA 31):
-- turning them off releases a held message now, a message scheduled later keeps its time, and a retry keeps its
-- backoff.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_user('client_c');
update public.user_settings
set time_zone = 'UTC',
    quiet_hours_start = (now() at time zone 'UTC' - interval '1 hour')::time,
    quiet_hours_end = (now() at time zone 'UTC' + interval '2 hours')::time
where user_id = tests.user_id('client_c');

select private.enqueue_notification('booking_created', 'k:held', '{}', tests.user_id('client_c'));
select private.enqueue_notification('booking_created', 'k:later', '{}', tests.user_id('client_c'),
  p_scheduled_for => now() + interval '5 hours');
select private.enqueue_notification('booking_created', 'k:retry', '{}', tests.user_id('client_c'));
update public.notification_outbox set attempts = 1, deliver_after = now() + interval '30 minutes' where dedupe_key = 'k:retry';

select ok(
  (select deliver_after > now() + interval '1 hour' from public.notification_outbox where dedupe_key = 'k:held'),
  'quiet hours on: the message waits for their end'
);

update public.user_settings set quiet_hours_start = null, quiet_hours_end = null where user_id = tests.user_id('client_c');

select is(
  (select deliver_after from public.notification_outbox where dedupe_key = 'k:held'), now(),
  'quiet hours off: the held message goes out now'
);
select is(
  (select deliver_after from public.notification_outbox where dedupe_key = 'k:later'), now() + interval '5 hours',
  'a message scheduled later keeps its time'
);
select is(
  (select deliver_after from public.notification_outbox where dedupe_key = 'k:retry'), now() + interval '30 minutes',
  'a retry keeps its backoff'
);

select * from finish();
rollback;

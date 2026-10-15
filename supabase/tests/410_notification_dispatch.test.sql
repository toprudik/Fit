-- Notification dispatch of migration 20261015220000_notification_dispatch.sql (ADR 0006): quiet hours, queueing,
-- claiming with the send-time checks, recording results with retries, and the pg_cron job.
-- now() is fixed for the whole transaction, so "quiet now" is built around it.
begin;
\ir _helpers.psql
select plan(63);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');                              -- in quiet hours right now (UTC)
select tests.create_user('client_e', p_language_code => 'en');     -- quiet hours off, English
select tests.create_user('client_blocked_bot');
select tests.create_user('client_banned');
select tests.create_user('client_deleting');
select tests.create_user('client_muted');
select tests.create_card('trainer_a', 'card_k');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create function tests.row_of(p_key text) returns public.notification_outbox language sql stable set search_path = '' as $$
  select o from public.notification_outbox o where o.dedupe_key = p_key
$$;

-- Quiet hours off for everyone except C, whose quiet hours are the two hours around now, in UTC.
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;
update public.user_settings
set time_zone = 'UTC',
    quiet_hours_start = (now() at time zone 'UTC')::time - interval '1 hour',
    quiet_hours_end = (now() at time zone 'UTC')::time + interval '1 hour'
where user_id = tests.u('client_c');

update public.profiles set bot_blocked_at = now() where id = tests.u('client_blocked_bot');
update public.profiles set blocked_at = now(), blocked_reason = 'spam' where id = tests.u('client_banned');
insert into public.account_deletions (user_id, scheduled_for) values (tests.u('client_deleting'), now() + interval '30 days');
insert into public.notification_preferences (user_id, type, enabled) values (tests.u('client_muted'), 'booking_assigned', false);

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('session_soon', tests.create_session('trainer_a', now() + interval '2 hours')),
  ('session_started', tests.create_session('trainer_a', now() - interval '10 minutes')),
  ('session_later', tests.create_session('trainer_a', now() + interval '5 hours'));
insert into tests.ids values
  ('booking_c', tests.create_booking((select id from tests.ids where name = 'session_soon'), 'trainer_a', 'client_c')),
  ('booking_e_started', tests.create_booking((select id from tests.ids where name = 'session_started'), 'trainer_a', 'client_e')),
  ('booking_e_requested', tests.create_booking((select id from tests.ids where name = 'session_later'), 'trainer_a', 'client_e', 'requested'));
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;

-- =========================================================================================================
-- Quiet hours

update public.user_settings set time_zone = 'Europe/Moscow', quiet_hours_start = '22:00', quiet_hours_end = '08:00'
where user_id = tests.u('client_muted');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 20:00Z'), '2026-10-16 05:00Z'::timestamptz,
  'quiet hours: 23:00 in Moscow waits until 08:00 the next morning');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 02:00Z'), '2026-10-15 05:00Z'::timestamptz,
  'quiet hours: 05:00 in Moscow waits until 08:00 the same morning');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 12:00Z'), '2026-10-15 12:00Z'::timestamptz,
  'quiet hours: 15:00 in Moscow is outside them');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 05:00Z'), '2026-10-15 05:00Z'::timestamptz,
  'quiet hours: the end itself is outside them');
update public.user_settings set quiet_hours_start = '13:00', quiet_hours_end = '15:00' where user_id = tests.u('client_muted');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 10:30Z'), '2026-10-15 12:00Z'::timestamptz,
  'quiet hours: an interval within one day works too');
update public.user_settings set quiet_hours_start = '13:00', quiet_hours_end = '13:00' where user_id = tests.u('client_muted');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 10:30Z'), '2026-10-15 10:30Z'::timestamptz,
  'quiet hours: start = end means no quiet hours');
update public.user_settings set time_zone = 'America/New_York', quiet_hours_start = '01:00', quiet_hours_end = '02:30'
where user_id = tests.u('client_muted');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-03-08 06:30Z'), '2026-03-08 07:30Z'::timestamptz,
  'quiet hours: an end time skipped by the DST change resolves to the next valid moment');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null where user_id = tests.u('client_muted');
select is(private.quiet_hours_end(tests.u('client_muted'), '2026-10-15 20:00Z'), '2026-10-15 20:00Z'::timestamptz,
  'quiet hours: off when both ends are null');
select is(private.quiet_hours_end(tests.u('client_c'), now()), now() + interval '1 hour',
  'quiet hours: C is in quiet hours for one more hour');

-- =========================================================================================================
-- Queueing

select isnt(private.enqueue_notification('booking_assigned', 'k:c:assigned', '{}', tests.u('client_c')), null,
  'enqueue: returns the new row id');
select is((tests.row_of('k:c:assigned')).deliver_after, now() + interval '1 hour',
  'enqueue: a non-urgent message in quiet hours waits until they end');
select is((tests.row_of('k:c:assigned')).scheduled_for, now(), 'enqueue: scheduled_for defaults to now');
select is(private.enqueue_notification('booking_assigned', 'k:c:assigned', '{}', tests.u('client_c')), null,
  'enqueue: a repeated dedupe_key queues nothing and returns null');
select is((select count(*)::int from public.notification_outbox where dedupe_key = 'k:c:assigned'), 1,
  'enqueue: the repeated key left one row');

select isnt(private.enqueue_notification('session_reminder', 'k:c:reminder', '{"offset_min": 60}', tests.u('client_c'),
  p_booking_id => tests.i('booking_c'), p_session_id => tests.i('session_soon')), null, 'enqueue: a reminder');
select is((tests.row_of('k:c:reminder')).deliver_after, now(), 'enqueue: a reminder in quiet hours keeps its time');
select isnt(private.enqueue_notification('verification_submitted', 'k:admin:1', '{"documents": 2}', p_chat_target => 'admin_group'),
  null, 'enqueue: a message to the team chat');
select is((tests.row_of('k:admin:1')).deliver_after, now(), 'enqueue: the team chat has no quiet hours');
select throws_ok(
  $$select private.enqueue_notification('bot_test', 'k:nobody', '{}')$$,
  '23514', null, 'enqueue: a row needs exactly one recipient');

-- Rows for every send-time check, due now.
select private.enqueue_notification('booking_assigned', 'k:e:assigned', '{"x": 1}', tests.u('client_e'));
select private.enqueue_notification('booking_assigned', 'k:card', '{}', tests.u('card_k'));
select private.enqueue_notification('booking_assigned', 'k:blocked_bot', '{}', tests.u('client_blocked_bot'));
select private.enqueue_notification('booking_assigned', 'k:banned', '{}', tests.u('client_banned'));
select private.enqueue_notification('booking_assigned', 'k:deleting', '{}', tests.u('client_deleting'));
select private.enqueue_notification('account_deletion', 'k:deleting:notice', '{}', tests.u('client_deleting'));
select private.enqueue_notification('booking_assigned', 'k:muted', '{}', tests.u('client_muted'));
select private.enqueue_notification('booking_created', 'k:muted:other', '{}', tests.u('client_muted'));
select private.enqueue_notification('session_reminder', 'k:e:started', '{}', tests.u('client_e'),
  p_booking_id => tests.i('booking_e_started'), p_session_id => tests.i('session_started'));
select private.enqueue_notification('session_reminder', 'k:e:requested', '{}', tests.u('client_e'),
  p_booking_id => tests.i('booking_e_requested'), p_session_id => tests.i('session_later'));
select private.enqueue_notification('bot_test', 'k:e:later', '{}', tests.u('client_e'), p_scheduled_for => now() + interval '1 day');
-- Queued before C's quiet hours began: due now, but the claim moves it to their end.
insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
values (tests.u('client_c'), 'booking_cancelled_by_trainer', 'k:c:before_quiet', '{}', now() - interval '2 hours', now() - interval '2 hours');

-- =========================================================================================================
-- Who may claim

select ok(not has_function_privilege('authenticated', 'public.claim_outbox(integer)', 'execute'),
  'claim_outbox: signed-in users cannot run it');
select ok(not has_function_privilege('anon', 'public.claim_outbox(integer)', 'execute'), 'claim_outbox: anon cannot run it');
select ok(has_function_privilege('service_role', 'public.claim_outbox(integer)', 'execute'), 'claim_outbox: service_role can');
select ok(not has_function_privilege('authenticated', 'public.record_outbox_result(bigint, text, bigint, text, integer)', 'execute'),
  'record_outbox_result: signed-in users cannot run it');
select ok(has_function_privilege('service_role', 'public.record_outbox_result(bigint, text, bigint, text, integer)', 'execute'),
  'record_outbox_result: service_role can');
select ok(
  not has_function_privilege('authenticated', 'private.enqueue_notification(public.notification_type, text, jsonb, uuid, text, timestamptz, uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.enqueue_notification(public.notification_type, text, jsonb, uuid, text, timestamptz, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.configure_notification_dispatch(text, text)', 'execute')
  and not has_function_privilege('service_role', 'private.dispatch_notifications()', 'execute'),
  'private dispatch functions: no API role can run them');

select tests.authenticate_as('client_c');
select throws_ok($$select * from public.claim_outbox()$$, '42501', null, 'claim_outbox: a signed-in call is refused');
select tests.clear_authentication();
select throws_ok($$select * from public.claim_outbox(0)$$, '22023', null, 'claim_outbox: the limit is 1 to 100');

-- =========================================================================================================
-- Claiming

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id order by o.dedupe_key),
  array['k:admin:1', 'k:c:reminder', 'k:deleting:notice', 'k:e:assigned', 'k:muted:other'],
  'claim: returns exactly the rows that can go out now');
select is((tests.row_of('k:e:assigned')).status, 'processing', 'claim: a claimed row is processing');
select is((tests.row_of('k:e:assigned')).attempts, 1::smallint, 'claim: and counts the attempt');
select is((tests.row_of('k:e:assigned')).locked_until, now() + interval '5 minutes', 'claim: with a five-minute lease');
select is((select row(c.chat_id, c.locale::text, c.silent, c.payload) from claimed c
           join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key = 'k:e:assigned'),
  row((select telegram_id from tests.users where handle = 'client_e'), 'en'::text, false, '{"x": 1}'::jsonb),
  'claim: returns the Telegram chat, the recipient''s language and the payload');
select is((select c.silent from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key = 'k:c:reminder'),
  true, 'claim: a reminder in quiet hours goes out silently');
select is((select row(c.chat_id, c.chat_target, c.locale::text) from claimed c
           join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key = 'k:admin:1'),
  row(null::bigint, 'admin_group'::text, 'ru'::text), 'claim: a team chat row carries chat_target and Russian');

select is(
  array(select o.dedupe_key || '=' || o.last_error from public.notification_outbox o where o.status = 'skipped' order by o.dedupe_key),
  array['k:banned=account_blocked', 'k:blocked_bot=bot_blocked', 'k:card=no_telegram', 'k:deleting=account_deleting',
        'k:e:requested=reminder_outdated', 'k:e:started=reminder_outdated', 'k:muted=disabled'],
  'claim: skips every row the recipient can no longer get, with the reason');
select is((tests.row_of('k:c:before_quiet')).status, 'pending', 'claim: a row that now falls into quiet hours stays pending');
select is((tests.row_of('k:c:before_quiet')).deliver_after, now() + interval '1 hour', 'claim: and waits until they end');
select is((tests.row_of('k:c:assigned')).status, 'pending', 'claim: a row deferred at queueing is not due yet');
select is((tests.row_of('k:e:later')).status, 'pending', 'claim: a future row is not touched');

-- Another run at the same time gets nothing: the claimed rows are processing.
select tests.authenticate_as_service_role();
select is((select count(*)::int from public.claim_outbox(50)), 0, 'claim: a second run finds nothing to send');
select tests.clear_authentication();

-- =========================================================================================================
-- Recording results

create function tests.record(p_key text, p_outcome text, p_message bigint default null, p_error text default null, p_retry integer default null)
returns public.outbox_status language sql set search_path = '' as $$
  select public.record_outbox_result((select o.id from public.notification_outbox o where o.dedupe_key = p_key), p_outcome, p_message, p_error, p_retry)
$$;

select tests.authenticate_as_service_role();
select is(tests.record('k:e:assigned', 'sent', 777), 'sent', 'record: sent');
select tests.clear_authentication();
select is((select row(o.sent_at, o.telegram_message_id, o.locked_until) from public.notification_outbox o where o.dedupe_key = 'k:e:assigned'),
  row(now(), 777::bigint, null::timestamptz), 'record: sent stores the time and the Telegram message id, and drops the lease');
select is(tests.record('k:e:assigned', 'retry', p_error => 'late'), 'sent', 'record: a repeated call changes nothing');
select is(public.record_outbox_result(-1, 'sent'), null, 'record: an unknown id returns null');
select throws_ok($$select public.record_outbox_result(1, 'lost')$$, '22023', null, 'record: an unknown outcome is refused');

select is(tests.record('k:muted:other', 'blocked', p_error => 'telegram_403'), 'skipped', 'record: blocked skips the row');
select isnt((select bot_blocked_at from public.profiles where id = tests.u('client_muted')), null,
  'record: blocked marks the bot as blocked for the user');

select is(tests.record('k:c:reminder', 'retry', p_error => 'telegram_502'), 'pending', 'record: a retry returns the row to the queue');
select is((select row(o.deliver_after, o.last_error, o.attempts) from public.notification_outbox o where o.dedupe_key = 'k:c:reminder'),
  row(now() + interval '30 seconds', 'telegram_502'::text, 1::smallint), 'record: the first retry waits 30 seconds');

select is(tests.record('k:deleting:notice', 'release', p_retry => 7), 'pending', 'record: release returns the row to the queue');
select is((select row(o.deliver_after, o.attempts) from public.notification_outbox o where o.dedupe_key = 'k:deleting:notice'),
  row(now() + interval '7 seconds', 0::smallint), 'record: release waits retry_after and gives the attempt back');

select is(tests.record('k:admin:1', 'failed', p_error => 'admin_chat_not_configured'), 'failed', 'record: failed is final');

-- The fifth attempt that fails is the last one.
update public.notification_outbox set status = 'processing', attempts = 4, locked_until = now() + interval '1 minute'
where dedupe_key = 'k:c:reminder';
select is(tests.record('k:c:reminder', 'retry', p_retry => 1), 'pending', 'record: the fourth retry still retries');
select is((tests.row_of('k:c:reminder')).deliver_after, now() + interval '240 seconds', 'record: and waits 4 minutes');
update public.notification_outbox set status = 'processing', attempts = 5, locked_until = now() + interval '1 minute'
where dedupe_key = 'k:c:reminder';
select is(tests.record('k:c:reminder', 'retry'), 'failed', 'record: after five attempts the row fails');

-- A run that died: its lease expired, so the next claim puts the row back and sends it again.
update public.notification_outbox set status = 'processing', attempts = 1, locked_until = now() - interval '1 second', deliver_after = now()
where dedupe_key = 'k:deleting:notice';
select tests.authenticate_as_service_role();
select is((select array_agg(c.attempt) from public.claim_outbox(50) c), array[2::smallint], 'claim: an expired lease is claimed again, as attempt 2');
select tests.clear_authentication();

-- =========================================================================================================
-- pg_cron and pg_net

select is(
  array(select j.jobname::text || ' ' || j.schedule from cron.job j where j.jobname like 'notifications-%' order by j.jobname),
  array['notifications-dispatch * * * * *', 'notifications-retention 17 3 * * *'],
  'cron: the dispatcher runs every minute, the retention job daily');
select is(private.dispatch_notifications(), null, 'dispatch: does nothing while the Vault secrets are not set');
select throws_ok($$select private.configure_notification_dispatch('http://example.com/api/cron/notifications', repeat('a', 40))$$,
  '22023', null, 'configure: the URL must be https and the dispatcher route');
select throws_ok($$select private.configure_notification_dispatch('https://example.com/api/cron/notifications', 'short')$$,
  '22023', null, 'configure: the secret must be long enough');
select private.configure_notification_dispatch('https://example.com/api/cron/notifications', repeat('a', 40));
select private.configure_notification_dispatch('https://dafit.example/api/cron/notifications', repeat('b', 40));
select is(
  array(select s.name || '=' || s.decrypted_secret from vault.decrypted_secrets s where s.name like 'notifications_%' order by s.name),
  array['notifications_cron_secret=' || repeat('b', 40), 'notifications_dispatch_url=https://dafit.example/api/cron/notifications'],
  'configure: a second call replaces both values');
select private.enqueue_notification('bot_test', 'k:e:now', '{}', tests.u('client_e'));
select isnt(private.dispatch_notifications(), null, 'dispatch: with the secrets set and a row due, it queues a request');
select is(
  (select r.url || ' ' || (r.headers ->> 'Authorization') from net.http_request_queue r order by r.id desc limit 1),
  'https://dafit.example/api/cron/notifications Bearer ' || repeat('b', 40),
  'dispatch: the request goes to the configured route with the bearer secret');

select * from finish();
rollback;

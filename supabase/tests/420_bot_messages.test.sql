-- Bot message access of migration 20261016175000_bot_messages.sql (PRD wave-1 §2.1 rule 6, AUTH-7):
-- bot_messages_blocked and set_bot_messages.
begin;
\ir _helpers.psql
select plan(16);

select tests.create_user('client_c');
select tests.create_user('client_d');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Anonymous callers get nothing.
select tests.authenticate_as_anon();
select throws_ok($$ select public.bot_messages_blocked() $$, '42501', null, 'anon cannot read the mark');
select throws_ok($$ select public.set_bot_messages(true) $$, '42501', null, 'anon cannot change the mark');
select tests.clear_authentication();

-- A new user: the bot may write.
select tests.authenticate_as('client_c');
select is(public.bot_messages_blocked(), false, 'a new user is not blocked');
select throws_ok($$ select public.set_bot_messages(null) $$, '22023', null, 'a null answer is refused');

-- Denied: blocked, and a second denial keeps the first time.
select public.set_bot_messages(false);
select is(public.bot_messages_blocked(), true, 'a denial marks the bot as blocked');
select tests.clear_authentication();
update public.profiles set bot_blocked_at = '2026-10-01 10:00+00' where id = tests.u('client_c');
select tests.authenticate_as('client_c');
select public.set_bot_messages(false);
select tests.clear_authentication();
select is(
  (select bot_blocked_at from public.profiles where id = tests.u('client_c')), '2026-10-01 10:00+00'::timestamptz,
  'a second denial keeps the earlier time');

-- Another user's mark stays as it is.
select is((select bot_blocked_at from public.profiles where id = tests.u('client_d')), null, 'the other user is untouched');
select tests.authenticate_as('client_d');
select is(public.bot_messages_blocked(), false, 'each user reads their own mark');
select tests.clear_authentication();

-- Allowed without a test: cleared, nothing queued.
select tests.authenticate_as('client_c');
select public.set_bot_messages(true);
select is(public.bot_messages_blocked(), false, 'allowing clears the mark');
select tests.clear_authentication();
select is((select count(*) from public.notification_outbox where user_id = tests.u('client_c'))::int, 0,
  'allowing without a test queues nothing');

-- Allowed with a test: one bot_test, and taps in the same minute queue no more.
select tests.authenticate_as('client_c');
select public.set_bot_messages(true, true);
select public.set_bot_messages(true, true);
select tests.clear_authentication();
select is(
  (select count(*) from public.notification_outbox where user_id = tests.u('client_c') and type = 'bot_test')::int, 1,
  'the test message is queued once a minute');
select is(
  (select status::text from public.notification_outbox where user_id = tests.u('client_c')), 'pending',
  'the test message waits for the dispatcher');
select is(
  (select deliver_after <= now() from public.notification_outbox where user_id = tests.u('client_c')), true,
  'the test message goes out right away');

-- A signed-in user still cannot touch the column or the outbox directly.
select tests.authenticate_as('client_c');
select throws_ok(
  $$ update public.profiles set bot_blocked_at = null where id = auth.uid() $$,
  '42501', null, 'the column is not writable directly');
select throws_ok(
  $$ select bot_blocked_at from public.profiles where id = auth.uid() $$,
  '42501', null, 'the column is not readable directly');
select throws_ok($$ select count(*) from public.notification_outbox $$, '42501', null, 'the outbox stays hidden from users');
select tests.clear_authentication();

select * from finish();
rollback;

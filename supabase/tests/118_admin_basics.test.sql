-- Basic admin functions of migration 20261016150000_admin_basics.sql (PRD wave-1 §4 ADM-7, ADM-8, ADM-11):
-- admin_overview, admin_search_users, admin_user_card, admin_block_user, admin_unblock_user.
begin;
\ir _helpers.psql
select plan(40);

select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');

update public.profiles set last_name = 'Smirnova', username = 'anna_100%' where id = tests.user_id('client_c');
update public.trainer_profiles set verification_status = 'pending' where user_id = tests.user_id('trainer_a');

-- A trainer's card: a client without an account, managed by the trainer (PAIR-10).
select tests.create_card('trainer_a', 'client_card');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- =========================================================================================================
-- Only admins

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_overview() $$, '42501', null, 'overview: a trainer is refused');
select throws_ok($$ select * from public.admin_search_users('') $$, '42501', null, 'search: a trainer is refused');
select throws_ok(
  $$ select * from public.admin_user_card(tests.u('client_c')) $$, '42501', null, 'card: a trainer is refused'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('client_c'), 'spam') $$, '42501', null, 'block: a trainer is refused'
);
select throws_ok(
  $$ select public.admin_unblock_user(tests.u('client_c'), 'ok') $$, '42501', null, 'unblock: a trainer is refused'
);
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_overview() $$, '42501', null, 'overview: anon cannot call it');
select tests.clear_authentication();

-- =========================================================================================================
-- admin_overview

select tests.authenticate_as('admin_x');
select results_eq(
  $$ select users, trainers, trainers_pending, trainers_verified, active_pairs, blocked_users from public.admin_overview() $$,
  $$ values (5, 1, 1, 0, 2, 0) $$,
  'overview: counts accounts without cards, trainers, the queue, live pairs and blocks'
);

-- =========================================================================================================
-- admin_search_users

select is(
  (select count(*)::int from public.admin_search_users('')), 5, 'search: an empty query lists every account'
);
select is(
  (select count(*)::int from public.admin_search_users(null, 2)), 2, 'search: the limit is kept'
);
select throws_ok(
  $$ select * from public.admin_search_users('', 101) $$, '22023', 'invalid_limit', 'search: at most 100 rows'
);
select results_eq(
  $$ select user_id from public.admin_search_users('client_c smir') $$,
  $$ values (tests.u('client_c')) $$,
  'search: finds by first and last name, in any case'
);
select results_eq(
  $$ select user_id from public.admin_search_users('Smirnova client') $$,
  $$ values (tests.u('client_c')) $$,
  'search: finds by last name first'
);
select results_eq(
  $$ select user_id from public.admin_search_users('@ANNA_100%') $$,
  $$ values (tests.u('client_c')) $$,
  'search: finds by @username'
);
select is(
  (select count(*)::int from public.admin_search_users('anna_1000')), 0, 'search: % and _ are not wildcards'
);
select results_eq(
  $$ select user_id from public.admin_search_users((select telegram_id::text from tests.users where handle = 'client_d')) $$,
  $$ values (tests.u('client_d')) $$,
  'search: finds by Telegram ID'
);
select is(
  (select count(*)::int from public.admin_search_users('client_card')), 0, 'search: a trainer''s card is not listed'
);
select results_eq(
  $$ select is_trainer, is_admin, blocked from public.admin_search_users('trainer_a') $$,
  $$ values (true, false, false) $$,
  'search: says who is a trainer, an admin or blocked'
);

-- =========================================================================================================
-- admin_user_card

select results_eq(
  $$ select is_trainer, verification_status::text, trainer_pairs, trainer_active_pairs, client_pairs, sessions_led
     from public.admin_user_card(tests.u('trainer_a')) $$,
  $$ values (true, 'pending'::text, 2, 2, 0, 0) $$,
  'card: a trainer with verification and pair counts'
);
select results_eq(
  $$ select is_trainer, verification_status::text, client_pairs, client_active_pairs, bookings_made, is_admin
     from public.admin_user_card(tests.u('client_c')) $$,
  $$ values (false, null::text, 1, 1, 0, false) $$,
  'card: a client with their pairs'
);
select ok(
  (select telegram_id is not null and created_at is not null from public.admin_user_card(tests.u('client_c'))),
  'card: shows the Telegram ID and the registration date'
);
select is(
  (select count(*)::int from public.admin_user_card(tests.u('client_card'))), 0,
  'card: a trainer''s card has no admin card'
);
select is(
  (select count(*)::int from public.admin_user_card(gen_random_uuid())), 0, 'card: an unknown id gives no row'
);

-- =========================================================================================================
-- admin_block_user

select throws_ok(
  $$ select public.admin_block_user(tests.u('client_c'), '  ') $$, '22023', 'reason_required', 'block: a reason is required (ADM-7)'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('client_c'), repeat('x', 501)) $$, '22023', 'reason_too_long', 'block: a reason is at most 500 characters'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('admin_x'), 'me') $$, 'P0001', 'cannot_block_self', 'block: an admin cannot block themselves'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('admin_y'), 'colleague') $$, 'P0001', 'cannot_block_admin', 'block: another admin cannot be blocked'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('client_card'), 'card') $$, 'P0001', 'user_not_found',
  'block: a trainer''s card cannot be blocked'
);
select lives_ok(
  $$ select public.admin_block_user(tests.u('client_c'), '  Spam in reviews  ') $$, 'block: the admin blocks a client'
);
select throws_ok(
  $$ select public.admin_block_user(tests.u('client_c'), 'again') $$, 'P0001', 'already_blocked', 'block: a blocked account is not blocked twice'
);
select results_eq(
  $$ select blocked_at is not null, blocked_reason from public.admin_user_card(tests.u('client_c')) $$,
  $$ values (true, 'Spam in reviews'::text) $$,
  'block: the card shows the block and its trimmed reason'
);
select is(
  (select blocked_users from public.admin_overview()), 1, 'block: the overview counts it'
);
select tests.clear_authentication();
select results_eq(
  $$ select actor_id, target_type, target_id, reason from public.admin_audit_log where action = 'user.block' $$,
  $$ values (tests.u('admin_x'), 'user'::text, tests.u('client_c'), 'Spam in reviews'::text) $$,
  'block: the block is in the audit log (ADM-11)'
);

-- ADM-7: the bot no longer writes to a blocked account.
select private.enqueue_notification('bot_test', 'test:blocked', '{}', tests.u('client_c'));
select tests.authenticate_as_service_role();
select is((select count(*)::int from public.claim_outbox(10)), 0, 'block: no bot message is sent to a blocked account');
select tests.clear_authentication();
select is(
  (select last_error from public.notification_outbox where dedupe_key = 'test:blocked'), 'account_blocked',
  'block: the outbox row is skipped as account_blocked'
);

-- =========================================================================================================
-- admin_unblock_user

select tests.authenticate_as('admin_y');
select throws_ok(
  $$ select public.admin_unblock_user(tests.u('client_c'), '') $$, '22023', 'reason_required', 'unblock: a reason is required'
);
select throws_ok(
  $$ select public.admin_unblock_user(tests.u('client_d'), 'not blocked') $$, 'P0001', 'not_blocked', 'unblock: an account that is not blocked'
);
select lives_ok(
  $$ select public.admin_unblock_user(tests.u('client_c'), 'Appeal accepted') $$, 'unblock: another admin lifts the block'
);
select results_eq(
  $$ select blocked_at, blocked_reason from public.admin_user_card(tests.u('client_c')) $$,
  $$ values (null::timestamptz, null::text) $$,
  'unblock: the block is gone'
);
select tests.clear_authentication();
select results_eq(
  $$ select actor_id, reason from public.admin_audit_log where action = 'user.unblock' $$,
  $$ values (tests.u('admin_y'), 'Appeal accepted'::text) $$,
  'unblock: the unblock is in the audit log'
);

-- The block columns stay server-only: a user cannot read them, even their own (column grants).
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select blocked_at from public.profiles where id = auth.uid() $$, '42501', null, 'privacy: blocked_at is not granted to users'
);
select tests.clear_authentication();

select * from finish();
rollback;

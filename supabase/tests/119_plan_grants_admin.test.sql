-- Admin plan grants and access requests of migration 20261016160000_plan_grants_admin.sql (PRD wave-1 §2.14
-- PLAN-1, 2, 4, 5, 6): admin_grant_plan, admin_revoke_plan, admin_decline_access_request, request_access.
begin;
\ir _helpers.psql
select plan(58);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_card('trainer_a', 'card_n');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d', 'trial');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create function tests.active_grant(p_handle text, p_plan text) returns uuid language sql stable set search_path = '' as $$
  select g.id from public.plan_grants g
  where g.user_id = tests.user_id(p_handle) and g.plan_code = p_plan and g.revoked_at is null
$$;

-- =========================================================================================================
-- Only admins

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', 'me') $$, '42501', null, 'grant: a trainer cannot grant'
);
select throws_ok(
  $$ select public.admin_revoke_plan(gen_random_uuid(), 'reason') $$, '42501', null, 'revoke: a trainer cannot revoke'
);
select throws_ok(
  $$ select public.admin_decline_access_request(gen_random_uuid()) $$, '42501', null, 'decline: a trainer cannot decline'
);
select tests.clear_authentication();

-- =========================================================================================================
-- request_access (PLAN-4)

select tests.authenticate_as('trainer_a');
select lives_ok($$ select public.request_access('trainer_pro', 'trainer.unlimited_clients') $$, 'request: a trainer asks for Pro');
select is(
  public.request_access('trainer_pro', 'trainer.unlimited_clients'),
  (select r.id from public.access_requests r where r.user_id = tests.u('trainer_a')),
  'request: a second press returns the open request'
);
select is((select count(*)::int from public.access_requests), 1, 'request: no duplicate (PLAN-4)');
select is(
  (select feature from public.access_requests where user_id = tests.u('trainer_a')), 'trainer.unlimited_clients',
  'request: keeps the locked feature'
);
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.request_access('trainer_pro') $$, '42501', null, 'request: a client cannot ask for a trainer plan'
);
select throws_ok(
  $$ select public.request_access('client_free') $$, '42501', null, 'request: nobody asks for a free plan'
);
select lives_ok($$ select public.request_access('client_premium', '  ') $$, 'request: a client asks for Premium');
select is(
  (select feature from public.access_requests where user_id = tests.u('client_c')), null::text,
  'request: a blank feature is stored as none'
);
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok($$ select public.request_access('client_premium') $$, '42501', null, 'request: anon cannot call it');
select tests.clear_authentication();

-- =========================================================================================================
-- admin_grant_plan (PLAN-2, PLAN-5)

select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', '  ') $$, '22023', 'reason_required', 'grant: a reason is required'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', 'ok') $$, '22023', 'reason_too_short', 'grant: at least 3 characters'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', repeat('x', 501)) $$, '22023', 'reason_too_long', 'grant: at most 500 characters'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_free', 'beta trainer') $$, '22023', 'invalid_plan', 'grant: a free plan is not granted'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'nope', 'beta trainer') $$, '22023', 'invalid_plan', 'grant: an unknown plan'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('client_c'), 'trainer_pro', 'beta trainer') $$, 'P0001', 'not_a_trainer', 'grant: Pro goes to trainers only'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('card_n'), 'client_premium', 'card') $$, 'P0001', 'user_not_found', 'grant: not to a trainer''s card'
);
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', 'beta trainer', now() - interval '1 hour') $$,
  '22023', 'invalid_expiry', 'grant: the end is in the future'
);

-- Before the grant: two pairs and the card fill the Free limit of 3 (PLAN-1).
select tests.clear_authentication();
select throws_ok(
  $$ select private.assert_can_add_client(tests.u('trainer_a')) $$, 'P0001', 'plan_limit_reached',
  'limit: a Free trainer with 2 pairs and a card is full'
);
select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', '  Beta trainer  ', now() + interval '30 days') $$,
  'grant: the admin gives Pro for 30 days'
);
select tests.clear_authentication();
select lives_ok($$ select private.assert_can_add_client(tests.u('trainer_a')) $$, 'limit: lifted at once after the grant (PLAN-2)');
select tests.authenticate_as('admin_x');
select is(public.effective_plan(tests.u('trainer_a'), 'trainer'), 'trainer_pro', 'grant: the effective plan is Pro');
select throws_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', 'again') $$, 'P0001', 'already_granted', 'grant: one active grant per plan'
);
select is(
  (select status::text from public.access_requests where user_id = tests.u('trainer_a')), 'granted',
  'grant: the open request is closed as granted'
);
select tests.clear_authentication();

select results_eq(
  $$ select actor_id, target_id, reason, metadata ->> 'plan' from public.admin_audit_log where action = 'plan.grant' $$,
  $$ values (tests.u('admin_x'), tests.u('trainer_a'), 'Beta trainer'::text, 'trainer_pro'::text) $$,
  'grant: in the audit log with the author and the trimmed reason (PLAN-5)'
);
select is(
  (select granted_by from public.plan_grants where id = tests.active_grant('trainer_a', 'trainer_pro')), tests.u('admin_x'),
  'grant: written with the admin'
);
select is(
  (select count(*)::int from public.notification_outbox where type = 'plan_granted' and user_id = tests.u('trainer_a')), 1,
  'grant: the trainer gets a bot message'
);
select ok(
  (select scheduled_for between now() + interval '27 days' - interval '1 minute' and now() + interval '27 days' + interval '1 minute'
   from public.notification_outbox where type = 'plan_expiring' and user_id = tests.u('trainer_a')),
  'grant: the reminder is due three days before the end'
);

-- A grant without an end, and one ending in less than three days, queue no reminder.
select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_grant_plan(tests.u('client_c'), 'client_premium', 'Beta client') $$, 'grant: Premium without an end'
);
select lives_ok(
  $$ select public.admin_grant_plan(tests.u('client_d'), 'client_premium', 'Short trial', now() + interval '2 days') $$,
  'grant: Premium for two days'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'plan_expiring'), 1,
  'grant: no reminder without an end or for a grant shorter than three days'
);

-- PLAN-6: an expired grant stops by time alone.
select tests.grant_plan('client_e', 'client_premium', now() - interval '10 days', now() - interval '1 minute');
select is(public.effective_plan(tests.u('client_e'), 'client'), 'client_free', 'expiry: an expired grant no longer counts (PLAN-6)');

-- =========================================================================================================
-- admin_revoke_plan

select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select public.admin_revoke_plan(tests.active_grant('trainer_a', 'trainer_pro'), '') $$, '22023', 'reason_required',
  'revoke: a reason is required'
);
select throws_ok(
  $$ select public.admin_revoke_plan((select id from public.plan_grants where user_id = tests.u('client_e')), 'expired') $$, 'P0001', 'grant_not_active',
  'revoke: an expired grant is not revoked'
);
select lives_ok(
  $$ select public.admin_revoke_plan(tests.active_grant('trainer_a', 'trainer_pro'), 'Left the beta') $$, 'revoke: the admin revokes Pro'
);
select tests.clear_authentication();
select throws_ok(
  $$ select private.assert_can_add_client(tests.u('trainer_a')) $$, 'P0001', 'plan_limit_reached',
  'revoke: new clients are refused again (PLAN-2)'
);
select is(
  (select count(*)::int from public.coachings where trainer_id = tests.u('trainer_a') and status in ('trial', 'active')), 3,
  'revoke: existing pairs stay'
);
select results_eq(
  $$ select revoked_by, revoke_reason from public.plan_grants where user_id = tests.u('trainer_a') $$,
  $$ values (tests.u('admin_x'), 'Left the beta'::text) $$,
  'revoke: the grant keeps who revoked it and why'
);
select results_eq(
  $$ select actor_id, reason from public.admin_audit_log where action = 'plan.revoke' $$,
  $$ values (tests.u('admin_x'), 'Left the beta'::text) $$,
  'revoke: in the audit log (PLAN-5)'
);
select is(
  (select status::text from public.notification_outbox where type = 'plan_expiring' and user_id = tests.u('trainer_a')), 'cancelled',
  'revoke: the pending reminder is cancelled'
);
select is(
  (select count(*)::int from public.notification_outbox where type = 'plan_revoked' and user_id = tests.u('trainer_a')), 1,
  'revoke: the trainer gets a bot message'
);
select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select public.admin_revoke_plan((select id from public.plan_grants where user_id = tests.u('trainer_a')), 'again') $$,
  'P0001', 'grant_not_active', 'revoke: a revoked grant is not revoked twice'
);
select tests.clear_authentication();

-- =========================================================================================================
-- admin_decline_access_request and the day after a decline

select tests.authenticate_as('client_f');
select lives_ok($$ select public.request_access('client_premium') $$, 'decline: a client asks for Premium');
select tests.clear_authentication();
select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_decline_access_request((select id from public.access_requests where user_id = tests.u('client_f'))) $$,
  'decline: the admin declines'
);
select throws_ok(
  $$ select public.admin_decline_access_request((select id from public.access_requests where user_id = tests.u('client_f'))) $$,
  'P0001', 'request_not_open', 'decline: only an open request'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.admin_audit_log where action = 'access_request.decline' and target_id = tests.u('client_f')), 1,
  'decline: in the audit log'
);
select tests.authenticate_as('client_f');
select public.request_access('client_premium');
select is(
  (select count(*)::int from public.access_requests where user_id = tests.u('client_f')), 1,
  'request: pressing again within a day of a decline makes no new request (PLAN-4)'
);
select tests.clear_authentication();

-- =========================================================================================================
-- my_plan and my_inherited_rights (PLAN-7)

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select side::text, plan_code, expires_at, active_clients, client_limit from public.my_plan() $$,
  $$ values ('trainer'::text, 'trainer_free'::text, null::timestamptz, 3, 3), ('client', 'client_free', null, null, null) $$,
  'my plan: a Free trainer sees 3 of 3 clients and the client side'
);
select tests.clear_authentication();
select tests.authenticate_as('client_c');
select results_eq(
  $$ select side::text, plan_code, expires_at from public.my_plan() $$,
  $$ values ('client'::text, 'client_premium'::text, null::timestamptz) $$,
  'my plan: a client sees only the client side, Premium without an end'
);
select is(
  (select count(*)::int from public.my_inherited_rights()), 0, 'inherited: nothing while the trainer is on Free'
);
select tests.clear_authentication();
select tests.authenticate_as('client_d');
select ok(
  (select expires_at between now() + interval '2 days' - interval '1 minute' and now() + interval '2 days' from public.my_plan()),
  'my plan: the end of the grant'
);
select tests.clear_authentication();

select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_grant_plan(tests.u('trainer_a'), 'trainer_pro', 'Back in the beta') $$, 'grant: Pro again after a revocation'
);
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select plan_code, active_clients, client_limit from public.my_plan() where side = 'trainer' $$,
  $$ values ('trainer_pro'::text, 3, null::integer) $$,
  'my plan: a Pro trainer has no limit'
);
select tests.clear_authentication();
select tests.authenticate_as('client_d');
select results_eq(
  $$ select trainer_id, first_name from public.my_inherited_rights() $$,
  $$ select tests.u('trainer_a'), first_name from public.profiles where id = tests.u('trainer_a') $$,
  'inherited: a client in a trial pair with a Pro trainer (Q58, Q63)'
);
select tests.clear_authentication();
select tests.authenticate_as('client_f');
select is((select count(*)::int from public.my_inherited_rights()), 0, 'inherited: none without a pair');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.my_plan() $$, '42501', null, 'my plan: anon cannot call it');
select tests.clear_authentication();

select * from finish();
rollback;

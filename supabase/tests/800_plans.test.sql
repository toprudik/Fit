-- Plans and entitlements (migrations 20261015124000_plans_policies.sql and 20261015125100_entitlements.sql;
-- contract §1.4 file 24, §1.5 file 26, §6 800_plans; decisions Q56-Q59, R57-R59, R85).
begin;
\ir _helpers.psql
select plan(97);

-- Fixtures: A is on Pro and has C and D live and E ended; B is Free with C on trial. F is a Free trainer with
-- C on trial, D active, its card N, E ended and an anonymized pair (stub). P, X, R and U hold client Premium
-- grants that are active, expired, revoked and in the future. Admin G granted A's Pro.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_f');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('premium_p');
select tests.create_user('expired_x');
select tests.create_user('revoked_r');
select tests.create_user('future_u');
select tests.create_admin('admin_x');
select tests.create_admin('admin_g');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_pair('trainer_b', 'client_c', 'trial');
select tests.create_pair('trainer_f', 'client_c', 'trial');
select tests.create_pair('trainer_f', 'client_d');
select tests.create_pair('trainer_f', 'client_e', 'ended');
select tests.create_card('trainer_f', 'card_n');
select tests.create_deleted_stub();
select tests.create_pair('trainer_f', 'deleted_client');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c'));
insert into public.plan_grants (user_id, plan_code, reason, granted_by)
values (tests.user_id('trainer_a'), 'trainer_pro', 'beta trainer onboarding', tests.user_id('admin_g'));
insert into tests.ids values
  ('grant_a', (select g.id from public.plan_grants g where g.user_id = tests.user_id('trainer_a'))),
  ('grant_p', tests.grant_plan('premium_p', 'client_premium')),
  ('grant_x', tests.grant_plan('expired_x', 'client_premium', now() - interval '30 days', now() - interval '1 day')),
  ('grant_r', tests.grant_plan('revoked_r', 'client_premium')),
  ('grant_u', tests.grant_plan('future_u', 'client_premium', now() + interval '1 day'));
update public.plan_grants
set revoked_at = now(), revoked_by = tests.user_id('admin_x'), revoke_reason = 'granted by mistake'
where id = (select id from tests.ids where name = 'grant_r');

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- plans

select tests.authenticate_as('stranger_s');
select results_eq(
  $$ select code, side::text, rank::integer, title, limits, features from public.plans order by code $$,
  $$ values
       ('client_free', 'client', 0, '{"ru": "Free", "en": "Free"}'::jsonb, '{"progress_photo_sets_per_month": 1}'::jsonb,
        '{}'::text[]),
       ('client_premium', 'client', 1, '{"ru": "Premium", "en": "Premium"}'::jsonb, '{}'::jsonb,
        array['client.trends', 'client.nutrition_advanced', 'client.progress_photos_unlimited', 'client.self_training']),
       ('trainer_free', 'trainer', 0, '{"ru": "Free", "en": "Free"}'::jsonb, '{"max_active_clients": 3}'::jsonb,
        '{}'::text[]),
       ('trainer_pro', 'trainer', 1, '{"ru": "Pro", "en": "Pro"}'::jsonb, '{}'::jsonb,
        array['trainer.unlimited_clients', 'trainer.analytics', 'trainer.finance', 'trainer.groups', 'trainer.broadcasts',
              'trainer.client_nutrition', 'trainer.delegation', 'trainer.referral_offers', 'trainer.showcase_custom',
              'trainer.export']) $$,
  'any signed-in user reads exactly the four seeded plans'
);
select throws_ok(
  $$ insert into public.plans (code, side, rank, title) values ('client_gold', 'client', 2, '{"ru": "x", "en": "x"}') $$,
  '42501', null, 'a user cannot add a plan'
);
select throws_ok($$ update public.plans set limits = '{}' where code = 'trainer_free' $$, '42501', null,
  'a user cannot lift the Free limit');
select throws_ok($$ delete from public.plans where code = 'trainer_free' $$, '42501', null, 'a user cannot delete a plan');

select tests.authenticate_as('admin_x');
select throws_ok($$ update public.plans set rank = 5 where code = 'trainer_pro' $$, '42501', null,
  'an admin cannot change plans through the API either');

select tests.authenticate_as_anon();
select throws_ok($$ select code from public.plans $$, '42501', null, 'anon cannot read plans');

select tests.clear_authentication();
select throws_ok(
  $$ insert into public.plans (code, side, rank, title) values ('client_gold', 'client', 2, '["ru", "en"]') $$,
  '23514', 'new row for relation "plans" violates check constraint "plans_title_check"',
  'a plan title must be an object with ru and en, not an array of the keys'
);

-- ---------------------------------------------------------------------------------------------------------
-- plan_grants

select tests.authenticate_as('premium_p');
select results_eq($$ select id from public.plan_grants $$, $$ values (tests.i('grant_p')) $$,
  'a user reads only the own grant');

select tests.authenticate_as('trainer_a');
select results_eq($$ select id, granted_by from public.plan_grants $$, $$ values (tests.i('grant_a'), tests.u('admin_g')) $$,
  'A reads only the own Pro grant');

select tests.authenticate_as('client_c');
select is_empty($$ select 1 from public.plan_grants $$, 'C has no grants and reads none of its trainer''s');

select tests.authenticate_as('admin_x');
select results_eq($$ select count(*)::integer from public.plan_grants $$, $$ values (5) $$, 'the admin reads every grant');
select throws_ok(
  $$ insert into public.plan_grants (user_id, plan_code, reason) values (tests.u('client_c'), 'client_premium', 'direct grant') $$,
  '42501', null, 'an admin cannot grant directly (admin RPC only)'
);

select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ insert into public.plan_grants (user_id, plan_code, reason) values (tests.u('stranger_s'), 'trainer_pro', 'self grant') $$,
  '42501', null, 'S cannot grant itself Pro'
);

select tests.authenticate_as('expired_x');
select throws_ok(
  $$ update public.plan_grants set expires_at = null where id = tests.i('grant_x') $$, '42501', null,
  'a user cannot extend the own grant'
);
select throws_ok(
  $$ delete from public.plan_grants where id = tests.i('grant_x') $$, '42501', null, 'a user cannot delete the own grant'
);

select tests.clear_authentication();
select throws_ok(
  $$ insert into public.plan_grants (user_id, plan_code, reason) values (tests.u('client_c'), 'client_premium', 'ab') $$,
  '23514', null, 'a two-character reason violates the check'
);
select throws_ok(
  $$ insert into public.plan_grants (user_id, plan_code, reason, starts_at, expires_at)
     values (tests.u('client_c'), 'client_premium', 'test grant', now(), now()) $$,
  '23514', 'new row for relation "plan_grants" violates check constraint "plan_grants_expires_check"',
  'expires_at equal to starts_at violates the check'
);
select throws_ok(
  $$ update public.plan_grants set revoked_at = now() where id = tests.i('grant_p') $$,
  '23514', 'new row for relation "plan_grants" violates check constraint "plan_grants_revoked_check"',
  'revoking without a reason violates the check'
);
select throws_ok(
  $$ update public.plan_grants set plan_code = 'trainer_pro' where id = tests.i('grant_p') $$, 'P0001', 'append_only',
  'changing plan_code raises append_only, also for the server'
);
select throws_ok(
  $$ update public.plan_grants set expires_at = now() + interval '1 year' where id = tests.i('grant_p') $$,
  'P0001', 'append_only', 'changing expires_at raises append_only'
);
select throws_ok(
  $$ delete from public.plan_grants where id = tests.i('grant_p') $$, 'P0001', 'append_only',
  'a direct delete raises append_only'
);
select throws_ok($$ truncate public.plan_grants $$, 'P0001', 'append_only', 'truncate raises append_only');

select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.plan_grants set reason = 'rewritten reason' where id = tests.i('grant_p') $$, 'P0001', 'append_only',
  'service_role cannot rewrite a grant either'
);

-- ---------------------------------------------------------------------------------------------------------
-- access_requests (PLAN-4)

select tests.authenticate_as('client_c');
select results_eq(
  $$ insert into public.access_requests (user_id, plan_code, feature) values (tests.u('client_c'), 'client_premium', 'client.trends')
     returning status::text, decided_at $$,
  $$ values ('open', null::timestamptz) $$,
  'C opens a request; it starts open'
);
select throws_ok(
  $$ insert into public.access_requests (user_id, plan_code) values (tests.u('client_c'), 'client_premium') $$,
  '23505', null, 'a second open request for the same plan raises 23505'
);
select throws_ok(
  $$ insert into public.access_requests (user_id, plan_code, status) values (tests.u('client_c'), 'trainer_pro', 'granted') $$,
  '42501', null, 'status cannot be supplied'
);
select throws_ok(
  $$ insert into public.access_requests (user_id, plan_code, decided_by) values (tests.u('client_c'), 'trainer_pro', tests.u('client_c')) $$,
  '42501', null, 'decided_by cannot be supplied'
);
select throws_ok(
  $$ insert into public.access_requests (user_id, plan_code) values (tests.u('client_d'), 'client_premium') $$,
  '42501', 'new row violates row-level security policy for table "access_requests"',
  'C cannot request for D'
);
select throws_ok(
  $$ insert into public.access_requests (user_id, plan_code, feature) values (tests.u('client_c'), 'trainer_pro', repeat('x', 65)) $$,
  '23514', null, 'a feature code over 64 characters violates the check'
);
select throws_ok(
  $$ update public.access_requests set status = 'granted', decided_at = now() where user_id = tests.u('client_c') $$,
  '42501', null, 'a user cannot decide the own request'
);
select throws_ok(
  $$ delete from public.access_requests where user_id = tests.u('client_c') $$, '42501', null,
  'a user cannot delete a request'
);

select tests.authenticate_as('client_d');
select is_empty($$ select 1 from public.access_requests $$, 'D reads 0 of C''s requests');
select lives_ok(
  $$ insert into public.access_requests (user_id, plan_code) values (tests.u('client_d'), 'client_premium') $$,
  'D opens its own request'
);

select tests.authenticate_as('admin_x');
select results_eq($$ select count(*)::integer from public.access_requests $$, $$ values (2) $$, 'the admin reads every request');

-- After the admin RPC decides, a new request may be opened.
select tests.clear_authentication();
update public.access_requests set status = 'declined', decided_at = now(), decided_by = tests.u('admin_x')
where user_id = tests.u('client_c');
select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.access_requests (user_id, plan_code) values (tests.u('client_c'), 'client_premium') $$,
  'a new request is allowed once the previous one is decided'
);

-- ---------------------------------------------------------------------------------------------------------
-- has_entitlement and effective_plan (PLAN-6)

select tests.authenticate_as('client_c');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends'), false, 'no grant gives false');
select is(public.effective_plan(tests.u('client_c'), 'client'), 'client_free', 'effective_plan defaults to client_free');
select throws_ok(
  $$ select public.has_entitlement(tests.u('client_d'), 'client.trends') $$, '42501', 'forbidden',
  'C asking about D raises forbidden'
);
select throws_ok(
  $$ select public.effective_plan(tests.u('client_d'), 'client') $$, '42501', 'forbidden',
  'C asking for D''s plan raises forbidden'
);
select throws_ok(
  $$ select public.has_entitlement(null, 'client.trends') $$, '42501', 'forbidden',
  'a NULL user counts as someone else'
);

select tests.authenticate_as('premium_p');
select is(public.has_entitlement(tests.u('premium_p'), 'client.trends'), true, 'an active client_premium gives client.trends');
select is(public.has_entitlement(tests.u('premium_p'), 'client.self_training'), true, 'and client.self_training');
select is(public.has_entitlement(tests.u('premium_p'), 'trainer.analytics'), false, 'but no trainer feature');
select is(public.effective_plan(tests.u('premium_p'), 'client'), 'client_premium', 'effective_plan returns client_premium');
select is(public.effective_plan(tests.u('premium_p'), 'trainer'), 'trainer_free', 'a client plan does not change the trainer side');

select tests.authenticate_as('expired_x');
select is(public.has_entitlement(tests.u('expired_x'), 'client.trends'), false, 'an expired grant gives false');
select is(public.effective_plan(tests.u('expired_x'), 'client'), 'client_free', 'an expired grant falls back to client_free');

select tests.authenticate_as('revoked_r');
select is(public.has_entitlement(tests.u('revoked_r'), 'client.trends'), false, 'a revoked grant gives false');
select is(public.effective_plan(tests.u('revoked_r'), 'client'), 'client_free', 'a revoked grant falls back to client_free');

select tests.authenticate_as('future_u');
select is(public.has_entitlement(tests.u('future_u'), 'client.trends'), false, 'a grant starting tomorrow gives false');

select tests.authenticate_as('trainer_b');
select is(public.effective_plan(tests.u('trainer_b'), 'trainer'), 'trainer_free', 'effective_plan defaults to trainer_free');

select tests.authenticate_as('trainer_a');
select is(public.effective_plan(tests.u('trainer_a'), 'trainer'), 'trainer_pro', 'an active Pro grant gives trainer_pro');
select is(public.has_entitlement(tests.u('trainer_a'), 'trainer.unlimited_clients'), true, 'Pro gives unlimited clients');
select throws_ok(
  $$ select public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_ac')) $$, '42501', 'forbidden',
  'a trainer cannot probe a client''s entitlements'
);

select tests.authenticate_as('admin_x');
select is(public.has_entitlement(tests.u('premium_p'), 'client.trends'), true, 'the admin may ask about anyone');
select is(public.effective_plan(tests.u('trainer_a'), 'trainer'), 'trainer_pro', 'the admin reads anyone''s plan');

select tests.authenticate_as_service_role();
select is(public.has_entitlement(tests.u('premium_p'), 'client.trends'), true, 'server code may ask about anyone');

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.has_entitlement(tests.u('premium_p'), 'client.trends') $$, '42501', null, 'anon cannot call has_entitlement'
);
select throws_ok(
  $$ select public.effective_plan(tests.u('premium_p'), 'client') $$, '42501', null, 'anon cannot call effective_plan'
);

select tests.clear_authentication();
select is(private.has_entitlement(null, 'client.trends'), false, 'the private check returns false, not NULL, for no user');

-- ---------------------------------------------------------------------------------------------------------
-- Free trainer limit (PLAN-1, Q56, R85)

select is(private.active_client_count(tests.u('trainer_f')), 3,
  'active_client_count counts trial and active pairs and the card, not the ended pair or the stub');
select is(private.active_client_count(tests.u('trainer_b')), 1, 'B has one live client');
select throws_ok(
  $$ select private.assert_can_add_client(tests.u('trainer_f')) $$, 'P0001', 'plan_limit_reached',
  'a Free trainer at 3 live clients cannot add a fourth'
);
select lives_ok($$ select private.assert_can_add_client(tests.u('trainer_b')) $$, 'a Free trainer below the limit may add one');
select lives_ok(
  $$ select private.assert_can_add_client(tests.u('trainer_a')) $$, 'a Pro trainer may add clients'
);
select throws_ok(
  $$ select private.assert_can_add_client(tests.u('client_c')) $$, 'P0001', 'not_a_trainer',
  'a user without a trainer profile raises not_a_trainer'
);
-- Ending a pair frees a place for a Free trainer.
update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_f', 'client_d');
select is(private.active_client_count(tests.u('trainer_f')), 2, 'an ended pair no longer counts');
select lives_ok($$ select private.assert_can_add_client(tests.u('trainer_f')) $$, 'so the Free trainer may add one again');

-- An expired Pro does not lift the limit; an active one does.
update public.coachings set status = 'active', ended_at = null where id = tests.pair_id('trainer_f', 'client_d');
select tests.grant_plan('trainer_f', 'trainer_pro', now() - interval '60 days', now() - interval '30 days');
select throws_ok(
  $$ select private.assert_can_add_client(tests.u('trainer_f')) $$, 'P0001', 'plan_limit_reached',
  'an expired Pro grant does not lift the limit'
);
select tests.grant_plan('trainer_f', 'trainer_pro');
select lives_ok($$ select private.assert_can_add_client(tests.u('trainer_f')) $$, 'the same trainer passes with an active Pro');

-- ---------------------------------------------------------------------------------------------------------
-- Inherited rights (PLAN-3, Q58, R58)

select tests.authenticate_as('client_c');
select is(public.has_entitlement(tests.u('client_c'), 'client.progress_photos_unlimited', tests.i('pair_ac')), true,
  'C gets unlimited progress photos in the live pair with a Pro trainer');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_ac')), true,
  'C gets trends in that pair');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends'), false, 'without the pair there is no inherited right');
select is(public.has_entitlement(tests.u('client_c'), 'client.self_training', tests.i('pair_ac')), false,
  'client.self_training is not inherited');
select is(public.has_entitlement(tests.u('client_c'), 'client.nutrition_advanced', tests.i('pair_ac')), false,
  'client.nutrition_advanced is not inherited in wave 1');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_bc')), false,
  'nothing is inherited from a Free trainer');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_ad')), false,
  'C cannot use the pair of another client');
select is(public.effective_plan(tests.u('client_c'), 'client'), 'client_free', 'inherited rights do not change the plan');

select tests.authenticate_as('client_d');
select is(public.has_entitlement(tests.u('client_d'), 'client.trends', tests.i('pair_ac')), false,
  'D cannot borrow C''s pair');
select is(public.has_entitlement(tests.u('client_d'), 'client.trends', tests.i('pair_ad')), true,
  'D inherits in its own pair with A');

select tests.authenticate_as('client_e');
select is(public.has_entitlement(tests.u('client_e'), 'client.trends', tests.i('pair_ae')), false,
  'an ended pair inherits nothing');

-- A trial pair is live (R58).
select tests.clear_authentication();
select tests.grant_plan('trainer_b', 'trainer_pro');
select tests.authenticate_as('client_c');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_bc')), true,
  'a trial pair with a Pro trainer inherits');

-- Ending the A-D pair and revoking A's Pro take the rights away.
select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = tests.i('pair_ad');
select tests.authenticate_as('client_d');
select is(public.has_entitlement(tests.u('client_d'), 'client.trends', tests.i('pair_ad')), false,
  'the right ends with the pair');

select tests.clear_authentication();
update public.plan_grants set revoked_at = now(), revoked_by = tests.u('admin_x'), revoke_reason = 'end of beta trial'
where id = tests.i('grant_a');
select tests.authenticate_as('client_c');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_ac')), false,
  'the right ends when the trainer''s Pro is revoked');
select is(public.has_entitlement(tests.u('client_c'), 'client.trends', tests.i('pair_bc')), true,
  'the other trainer''s Pro still applies in its own pair');

select tests.authenticate_as('trainer_a');
select is(public.effective_plan(tests.u('trainer_a'), 'trainer'), 'trainer_free', 'A is back on trainer_free');

-- ---------------------------------------------------------------------------------------------------------
-- Cascades: the revocation columns may change; account deletion clears granted_by or removes the grants.

select tests.clear_authentication();
select results_eq(
  $$ select revoked_by, revoke_reason from public.plan_grants where id = tests.i('grant_a') $$,
  $$ values (tests.u('admin_x'), 'end of beta trial') $$,
  'setting the revocation columns passes the append-only trigger'
);
delete from auth.users where id = tests.u('admin_g');
select results_eq(
  $$ select granted_by from public.plan_grants where id = tests.i('grant_a') $$, $$ values (null::uuid) $$,
  'deleting the granting admin keeps the grant with granted_by NULL'
);
delete from auth.users where id = tests.u('premium_p');
select is_empty($$ select 1 from public.plan_grants where id = tests.i('grant_p') $$,
  'deleting the holder''s account removes its grants by cascade');

-- ---------------------------------------------------------------------------------------------------------
-- Catalog

select policies_are('public', 'plans', array['plans: signed-in users read'], 'plans has only a read policy');
select policies_are('public', 'plan_grants', array['plan_grants: owner or admin reads'], 'plan_grants has only a read policy');
select policies_are('public', 'access_requests',
  array['access_requests: owner or admin reads', 'access_requests: owner inserts'], 'access_requests policies');
select is(
  array(
    select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.oid in ('public.has_entitlement(uuid, text, uuid)'::regprocedure,
                    'public.effective_plan(uuid, public.plan_side)'::regprocedure,
                    'private.has_entitlement(uuid, text, uuid)'::regprocedure,
                    'private.assert_can_add_client(uuid)'::regprocedure)
      and not (p.prosecdef and p.proconfig = array['search_path=""'])
  ),
  '{}'::text[],
  'the entitlement functions are security definer with an empty search_path'
);
select ok(
  (select not p.prosecdef and p.provolatile = 's' and p.prosqlbody is not null from pg_catalog.pg_proc p
   where p.oid = 'private.active_client_count(uuid)'::regprocedure),
  'active_client_count is a stable invoker function with a pre-parsed body'
);
select ok(
  has_function_privilege('authenticated', 'public.has_entitlement(uuid, text, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.effective_plan(uuid, public.plan_side)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.has_entitlement(uuid, text, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.active_client_count(uuid)', 'EXECUTE'),
  'authenticated may execute the public functions and the two private ones that RLS may call'
);
select ok(
  not has_function_privilege('authenticated', 'private.assert_can_add_client(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.assert_can_add_client(uuid)', 'EXECUTE'),
  'only the owner (pair RPCs) may execute assert_can_add_client'
);

-- active_client_count may sit in a policy: it runs as the caller without USAGE on schema private.
create table tests.limit_probe (id integer primary key);
alter table tests.limit_probe enable row level security;
create policy "limit_probe: counted" on tests.limit_probe for select to authenticated
  using (private.active_client_count(tests.user_id('trainer_f')) >= 0);
grant select on tests.limit_probe to authenticated;
grant select on public.coachings to authenticated;  -- the pairs policies migration grants this too
insert into tests.limit_probe values (1);
select tests.authenticate_as('trainer_f');
select results_eq($$ select count(*)::integer from tests.limit_probe $$, $$ values (1) $$,
  'a policy calling active_client_count works for a signed-in user');

select * from finish();
rollback;

-- People tables (migration 20261015123000_people_policies.sql; contract §1.4 file 14, §6 100_people):
-- profiles, user_settings, the public_profiles view, notification_preferences, user_roles, consents,
-- account_deletions and data_exports.
-- A user without the privilege gets 42501 before RLS runs, so blocked writes on tables with no write grant
-- raise instead of changing 0 rows.
begin;
\ir _helpers.psql
select plan(102);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A, M is A's card, A has an
-- ended pair to the deleted-client stub. X is an admin with a live break-glass grant on C for every category.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_en', null, '{}', 'en-US');
select tests.create_admin('admin_x');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_card('trainer_a', 'card_m');
select tests.create_deleted_stub();
select tests.create_pair('trainer_a', 'deleted_client', 'ended');
select tests.create_break_glass('admin_x', 'client_c', enum_range(null::public.share_category));

insert into public.account_deletions (user_id, scheduled_for) values (tests.user_id('client_c'), now() + interval '30 days');
insert into public.data_exports (user_id) values (tests.user_id('client_c'));
insert into public.consents (user_id, kind, version) values (tests.user_id('client_d'), 'beta_terms', '2026-11-beta');
insert into public.notification_preferences (user_id, type, enabled)
values (tests.user_id('client_d'), 'session_reminder', false);

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Ids of the profiles the caller can read, sorted.
create function tests.visible_profiles() returns uuid[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(p.id order by p.id), '{}') from public.profiles p
$$;

create function tests.sorted_ids(variadic p_handles text[]) returns uuid[] language sql stable set search_path = '' as $$
  select array_agg(tests.user_id(h) order by tests.user_id(h)) from unnest(p_handles) h
$$;

-- ---------------------------------------------------------------------------------------------------------
-- profiles

select tests.authenticate_as('client_c');

select is(tests.visible_profiles(), tests.sorted_ids('client_c', 'trainer_a', 'trainer_b'),
  'C reads exactly its own profile and both trainers');
select throws_ok($$ select telegram_id from public.profiles where id = tests.u('client_c') $$, '42501', null,
  'telegram_id is not readable, not even on the own row');
select throws_ok($$ select bot_blocked_at from public.profiles where id = tests.u('client_c') $$, '42501', null,
  'bot_blocked_at is not readable');
select throws_ok($$ select claimed_by from public.profiles $$, '42501', null, 'claimed_by is not readable');
select throws_ok($$ select blocked_reason from public.profiles $$, '42501', null, 'blocked_reason is not readable');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'select * fails because of the hidden columns');
select is_empty($$ select 1 from public.profiles where id = tests.u('client_d') $$, 'C reads 0 rows of D (both clients of A)');
select is_empty($$ select 1 from public.profiles where id = tests.u('card_m') $$, 'C reads 0 rows of the card of its trainer');
select throws_ok(
  $$ insert into public.profiles (id, first_name) values (tests.u('client_c'), 'x') $$, '42501', null,
  'a user cannot insert a profile');
select throws_ok($$ update public.profiles set first_name = 'x' where id = tests.u('client_c') $$, '42501', null,
  'a user cannot update even the own profile');
select throws_ok($$ delete from public.profiles where id = tests.u('client_c') $$, '42501', null,
  'a user cannot delete a profile');

select tests.authenticate_as('client_d');
select is_empty($$ select 1 from public.profiles where id = tests.u('client_c') $$, 'D reads 0 rows of C');
select is(tests.visible_profiles(), tests.sorted_ids('client_d', 'trainer_a'), 'D reads only itself and A');

select tests.authenticate_as('client_e');
select is(tests.visible_profiles(), tests.sorted_ids('client_e', 'trainer_a'), 'E still reads A after the pair ended');

select tests.authenticate_as('trainer_a');
select is(
  tests.visible_profiles(),
  tests.sorted_ids('trainer_a', 'client_c', 'client_d', 'client_e', 'card_m', 'deleted_client'),
  'A reads itself, live and ended clients, its card and the stub of an anonymized pair'
);
select results_eq(
  $$ select managed_by_trainer_id from public.profiles where id = tests.u('card_m') $$,
  $$ values (tests.u('trainer_a')) $$,
  'A reads the card with its trainer column'
);

select tests.authenticate_as('trainer_b');
select is(tests.visible_profiles(), tests.sorted_ids('trainer_b', 'client_c'), 'B reads only itself and its client C');
select is_empty($$ select 1 from public.profiles where id = tests.u('card_m') $$, 'B reads 0 rows of A''s card');
select is_empty($$ select 1 from public.profiles where id = tests.u('client_d') $$, 'B reads 0 rows of A''s other client');

select tests.authenticate_as('stranger_s');
select is(tests.visible_profiles(), tests.sorted_ids('stranger_s'), 'S reads only its own profile');
select is_empty($$ select 1 from public.profiles where id = tests.u('card_m') $$, 'S reads 0 rows of the card');

select tests.authenticate_as('admin_x');
select is(
  tests.visible_profiles(),
  tests.sorted_ids('trainer_a', 'trainer_b', 'client_c', 'client_d', 'client_e', 'client_en', 'admin_x', 'stranger_s'),
  'the admin reads every account but no card and not the stub'
);
select is_empty($$ select 1 from public.profiles where id = tests.u('card_m') $$, 'the admin reads 0 rows of the card (PAIR-10)');
select throws_ok($$ select telegram_id from public.profiles $$, '42501', null, 'the admin cannot read telegram_id either');

select tests.authenticate_as_anon();
select throws_ok($$ select id from public.profiles $$, '42501', null, 'anon cannot read profiles');

select tests.clear_authentication();
select throws_ok(
  $$ update public.profiles set telegram_id = null where id = tests.u('stranger_s') $$,
  '23514', 'new row for relation "profiles" violates check constraint "profiles_identity_check"',
  'a plain profile without telegram_id violates profiles_identity_check'
);

-- ---------------------------------------------------------------------------------------------------------
-- user_settings

select results_eq(
  $$ select locale::text from public.user_settings where user_id = tests.u('stranger_s') $$, $$ values ('ru') $$,
  'create_user gets a settings row with locale ru'
);
select results_eq(
  $$ select locale::text from public.user_settings where user_id = tests.u('client_en') $$, $$ values ('en') $$,
  'language_code en-US gives locale en'
);
select results_eq(
  $$ select quiet_hours_start, quiet_hours_end, daily_digest_time from public.user_settings where user_id = tests.u('stranger_s') $$,
  $$ values ('22:00'::time, '08:00'::time, '08:00'::time) $$,
  'quiet hours default to 22:00-08:00 and the digest to 08:00'
);

select tests.authenticate_as('client_c');
select results_eq(
  $$ update public.user_settings set time_zone = 'Asia/Yerevan' where user_id = tests.u('client_c') returning time_zone::text $$,
  $$ values ('Asia/Yerevan') $$,
  'the owner updates time_zone'
);
select results_eq(
  $$ select time_zone::text from public.profiles where id = tests.u('client_c') $$, $$ values ('Asia/Yerevan') $$,
  'the profiles mirror follows the new time zone'
);
select results_eq(
  $$ update public.user_settings set avatar_path = tests.u('client_c') || '/avatar.webp' where user_id = tests.u('client_c')
     returning avatar_path $$,
  $$ values (tests.u('client_c') || '/avatar.webp') $$,
  'the owner sets an avatar in the own folder'
);
select is_empty(
  $$ update public.user_settings set locale = 'en' where user_id = tests.u('client_d') returning 1 $$,
  'updating another user''s settings changes 0 rows'
);
select throws_ok(
  $$ update public.user_settings set user_id = tests.u('client_d') where user_id = tests.u('client_c') $$, '42501', null,
  'user_id is not updatable'
);
select throws_ok(
  $$ insert into public.user_settings (user_id) values (tests.u('client_c')) $$, '42501', null,
  'a user cannot insert a settings row'
);
select throws_ok(
  $$ delete from public.user_settings where user_id = tests.u('client_c') $$, '42501', null,
  'a user cannot delete the settings row'
);
select throws_ok(
  $$ update public.user_settings set avatar_path = 'other/x.webp' where user_id = tests.u('client_c') $$,
  '23514', 'new row for relation "user_settings" violates check constraint "user_settings_avatar_path_check"',
  'an avatar outside the own folder violates the check'
);
select throws_ok(
  $$ update public.user_settings set quiet_hours_start = null where user_id = tests.u('client_c') $$,
  '23514', 'new row for relation "user_settings" violates check constraint "user_settings_quiet_hours_check"',
  'a single quiet-hours bound violates the check'
);
select results_eq(
  $$ update public.user_settings set quiet_hours_start = null, quiet_hours_end = null where user_id = tests.u('client_c')
     returning quiet_hours_start, quiet_hours_end $$,
  $$ values (null::time, null::time) $$,
  'clearing both bounds turns quiet hours off'
);

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.user_settings set display_name = 'Anna Coach' where user_id = tests.u('trainer_a') returning display_name $$,
  $$ values ('Anna Coach') $$,
  'A sets a display name'
);
select is_empty($$ select 1 from public.user_settings where user_id = tests.u('client_c') $$,
  'the pair partner A reads 0 rows of C''s settings');

select tests.authenticate_as('admin_x');
select is_empty($$ select 1 from public.user_settings where user_id = tests.u('client_c') $$,
  'the admin reads 0 rows of C''s settings, even with a live break-glass grant');

-- ---------------------------------------------------------------------------------------------------------
-- public_profiles (created by the views migration, 20261015125000_views.sql; skipped until it exists)

select tests.authenticate_as('client_c');
select case when to_regclass('public.public_profiles') is null
  then skip('public_profiles comes with the views migration')
  else results_eq(
    $$ select display_name from public.public_profiles where id = tests.u('trainer_a') $$, $$ values ('Anna Coach'::text) $$,
    'a pair partner sees the display name set in settings')
  end;

select tests.authenticate_as('trainer_a');
select case when to_regclass('public.public_profiles') is null
  then skip('public_profiles comes with the views migration')
  else results_eq(
    $$ select display_name from public.public_profiles where id = tests.u('client_d') $$, $$ values ('client_d'::text) $$,
    'with no display name and no last name the first name alone is shown')
  end;

select tests.authenticate_as('stranger_s');
select case when to_regclass('public.public_profiles') is null
  then skip('public_profiles comes with the views migration')
  else is_empty($$ select 1 from public.public_profiles where id = tests.u('trainer_a') $$,
    'a stranger reads 0 rows of public_profiles')
  end;

select tests.clear_authentication();
select case when to_regclass('public.public_profiles') is null
  then skip('public_profiles comes with the views migration')
  else hasnt_column('public', 'public_profiles', 'telegram_id', 'public_profiles has no telegram_id column')
  end;

-- ---------------------------------------------------------------------------------------------------------
-- notification_preferences

select tests.authenticate_as('client_c');
select results_eq(
  $$ insert into public.notification_preferences (user_id, type, enabled) values (tests.u('client_c'), 'booking_created', false)
     returning enabled $$,
  $$ values (false) $$,
  'the owner switches an optional type off'
);
select results_eq(
  $$ update public.notification_preferences set enabled = true where user_id = tests.u('client_c') and type = 'booking_created'
     returning enabled $$,
  $$ values (true) $$,
  'the owner switches it back on'
);
select results_eq(
  $$ delete from public.notification_preferences where user_id = tests.u('client_c') and type = 'booking_created' returning type::text $$,
  $$ values ('booking_created') $$,
  'the owner deletes the override'
);
select throws_ok(
  $$ insert into public.notification_preferences (user_id, type, enabled) values (tests.u('client_c'), 'contact_request', false) $$,
  '23514', 'new row for relation "notification_preferences" violates check constraint "notification_preferences_mandatory_check"',
  'a mandatory type cannot be switched off'
);
select lives_ok(
  $$ insert into public.notification_preferences (user_id, type, enabled) values (tests.u('client_c'), 'contact_request', true) $$,
  'a mandatory type may be stored as on'
);
select throws_ok(
  $$ insert into public.notification_preferences (user_id, type, enabled) values (tests.u('client_d'), 'booking_created', false) $$,
  '42501', 'new row violates row-level security policy for table "notification_preferences"',
  'inserting for another user fails RLS'
);
select throws_ok(
  $$ update public.notification_preferences set type = 'debt' where user_id = tests.u('client_c') $$, '42501', null,
  'type is not updatable'
);
select is_empty($$ select 1 from public.notification_preferences where user_id = tests.u('client_d') $$,
  'C reads 0 of D''s overrides');
select is_empty(
  $$ update public.notification_preferences set enabled = true where user_id = tests.u('client_d') returning 1 $$,
  'C updates 0 of D''s overrides'
);

select tests.authenticate_as('admin_x');
select is_empty($$ select 1 from public.notification_preferences $$, 'the admin reads no overrides of other users');

-- ---------------------------------------------------------------------------------------------------------
-- user_roles

select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ insert into public.user_roles (user_id, role) values (tests.u('stranger_s'), 'admin') $$, '42501', null,
  'S cannot make itself an admin'
);
select is_empty($$ select 1 from public.user_roles $$, 'a non-admin sees no role rows of others');

select tests.clear_authentication();
select is_empty($$ select 1 from public.user_roles where user_id = tests.u('stranger_s') $$, 'S still has no role');
select tests.create_admin('admin_y');
select tests.authenticate_as('admin_y');
select results_eq($$ select user_id from public.user_roles where role = 'admin' order by user_id $$,
  $$ select id from tests.users where handle in ('admin_x', 'admin_y') order by id $$,
  'an admin sees every role row'
);
select throws_ok(
  $$ insert into public.user_roles (user_id, role) values (tests.u('client_c'), 'admin') $$, '42501', null,
  'an admin cannot grant a role directly (admin RPC only)'
);
select throws_ok(
  $$ delete from public.user_roles where user_id = tests.u('admin_x') $$, '42501', null,
  'an admin cannot revoke a role directly'
);

-- ---------------------------------------------------------------------------------------------------------
-- consents

select tests.authenticate_as('client_c');
select results_eq(
  $$ insert into public.consents (user_id, kind, version) values (tests.u('client_c'), 'beta_terms', '2026-11-beta')
     returning accepted_at = now(), revoked_at is null $$,
  $$ values (true, true) $$,
  'C accepts the beta terms; accepted_at is now()'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version, accepted_at) values (tests.u('client_c'), 'privacy_policy', 'v1', '2020-01-01') $$,
  '42501', null,
  'accepted_at cannot be supplied'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version) values (tests.u('client_d'), 'privacy_policy', 'v1') $$,
  '42501', 'new row violates row-level security policy for table "consents"',
  'C cannot accept for D'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version) values (tests.u('client_c'), 'beta_terms', '2026-11-beta') $$,
  '23505', null,
  'a second active consent of the same version raises 23505'
);
select throws_ok(
  $$ update public.consents set version = 'v2' where user_id = tests.u('client_c') $$, '42501', null,
  'version is not updatable'
);
select results_eq(
  $$ update public.consents set revoked_at = '2000-01-01' where user_id = tests.u('client_c') and kind = 'beta_terms'
     returning revoked_at = now() $$,
  $$ values (true) $$,
  'a revocation is stamped with now(), whatever the client sends'
);
select throws_ok(
  $$ update public.consents set revoked_at = now() where user_id = tests.u('client_c') and kind = 'beta_terms' $$,
  '42501', 'forbidden',
  'a second revocation raises forbidden'
);
select lives_ok(
  $$ insert into public.consents (user_id, kind, version) values (tests.u('client_c'), 'beta_terms', '2026-11-beta') $$,
  'the same version can be accepted again after a revocation'
);
select throws_ok(
  $$ delete from public.consents where user_id = tests.u('client_c') $$, '42501', null,
  'a user cannot delete consents'
);
select is_empty($$ select 1 from public.consents where user_id = tests.u('client_d') $$, 'C reads 0 of D''s consents');
select is_empty(
  $$ update public.consents set revoked_at = now() where user_id = tests.u('client_d') returning 1 $$,
  'C revokes 0 of D''s consents'
);

select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.consents where user_id = tests.u('client_c') $$, 'S reads 0 of C''s consents');

select tests.authenticate_as('admin_x');
select results_eq(
  $$ select count(*)::integer from public.consents where user_id = tests.u('client_c') $$, $$ values (2) $$,
  'the admin reads C''s consents'
);

-- The guard binds only direct API calls; server code sets the revocation time it needs.
select tests.authenticate_as_service_role();
select results_eq(
  $$ update public.consents set revoked_at = now() + interval '1 hour' where user_id = tests.u('client_d')
     returning revoked_at = now() + interval '1 hour' $$,
  $$ values (true) $$,
  'service_role keeps the revocation time it sends'
);

-- ---------------------------------------------------------------------------------------------------------
-- account_deletions and data_exports

select tests.authenticate_as('client_c');
select results_eq($$ select user_id from public.account_deletions $$, $$ values (tests.u('client_c')) $$,
  'the owner reads the own deletion request');
select results_eq($$ select user_id from public.data_exports $$, $$ values (tests.u('client_c')) $$,
  'the owner reads the own export');
select throws_ok(
  $$ insert into public.account_deletions (user_id, scheduled_for) values (tests.u('client_c'), now() + interval '30 days') $$,
  '42501', null, 'a user cannot insert a deletion request directly'
);
select throws_ok(
  $$ update public.account_deletions set cancelled_at = now() where user_id = tests.u('client_c') $$,
  '42501', null, 'a user cannot cancel the deletion directly'
);
select throws_ok(
  $$ delete from public.account_deletions where user_id = tests.u('client_c') $$,
  '42501', null, 'a user cannot delete the deletion request'
);
select throws_ok(
  $$ insert into public.data_exports (user_id) values (tests.u('client_c')) $$,
  '42501', null, 'a user cannot insert an export directly'
);
select throws_ok(
  $$ update public.data_exports set status = 'ready' where user_id = tests.u('client_c') $$,
  '42501', null, 'a user cannot update an export'
);

select tests.authenticate_as('trainer_a');
select results_eq($$ select user_id from public.account_deletions $$, $$ values (tests.u('client_c')) $$,
  'the pair partner A reads C''s deletion request');
select is_empty($$ select 1 from public.data_exports $$, 'the pair partner A reads 0 exports of C');

select tests.authenticate_as('client_d');
select is_empty($$ select 1 from public.account_deletions $$, 'D (another client of A) reads 0 deletion rows');

select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.account_deletions $$, 'S reads 0 deletion rows');

select tests.authenticate_as('admin_x');
select results_eq($$ select user_id from public.account_deletions $$, $$ values (tests.u('client_c')) $$,
  'the admin reads deletion requests');
select is_empty($$ select 1 from public.data_exports $$,
  'the admin reads 0 exports, even with a live break-glass grant on C');

-- After the A-E pair ended, A still reads E's deletion label (any pair status, R10).
select tests.clear_authentication();
insert into public.account_deletions (user_id, scheduled_for) values (tests.u('client_e'), now() + interval '30 days');
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select count(*)::integer from public.account_deletions where user_id = tests.u('client_e') $$, $$ values (1) $$,
  'A reads the deletion label of a client whose pair ended'
);
select tests.authenticate_as('trainer_b');
select is_empty($$ select 1 from public.account_deletions where user_id = tests.u('client_e') $$,
  'B reads 0 deletion rows of A''s former client');

-- ---------------------------------------------------------------------------------------------------------
-- Catalog: the policies and the guard

select tests.clear_authentication();
select policies_are('public', 'profiles', array['profiles: read self, pair partners, own cards, admins'],
  'profiles has only the new read policy');
select policies_are('public', 'user_settings', array['user_settings: owner reads', 'user_settings: owner updates'],
  'user_settings policies');
select policies_are('public', 'notification_preferences', array['notification_preferences: owner manages'],
  'notification_preferences has one FOR ALL policy');
select policies_are('public', 'user_roles', array['user_roles: owner or admin reads'], 'user_roles has only a read policy');
select policies_are('public', 'consents',
  array['consents: owner or admin reads', 'consents: owner inserts', 'consents: owner revokes'], 'consents policies');
select policies_are('public', 'account_deletions', array['account_deletions: owner, pair partners, admins read'],
  'account_deletions has only a read policy');
select policies_are('public', 'data_exports', array['data_exports: owner reads'], 'data_exports has only a read policy');
select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('profiles', 'user_settings', 'notification_preferences', 'user_roles', 'consents',
                        'account_deletions', 'data_exports')
      and has_table_privilege('authenticated', c.oid, 'DELETE')
    order by 1
  ),
  array['notification_preferences'],
  'only notification_preferences grants DELETE'
);
select is(
  array(
    select a.attname::text from pg_catalog.pg_attribute a
    where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
      and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
    order by 1
  ),
  array['blocked_at', 'blocked_reason', 'bot_blocked_at', 'bot_started_at', 'claimed_by', 'telegram_id'],
  'exactly the server-only profiles columns are hidden'
);
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=""'] from pg_catalog.pg_proc p
   where p.oid = 'private.consents_guard_revocation()'::regprocedure),
  'the consents guard is security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('authenticated', 'private.consents_guard_revocation()', 'EXECUTE'),
  'nobody signed in may execute the guard function directly'
);

select * from finish();
rollback;

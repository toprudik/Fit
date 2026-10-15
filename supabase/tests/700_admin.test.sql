-- Admin tables of migration 20261015123900_admin_policies.sql (contract §1.4 file 23, §6 700_admin):
-- feedback, reports, admin_audit_log, break_glass_grants, and the audit triggers on admin updates (R47).
begin;
\ir _helpers.psql
select plan(89);

-- Fixtures: two admins, plain users C and D (no pairs, so C's account can be deleted at the end), trainers
-- A and B, and a live pair A-D so that D's trainer can be checked too.
select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_pair('trainer_a', 'client_d');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Feedback ids are chosen by the app before the insert, so screenshots can go to <user>/<id>/ first.
insert into tests.ids values
  ('fb_c', gen_random_uuid()),
  ('fb_c2', gen_random_uuid()),
  ('fb_d', gen_random_uuid()),
  ('fb_a', gen_random_uuid()),
  ('fb_bad', gen_random_uuid());

-- Audit rows written in this transaction, read as postgres.
create function tests.audit(p_action text, p_target uuid) returns bigint language sql stable set search_path = '' as $$
  select count(*) from public.admin_audit_log l where l.action = p_action and l.target_id = p_target
$$;

-- ---------------------------------------------------------------------------------------------------------
-- anon gets nothing on any admin table.
select tests.authenticate_as_anon();
select throws_ok($$ select 1 from public.feedback $$, '42501', null, 'anon cannot read feedback');
select throws_ok($$ select 1 from public.reports $$, '42501', null, 'anon cannot read reports');
select throws_ok($$ select 1 from public.admin_audit_log $$, '42501', null, 'anon cannot read admin_audit_log');
select throws_ok($$ select 1 from public.break_glass_grants $$, '42501', null, 'anon cannot read break_glass_grants');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- feedback: insert
select tests.authenticate_as('client_c');

select lives_ok(
  format($$
    insert into public.feedback (id, user_id, zone, kind, body, route, platform, app_version, locale, theme, attachment_paths)
    values (%L, %L, 'client', 'bug', 'The book button does nothing', '/c/schedule', 'tma-android', '0.1.0', 'ru', 'dark',
            array[%L])
  $$, tests.i('fb_c'), tests.u('client_c'), tests.u('client_c') || '/' || tests.i('fb_c') || '/1.webp'),
  'C sends feedback with a screenshot in their own folder'
);

select results_eq(
  format($$ select user_id, status::text, github_issue_url from public.feedback where id = %L $$, tests.i('fb_c')),
  format($$ values (%L::uuid, 'new', null::text) $$, tests.u('client_c')),
  'a new message is "new", belongs to C and has no issue link'
);

-- user_id defaults to the caller.
select lives_ok(
  format($$ insert into public.feedback (id, kind, body) values (%L, 'idea', 'Dark theme for charts') $$, tests.i('fb_c2')),
  'C sends feedback without naming user_id'
);
select is(
  (select user_id from public.feedback where id = tests.i('fb_c2')),
  tests.u('client_c'),
  'user_id defaults to the caller'
);

select throws_ok(
  format($$ insert into public.feedback (user_id, kind, body) values (%L, 'bug', 'Sent in D''s name') $$, tests.u('client_d')),
  '42501', 'new row violates row-level security policy for table "feedback"',
  'C cannot send feedback in another user''s name'
);
select throws_ok(
  $$ insert into public.feedback (kind, body, status) values ('bug', 'Already closed', 'closed') $$,
  '42501', null,
  'C cannot choose the status (no column grant)'
);
select throws_ok(
  $$ insert into public.feedback (kind, body, github_issue_url) values ('bug', 'Linked', 'https://github.com/toprudik/fit/issues/1') $$,
  '42501', null,
  'C cannot set the issue link (no column grant)'
);
select throws_ok(
  format($$ insert into public.feedback (id, kind, body, attachment_paths) values (%L, 'bug', 'Four screenshots', array[%L, %L, %L, %L]) $$,
    tests.i('fb_bad'),
    tests.u('client_c') || '/' || tests.i('fb_bad') || '/1.webp', tests.u('client_c') || '/' || tests.i('fb_bad') || '/2.webp',
    tests.u('client_c') || '/' || tests.i('fb_bad') || '/3.webp', tests.u('client_c') || '/' || tests.i('fb_bad') || '/4.webp'),
  '23514', null,
  'at most 3 screenshots'
);
select throws_ok(
  $$ insert into public.feedback (kind, body) values ('bug', '') $$,
  '23514', null,
  'an empty body violates the check'
);
select throws_ok(
  format($$ insert into public.feedback (id, kind, body, attachment_paths) values (%L, 'bug', 'Foreign path', array[%L]) $$,
    tests.i('fb_bad'), tests.u('client_d') || '/' || tests.i('fb_bad') || '/1.webp'),
  '23514', null,
  'a screenshot outside <C>/<id>/ violates the check'
);
select throws_ok(
  format($$ insert into public.feedback (id, kind, body, attachment_paths) values (%L, 'bug', 'Other message', array[%L]) $$,
    tests.i('fb_bad'), tests.u('client_c') || '/' || tests.i('fb_c') || '/1.webp'),
  '23514', null,
  'a screenshot under another message of the same user violates the check'
);
select throws_ok(
  format($$ insert into public.feedback (id, kind, body, attachment_paths) values (%L, 'bug', 'Dot dot', array[%L]) $$,
    tests.i('fb_bad'), tests.u('client_c') || '/' || tests.i('fb_bad') || '/../x.webp'),
  '23514', null,
  'a screenshot path with ".." violates the check'
);

select tests.authenticate_as('client_d');
select lives_ok(
  format($$ insert into public.feedback (id, kind, body, zone) values (%L, 'other', 'Question about passes', 'client') $$, tests.i('fb_d')),
  'D sends feedback'
);
select tests.authenticate_as('trainer_a');
select lives_ok(
  format($$ insert into public.feedback (id, kind, body, zone) values (%L, 'bug', 'Calendar shows the wrong week', 'trainer') $$, tests.i('fb_a')),
  'trainer A sends feedback'
);

-- feedback: read
select tests.authenticate_as('client_c');
select results_eq(
  $$ select id from public.feedback order by id $$,
  format($$ select x from unnest(array[%L, %L]::uuid[]) x order by x $$, tests.i('fb_c'), tests.i('fb_c2')),
  'C reads exactly their own two messages'
);
select tests.authenticate_as('client_d');
select results_eq(
  $$ select id from public.feedback $$,
  format($$ values (%L::uuid) $$, tests.i('fb_d')),
  'D reads only their own message'
);
select tests.authenticate_as('trainer_a');
select is_empty(
  format($$ select 1 from public.feedback where id = %L $$, tests.i('fb_d')),
  'D''s trainer does not read D''s feedback'
);
select tests.authenticate_as('trainer_b');
select is_empty(
  format($$ select 1 from public.feedback where id = %L $$, tests.i('fb_a')),
  'trainer B does not read trainer A''s feedback'
);
select tests.authenticate_as('admin_x');
select is(
  (select count(*) from public.feedback where id in (tests.i('fb_c'), tests.i('fb_c2'), tests.i('fb_d'), tests.i('fb_a'))),
  4::bigint,
  'the admin reads every message'
);

-- feedback: update and delete
select tests.authenticate_as('client_c');
select is_empty(
  format($$ update public.feedback set status = 'closed' where id = %L returning 1 $$, tests.i('fb_c')),
  'C''s update of own feedback changes 0 rows'
);
select throws_ok(
  format($$ update public.feedback set body = 'edited' where id = %L $$, tests.i('fb_c')),
  '42501', null,
  'C cannot edit the body (no column grant)'
);
select throws_ok(
  format($$ delete from public.feedback where id = %L $$, tests.i('fb_c')),
  '42501', null,
  'C cannot delete feedback'
);
select tests.clear_authentication();
select is((select status::text from public.feedback where id = tests.i('fb_c')), 'new', 'C''s message is still new');

select tests.authenticate_as('admin_x');
select lives_ok(
  format($$ update public.feedback set status = 'in_progress' where id = %L $$, tests.i('fb_c')),
  'the admin moves C''s message to in_progress'
);
select tests.clear_authentication();
select is((select status::text from public.feedback where id = tests.i('fb_c')), 'in_progress', 'the status changed');
select results_eq(
  format($$ select actor_id, target_type, metadata from public.admin_audit_log where action = 'feedback.update' and target_id = %L $$,
    tests.i('fb_c')),
  format($$ values (%L::uuid, 'feedback', '{"from": "new", "to": "in_progress", "issue": false}'::jsonb) $$, tests.u('admin_x')),
  'one feedback.update audit row with the admin as actor and no personal data'
);

select tests.authenticate_as('admin_x');
select throws_ok(
  format($$ update public.feedback set github_issue_url = 'https://example.com/issue/1' where id = %L $$, tests.i('fb_c')),
  '23514', null,
  'an issue link outside github.com violates the check'
);
select lives_ok(
  format($$ update public.feedback set status = 'closed', github_issue_url = 'https://github.com/toprudik/fit/issues/7' where id = %L $$,
    tests.i('fb_c')),
  'the admin closes the message with an issue link'
);
select throws_ok(
  format($$ update public.feedback set body = 'rewritten' where id = %L $$, tests.i('fb_c')),
  '42501', null,
  'the admin cannot edit the body (no column grant)'
);
select throws_ok(
  format($$ update public.feedback set user_id = %L where id = %L $$, tests.u('admin_x'), tests.i('fb_c')),
  '42501', null,
  'the admin cannot change the author (no column grant)'
);
select throws_ok(
  format($$ delete from public.feedback where id = %L $$, tests.i('fb_c')),
  '42501', null,
  'the admin cannot delete feedback'
);
select tests.clear_authentication();
select is(tests.audit('feedback.update', tests.i('fb_c')), 2::bigint, 'each admin update is audited');
select is(
  (select metadata from public.admin_audit_log where action = 'feedback.update' and target_id = tests.i('fb_c')
   and metadata ->> 'to' = 'closed'),
  '{"from": "in_progress", "to": "closed", "issue": true}'::jsonb,
  'the second audit row records the closing and the issue link'
);

-- The server files the GitHub issue with the secret key (R49): not an admin action, so not audited.
select tests.authenticate_as_service_role();
update public.feedback set github_issue_url = 'https://github.com/toprudik/fit/issues/8' where id = tests.i('fb_d');
select tests.clear_authentication();
select is(tests.audit('feedback.update', tests.i('fb_d')), 0::bigint, 'a server update of feedback writes no audit row');

-- ---------------------------------------------------------------------------------------------------------
-- reports: no write path in wave 1 (R55)
select tests.authenticate_as('client_c');
select throws_ok(
  format($$ insert into public.reports (reporter_id, target_type, target_id, reason) values (%L, 'user', %L, 'spam') $$,
    tests.u('client_c'), tests.u('client_d')),
  '42501', null,
  'C cannot insert a report directly'
);
select tests.clear_authentication();
with r as (
  insert into public.reports (reporter_id, target_type, target_id, reason, body)
  values (tests.u('client_c'), 'user', tests.u('client_d'), 'spam', 'Sends ads in messages')
  returning id
)
insert into tests.ids select 'report_c', r.id from r;

select tests.authenticate_as('client_c');
select results_eq(
  $$ select id from public.reports $$,
  format($$ values (%L::uuid) $$, tests.i('report_c')),
  'the reporter reads their report'
);
select tests.authenticate_as('client_d');
select is_empty($$ select 1 from public.reports $$, 'the reported user does not read the report');
select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.reports $$, 'another user does not read the report');
select tests.authenticate_as('admin_x');
select results_eq(
  $$ select id from public.reports $$,
  format($$ values (%L::uuid) $$, tests.i('report_c')),
  'the admin reads the report'
);
-- Contract §6 says "0 rows"; there is no UPDATE grant at all, so the statement fails outright.
select throws_ok(
  format($$ update public.reports set status = 'dismissed', resolved_at = now() where id = %L $$, tests.i('report_c')),
  '42501', null,
  'the admin cannot resolve a report directly (admin_resolve_report comes later)'
);
select throws_ok(
  format($$ delete from public.reports where id = %L $$, tests.i('report_c')),
  '42501', null,
  'the admin cannot delete a report'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- break_glass_grants
select tests.clear_authentication();
insert into tests.ids values
  ('g_xc', tests.create_break_glass('admin_x', 'client_c', '{measurements,photos}')),
  ('g_rev', tests.create_break_glass('admin_x', 'client_c', '{photos}')),
  ('g_xd', tests.create_break_glass('admin_x', 'client_d', '{intake}')),
  ('g_yd', tests.create_break_glass('admin_y', 'client_d', '{workouts}'));

create function tests.grants_seen(p_handle text) returns uuid[] language plpgsql set search_path = '' as $$
declare
  v uuid[];
begin
  perform tests.authenticate_as(p_handle);
  select coalesce(array_agg(g.id order by g.id), '{}') into v from public.break_glass_grants g;
  perform tests.clear_authentication();
  return v;
end;
$$;
create function tests.sorted(p_ids uuid[]) returns uuid[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x
$$;

select is(tests.grants_seen('admin_x'), tests.sorted(array[tests.i('g_xc'), tests.i('g_rev'), tests.i('g_xd')]),
  'the issuing admin reads their own grants');
select is(tests.grants_seen('admin_y'), array[tests.i('g_yd')], 'another admin does not read them');
select is(tests.grants_seen('client_c'), tests.sorted(array[tests.i('g_xc'), tests.i('g_rev')]),
  'the target reads the grants on them');
select is(tests.grants_seen('client_d'), tests.sorted(array[tests.i('g_xd'), tests.i('g_yd')]),
  'D reads only the grants on D, not those on C');
select is(tests.grants_seen('trainer_a'), '{}'::uuid[], 'D''s trainer does not read grants on D');
select is(tests.grants_seen('stranger_s'), '{}'::uuid[], 'an unrelated user reads no grant');

-- Revocation: the value sent is replaced by now(), and the revocation is audited.
select tests.authenticate_as('admin_x');
select lives_ok(
  format($$ update public.break_glass_grants set revoked_at = '2000-01-01' where id = %L $$, tests.i('g_rev')),
  'the issuing admin revokes a grant'
);
select tests.clear_authentication();
select is((select revoked_at from public.break_glass_grants where id = tests.i('g_rev')), now(),
  'revoked_at is forced to now()');
select results_eq(
  format($$ select actor_id, target_type, target_id, metadata from public.admin_audit_log where action = 'break_glass.revoke' $$),
  format($$ values (%L::uuid, 'user', %L::uuid, jsonb_build_object('grant_id', %L::uuid)) $$,
    tests.u('admin_x'), tests.u('client_c'), tests.i('g_rev')),
  'one break_glass.revoke audit row: admin, target user, grant id only'
);

select tests.authenticate_as('admin_x');
select is_empty(
  format($$ update public.break_glass_grants set revoked_at = null where id = %L returning 1 $$, tests.i('g_rev')),
  'un-revoking a revoked grant changes 0 rows (revoked grants are out of the policy)'
);
select throws_ok(
  format($$ update public.break_glass_grants set revoked_at = null where id = %L $$, tests.i('g_xc')),
  '42501', 'forbidden',
  'sending a null revoked_at raises forbidden instead of revoking'
);
select throws_ok(
  format($$ update public.break_glass_grants set expires_at = now() + interval '50 minutes' where id = %L $$, tests.i('g_xc')),
  '42501', null,
  'the admin cannot extend a grant (no column grant)'
);
select throws_ok(
  format($$ update public.break_glass_grants set categories = '{measurements,photos,intake}' where id = %L $$, tests.i('g_xc')),
  '42501', null,
  'the admin cannot widen the categories (no column grant)'
);
select throws_ok(
  format($$ insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at)
            values (%L, %L, '{photos}', 'support case about missing progress photos', now() + interval '30 minutes') $$,
    tests.u('admin_x'), tests.u('client_d')),
  '42501', null,
  'the admin cannot open a grant directly (admin_open_break_glass comes later)'
);
select throws_ok(
  format($$ delete from public.break_glass_grants where id = %L $$, tests.i('g_xc')),
  '42501', null,
  'the admin cannot delete a grant'
);
select tests.authenticate_as('client_c');
select is_empty(
  format($$ update public.break_glass_grants set revoked_at = now() where id = %L returning 1 $$, tests.i('g_xc')),
  'the target cannot revoke the grant (0 rows)'
);
select tests.authenticate_as('admin_y');
select is_empty(
  format($$ update public.break_glass_grants set revoked_at = now() where id = %L returning 1 $$, tests.i('g_xc')),
  'another admin cannot revoke the grant (0 rows)'
);
select tests.clear_authentication();
select is(
  (select revoked_at from public.break_glass_grants where id = tests.i('g_xc')), null::timestamptz,
  'the grant is still live after the refused updates'
);
select is((select count(*) from public.admin_audit_log where action = 'break_glass.revoke'), 1::bigint,
  'refused updates write no audit row');

-- An admin who loses the role loses their grants: no read, no revoke (and private.can_view drops them too).
delete from public.user_roles where user_id = tests.u('admin_y');
select is(tests.grants_seen('admin_y'), '{}'::uuid[], 'a former admin no longer reads their grants');
select tests.authenticate_as('admin_y');
select is_empty(
  format($$ update public.break_glass_grants set revoked_at = now() where id = %L returning 1 $$, tests.i('g_yd')),
  'a former admin cannot revoke (0 rows)'
);
select tests.clear_authentication();

-- A later admin RPC or server job revoking a grant is audited too.
select tests.authenticate_as_service_role();
update public.break_glass_grants set revoked_at = now() where id = tests.i('g_yd');
select tests.clear_authentication();
select is(tests.audit('break_glass.revoke', tests.u('client_d')), 1::bigint, 'a server revocation is audited as well');

-- Table checks.
select throws_ok(
  format($$ insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at)
            values (%L, %L, '{photos}', 'support case about missing progress photos', now() + interval '61 minutes') $$,
    tests.u('admin_x'), tests.u('client_c')),
  '23514', null,
  'a grant longer than one hour violates the check'
);
select throws_ok(
  format($$ insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at)
            values (%L, %L, '{photos}', 'support case 123456', now() + interval '30 minutes') $$,
    tests.u('admin_x'), tests.u('client_c')),
  '23514', null,
  'a 19-character reason violates the check'
);
select throws_ok(
  format($$ insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at)
            values (%L, %L, '{}', 'support case about missing progress photos', now() + interval '30 minutes') $$,
    tests.u('admin_x'), tests.u('client_c')),
  '23514', null,
  'empty categories violate the check'
);
select throws_ok(
  format($$ insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at)
            values (%L, %L, '{photos}', 'support case about missing progress photos', now()) $$,
    tests.u('admin_x'), tests.u('client_c')),
  '23514', null,
  'expires_at must be after created_at'
);

-- ---------------------------------------------------------------------------------------------------------
-- admin_audit_log
select tests.authenticate_as('client_c');
select is_empty($$ select 1 from public.admin_audit_log $$, 'C reads no audit rows');
select tests.authenticate_as('trainer_a');
select is_empty($$ select 1 from public.admin_audit_log $$, 'a trainer reads no audit rows');
-- Four audited actions in this file: two feedback updates and two break-glass revocations.
select tests.authenticate_as('admin_x');
select is((select count(*) from public.admin_audit_log), 4::bigint, 'the admin reads every audit row');
select throws_ok(
  $$ insert into public.admin_audit_log (actor_id, action) values (auth.uid(), 'feedback.update') $$,
  '42501', null,
  'the admin cannot write the log directly'
);
select throws_ok(
  $$ update public.admin_audit_log set reason = 'tampered' $$,
  '42501', null,
  'the admin cannot update the log'
);
select throws_ok(
  $$ delete from public.admin_audit_log $$,
  '42501', null,
  'the admin cannot delete from the log'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.admin_audit_log (actor_id, action) values (auth.uid(), 'feedback.update') $$,
  '42501', null,
  'a user cannot write the log'
);
select tests.clear_authentication();
select throws_ok(
  $$ update public.admin_audit_log set reason = 'tampered' $$,
  'P0001', 'append_only',
  'postgres cannot update the log'
);
select throws_ok(
  $$ delete from public.admin_audit_log $$,
  'P0001', 'append_only',
  'postgres cannot delete from the log'
);
select throws_ok(
  $$ truncate public.admin_audit_log $$,
  'P0001', 'append_only',
  'postgres cannot truncate the log'
);
select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.admin_audit_log set metadata = '{}' $$,
  'P0001', 'append_only',
  'service_role cannot update the log'
);
select throws_ok(
  $$ delete from public.admin_audit_log $$,
  'P0001', 'append_only',
  'service_role cannot delete from the log'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- Account deletion. C's feedback and report stay without an author; the set-null on feedback.user_id is not
-- an admin update, so it writes no audit row even when an admin's claims are set (as in an admin RPC).
select tests.set_claims('admin_x');
select lives_ok(
  format($$ delete from auth.users where id = %L $$, tests.u('client_c')),
  'deleting C''s auth user succeeds'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.feedback where id in (tests.i('fb_c'), tests.i('fb_c2')) and user_id is null),
  2::bigint,
  'C''s feedback stays, with user_id null'
);
select is(
  (select reporter_id from public.reports where id = tests.i('report_c')), null::uuid,
  'C''s report stays, with reporter_id null'
);
select is((select count(*) from public.admin_audit_log), 4::bigint, 'the set-null wrote no audit row');

-- The admin's account goes; the audit rows keep the actor id (no FK, R45).
select lives_ok(
  format($$ delete from auth.users where id = %L $$, tests.u('admin_x')),
  'deleting the admin''s auth user succeeds'
);
select is(
  (select count(*) from public.admin_audit_log where actor_id = tests.u('admin_x')), 3::bigint,
  'the admin''s audit rows keep actor_id'
);

select * from finish();
rollback;

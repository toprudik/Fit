-- Retention with automatic clean-up (20261020154517_retention.sql, legal item 8): what the daily job deletes, what
-- it keeps, the audit log's narrow exception and the rows the privacy route clears after their files.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_admin('admin_r');
select tests.create_trainer('trainer_old');
select tests.create_trainer('trainer_new');
select tests.create_user('client_r');

-- app_opens: one 14 months old, one 12.
insert into public.app_opens (user_id, opened_at) values
  (tests.user_id('client_r'), now() - interval '14 months'),
  (tests.user_id('client_r'), now() - interval '12 months');

-- Outbox: failed and stuck rows past 90 days go, a failed one 30 days old and a future reminder stay.
insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after, status, created_at)
values
  (tests.user_id('client_r'), 'plan_revoked', 'r:failed-old', '{}', now() - interval '100 days', now() - interval '100 days', 'failed',
   now() - interval '100 days'),
  (tests.user_id('client_r'), 'plan_revoked', 'r:pending-old', '{}', now() - interval '95 days', now() - interval '95 days', 'pending',
   now() - interval '95 days'),
  (tests.user_id('client_r'), 'plan_revoked', 'r:failed-new', '{}', now() - interval '30 days', now() - interval '30 days', 'failed',
   now() - interval '30 days'),
  (tests.user_id('client_r'), 'plan_expiring', 'r:future', '{}', now() + interval '200 days', now() + interval '200 days', 'pending',
   now() - interval '120 days');

-- Reports: decided 4 years ago (goes), decided 4 years ago but appealed 2 years ago (stays), open since 5 years.
insert into public.reports (id, reporter_id, target_type, target_id, reason, status, resolved_at, created_at) values
  ('00000000-0000-4000-8000-000000000a01', tests.user_id('client_r'), 'user', tests.user_id('trainer_old'), 'spam', 'dismissed',
   now() - interval '4 years', now() - interval '4 years'),
  ('00000000-0000-4000-8000-000000000a02', tests.user_id('client_r'), 'user', tests.user_id('trainer_old'), 'spam', 'dismissed',
   now() - interval '4 years', now() - interval '4 years'),
  ('00000000-0000-4000-8000-000000000a03', tests.user_id('client_r'), 'user', tests.user_id('trainer_old'), 'spam', 'open',
   null, now() - interval '5 years');
insert into public.reports (reporter_id, target_type, target_id, reason, status, resolved_at, created_at, appeal_of) values
  (tests.user_id('trainer_old'), 'user', tests.user_id('trainer_old'), 'appeal', 'kept', now() - interval '2 years',
   now() - interval '2 years', '00000000-0000-4000-8000-000000000a02');

-- Feedback: without screenshots 4 years old (goes now), with screenshots 4 years old (waits for the route), new.
insert into public.feedback (id, user_id, kind, body, attachment_paths, created_at) values
  ('00000000-0000-4000-8000-000000000f01', null, 'bug', 'old', '{}', now() - interval '4 years'),
  ('00000000-0000-4000-8000-000000000f02', null, 'bug', 'old with screenshots', '{x/y/1.png}', now() - interval '4 years'),
  ('00000000-0000-4000-8000-000000000f03', null, 'bug', 'new', '{}', now() - interval '1 month');

-- Audit log: one row 4 years old, one 1 year old.
insert into public.admin_audit_log (actor_id, action, target_type, target_id, created_at) values
  (tests.user_id('admin_r'), 'retention.old', 'user', tests.user_id('client_r'), now() - interval '4 years'),
  (tests.user_id('admin_r'), 'retention.new', 'user', tests.user_id('client_r'), now() - interval '1 year');

-- Certificates: trainer_old's was decided 13 months ago, trainer_new's 2 months ago; a re-upload after the
-- decision waits for the next one.
insert into public.trainer_certificates (id, trainer_id, title, storage_path, created_at) values
  ('00000000-0000-4000-8000-000000000c01', tests.user_id('trainer_old'), 'Old', tests.user_id('trainer_old') || '/c01.pdf',
   now() - interval '14 months'),
  ('00000000-0000-4000-8000-000000000c02', tests.user_id('trainer_new'), 'New', tests.user_id('trainer_new') || '/c02.pdf',
   now() - interval '3 months'),
  ('00000000-0000-4000-8000-000000000c03', tests.user_id('trainer_old'), 'Again', tests.user_id('trainer_old') || '/c03.pdf',
   now() - interval '6 months');
insert into public.trainer_verifications (trainer_id, decision, decided_by, created_at) values
  (tests.user_id('trainer_old'), 'verified', tests.user_id('admin_r'), now() - interval '13 months'),
  (tests.user_id('trainer_new'), 'verified', tests.user_id('admin_r'), now() - interval '2 months');

-- The audit log stays append-only outside the job ---------------------------------------------------------------------

select throws_ok($$ delete from public.admin_audit_log where action = 'retention.new' $$, 'P0001', 'append_only',
  'a young audit row cannot be deleted');
select throws_ok($$ delete from public.admin_audit_log where action = 'retention.old' $$, 'P0001', 'append_only',
  'nor an old one outside the retention job');
select set_config('private.retention', 'on', true);
select throws_ok($$ delete from public.admin_audit_log where action = 'retention.new' $$, 'P0001', 'append_only',
  'the flag does not open a young row');
select set_config('private.retention', 'off', true);
select throws_ok($$ update public.admin_audit_log set reason = 'x' where action = 'retention.old' $$, 'P0001', 'append_only',
  'and rows still cannot change');

-- Files the privacy route removes first --------------------------------------------------------------------------------

select is(
  (select array_agg(d.kind || ':' || d.id::text || ':' || d.bucket order by d.kind) from public.retention_due_files(10) d),
  array['certificate:00000000-0000-4000-8000-000000000c01:certificates',
        'feedback:00000000-0000-4000-8000-000000000f02:feedback'],
  'the old certificate and the old feedback with screenshots are due; the re-upload and the young ones are not');

select tests.authenticate_as('admin_r');
select throws_ok($$ select * from public.retention_due_files(1) $$, '42501', null, 'an admin cannot call it');
select throws_ok($$ select public.retention_forget('feedback', '00000000-0000-4000-8000-000000000f02') $$, '42501', null,
  'nor forget a row');
select tests.authenticate_as_service_role();
select is(public.retention_forget('feedback', '00000000-0000-4000-8000-000000000f03'), false, 'a young feedback row stays');
select is(public.retention_forget('certificate', '00000000-0000-4000-8000-000000000c02'), false, 'a young certificate stays');
select is(public.retention_forget('feedback', '00000000-0000-4000-8000-000000000f02'), true, 'a due feedback row goes');
select is(public.retention_forget('certificate', '00000000-0000-4000-8000-000000000c01'), true, 'a due certificate goes');
select throws_ok($$ select public.retention_forget('profile', gen_random_uuid()) $$, '22023', 'invalid_kind', 'other kinds are refused');
select tests.clear_authentication();
select is((select count(*)::int from public.retention_due_files(10)), 0, 'nothing is due after that');

-- The daily job -------------------------------------------------------------------------------------------------------

select is(
  private.purge_expired_rows(),
  '{"app_opens": 1, "notification_outbox": 2, "reports": 1, "feedback": 1, "admin_audit_log": 1}'::jsonb,
  'the job reports what it deleted');
select is((select count(*)::int from public.app_opens where user_id = tests.user_id('client_r')), 1, 'app_opens: 12 months stay');
select is(
  (select array_agg(dedupe_key order by dedupe_key) from public.notification_outbox where user_id = tests.user_id('client_r')),
  array['r:failed-new', 'r:future'], 'outbox: a recent failure and a future reminder stay');
select ok(not exists (select 1 from public.reports where id = '00000000-0000-4000-8000-000000000a01'), 'a report decided 4 years ago goes');
select ok(exists (select 1 from public.reports where id = '00000000-0000-4000-8000-000000000a02'),
  'one with a younger appeal waits for it');
select ok(exists (select 1 from public.reports where id = '00000000-0000-4000-8000-000000000a03'), 'an open report stays');
select is((select array_agg(body order by body) from public.feedback where id::text like '00000000-0000-4000-8000-000000000f%'),
  array['new'], 'feedback: only the young message stays');
select is((select array_agg(action) from public.admin_audit_log where action like 'retention.%'), array['retention.new'],
  'audit log: the year-old row stays');
select is(current_setting('private.retention', true), 'off', 'the flag is off again after the job');
select is((select count(*)::int from public.trainer_certificates where id::text like '00000000-0000-4000-8000-000000000c%'), 2,
  'the daily job leaves certificates to the privacy route');
select ok(exists (select 1 from cron.job where jobname = 'retention' and command = 'select private.purge_expired_rows()'),
  'the job runs daily');

select * from finish();
rollback;

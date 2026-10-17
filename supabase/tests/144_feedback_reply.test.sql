-- Admin reply to feedback (migration 20261017125600_feedback_reply.sql, PRD wave-1 §4 ADM-10): only an admin
-- answers, the answer is kept on the message and logged, the author gets feedback_reply from the bot.
begin;
\ir _helpers.psql
select plan(11);

select tests.create_admin('admin_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.authenticate_as('client_c');
insert into public.feedback (id, kind, body) values ('00000000-0000-4000-8000-0000000000f2', 'bug', 'The button is grey');
select tests.authenticate_as('client_d');
insert into public.feedback (id, kind, body) values ('00000000-0000-4000-8000-0000000000f3', 'idea', 'Dark mode');
select tests.clear_authentication();
update public.feedback set user_id = null where id = '00000000-0000-4000-8000-0000000000f3';

select tests.authenticate_as('client_c');
select throws_ok($$ select public.admin_reply_feedback('00000000-0000-4000-8000-0000000000f2', 'Hi') $$,
  '42501', 'forbidden', 'the author cannot answer');
select tests.authenticate_as_anon();
select throws_ok($$ select public.admin_reply_feedback('00000000-0000-4000-8000-0000000000f2', 'Hi') $$,
  '42501', null, 'anon cannot call it');

select tests.authenticate_as('admin_a');
select throws_ok($$ select public.admin_reply_feedback('00000000-0000-4000-8000-0000000000f2', '   ') $$,
  '22023', 'invalid_reply', 'an empty answer is refused');
select throws_ok(format('select public.admin_reply_feedback(%L, %L)', '00000000-0000-4000-8000-0000000000f2', repeat('a', 2001)),
  '22023', 'invalid_reply', 'an answer holds up to 2000 characters');
select throws_ok($$ select public.admin_reply_feedback(gen_random_uuid(), 'Hi') $$,
  'P0002', 'not_found', 'an unknown message');
select throws_ok($$ select public.admin_reply_feedback('00000000-0000-4000-8000-0000000000f3', 'Hi') $$,
  'P0001', 'author_deleted', 'no answer when the author deleted the account');
select lives_ok($$ select public.admin_reply_feedback('00000000-0000-4000-8000-0000000000f2', '  Fixed, thanks!  ') $$,
  'the admin answers');
select tests.clear_authentication();

select results_eq(
  $$ select reply, replied_by, status::text from public.feedback where id = '00000000-0000-4000-8000-0000000000f2' $$,
  $$ values ('Fixed, thanks!'::text, tests.user_id('admin_a'), 'in_progress'::text) $$,
  'the answer is kept and a new message moves to in progress');
select results_eq(
  $$ select user_id, payload ->> 'feedback_id', payload ->> 'kind', payload ->> 'reply'
     from public.notification_outbox where type = 'feedback_reply' $$,
  $$ values (tests.user_id('client_c'), '00000000-0000-4000-8000-0000000000f2'::text, 'bug'::text, 'Fixed, thanks!'::text) $$,
  'the author gets the answer from the bot');
select is(
  (select count(*)::int from public.admin_audit_log where action = 'feedback.reply'), 1,
  'the answer is in the audit log');

select tests.authenticate_as('client_c');
select is(
  (select reply from public.feedback where id = '00000000-0000-4000-8000-0000000000f2'), 'Fixed, thanks!',
  'the author can read the answer');
select tests.clear_authentication();

select * from finish();
rollback;

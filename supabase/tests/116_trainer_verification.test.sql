-- Trainer verification RPCs of migration 20261016130000_trainer_verification.sql (PRD wave-1 §2.2 TINV-4..7,
-- §3 С3 and А1, §4 ADM-4..6): submit_trainer_verification and admin_decide_verification.
begin;
\ir _helpers.psql
select plan(41);

select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

create function tests.status_of(p_handle text) returns text language sql stable set search_path = '' as $$
  select verification_status::text from public.trainer_profiles where user_id = tests.user_id(p_handle)
$$;

-- =========================================================================================================
-- submit_trainer_verification

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.submit_trainer_verification() $$, '42501', 'not_trainer', 'submit: a client is not a trainer'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.submit_trainer_verification() $$, '42501', null, 'submit: anon cannot call the function'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.submit_trainer_verification() $$, 'P0001', 'no_documents', 'submit: nothing to send without documents'
);
select tests.clear_authentication();
select is(tests.status_of('trainer_a'), 'not_submitted', 'submit: a refused submission leaves the status alone');

-- Two documents, uploaded the way the app does: a row in the trainer's own folder.
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (auth.uid(), 'Diploma', auth.uid() || '/a.pdf'), (auth.uid(), 'Course', auth.uid() || '/b.jpg') $$,
  'submit: the trainer uploads documents'
);
select lives_ok($$ select public.submit_trainer_verification() $$, 'submit: the trainer sends them for review');
select throws_ok(
  $$ select public.submit_trainer_verification() $$, 'P0001', 'verification_pending', 'submit: a pending review is not sent twice'
);
select tests.clear_authentication();

select is(tests.status_of('trainer_a'), 'pending', 'submit: the status becomes pending');
select results_eq(
  $$ select decision::text, reason, decided_by from public.trainer_verifications where trainer_id = tests.u('trainer_a') $$,
  $$ values ('pending'::text, null::text, null::uuid) $$,
  'submit: one pending event in the history'
);
select results_eq(
  $$ select user_id, chat_target, payload from public.notification_outbox where type = 'verification_submitted' $$,
  $$ values (null::uuid, 'admin_group'::text, '{"trainer_name": "trainer_a", "documents": 2}'::jsonb) $$,
  'submit: the admin group is told who sent how many documents (А1)'
);

-- TINV-4: work does not wait for the review.
select tests.authenticate_as('trainer_a');
select ok(
  exists (select 1 from public.trainer_profiles where user_id = auth.uid()), 'submit: a pending trainer keeps the trainer zone (TINV-4)'
);
select tests.clear_authentication();

-- Other people do not see the documents or the history (TINV-6).
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.trainer_certificates), 0, 'privacy: a client of the trainer sees no documents');
select is((select count(*)::int from public.trainer_verifications), 0, 'privacy: a client sees no verification history');
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.trainer_certificates), 0, 'privacy: another trainer sees no documents');
select tests.authenticate_as('admin_x');
select is((select count(*)::int from public.trainer_certificates), 2, 'privacy: an admin sees the documents to decide');
select tests.clear_authentication();

-- =========================================================================================================
-- admin_decide_verification

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.admin_decide_verification(auth.uid(), 'verified') $$,
  '42501', null, 'decide: a trainer cannot verify themselves'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'verified') $$,
  '42501', null, 'decide: a client cannot decide'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'verified') $$,
  '42501', null, 'decide: anon cannot call the function'
);

select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'rejected') $$,
  '22023', 'reason_required', 'decide: a rejection without a reason is refused (ADM-5)'
);
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'rejected', '   ') $$,
  '22023', 'reason_required', 'decide: a blank reason counts as none'
);
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'rejected', repeat('x', 1001)) $$,
  '22023', 'reason_too_long', 'decide: a reason over 1000 characters is refused'
);
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'pending') $$,
  '22023', 'invalid_decision', 'decide: pending is not a decision'
);
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_b'), 'verified') $$,
  'P0001', 'verification_not_pending', 'decide: a trainer who sent nothing cannot be decided'
);
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('client_c'), 'verified') $$,
  'P0001', 'trainer_not_found', 'decide: a user without a trainer profile is reported'
);
select tests.clear_authentication();
select is(tests.status_of('trainer_a'), 'pending', 'decide: refused decisions leave the status alone');

select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'rejected', '  The diploma is unreadable  ') $$,
  'decide: the admin rejects with a reason'
);
select tests.authenticate_as('admin_y');
select throws_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'verified') $$,
  'P0001', 'verification_not_pending', 'decide: a second admin cannot decide it again'
);
select tests.clear_authentication();

select is(tests.status_of('trainer_a'), 'rejected', 'decide: the status becomes rejected');
select results_eq(
  $$ select decision::text, reason, decided_by from public.trainer_verifications
     where trainer_id = tests.u('trainer_a') and decision = 'rejected' $$,
  $$ values ('rejected'::text, 'The diploma is unreadable'::text, tests.u('admin_x')) $$,
  'decide: the history keeps the trimmed reason and the admin'
);
select results_eq(
  $$ select payload from public.notification_outbox where type = 'verification_result' and user_id = tests.u('trainer_a') $$,
  $$ values ('{"decision": "rejected", "reason": "The diploma is unreadable"}'::jsonb) $$,
  'decide: the trainer gets the result with the reason (С3, TINV-5)'
);
select results_eq(
  $$ select actor_id, target_type, target_id, reason, metadata->>'decision' from public.admin_audit_log
     where action = 'verification.decide' $$,
  $$ values (tests.u('admin_x'), 'trainer'::text, tests.u('trainer_a'), 'The diploma is unreadable'::text, 'rejected'::text) $$,
  'decide: the decision is in the audit log'
);

-- TINV-7: a rejected trainer keeps working and may send the documents again.
select tests.authenticate_as('trainer_a');
select ok(exists (select 1 from public.trainer_profiles where user_id = auth.uid()), 'rejected: the trainer keeps the trainer zone (TINV-7)');
select is(
  (select reason from public.trainer_verifications where decision = 'rejected'), 'The diploma is unreadable',
  'rejected: the trainer reads the reason (TINV-5)'
);
select lives_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path) values (auth.uid(), 'Scan', auth.uid() || '/c.png') $$,
  'rejected: the trainer adds a document'
);
select lives_ok($$ select public.submit_trainer_verification() $$, 'rejected: the trainer sends the documents again');
select tests.clear_authentication();
select is(tests.status_of('trainer_a'), 'pending', 'rejected: sending again puts the trainer back in the queue (ADM-6)');
select is(
  (select count(*)::int from public.notification_outbox where type = 'verification_submitted'), 2,
  'rejected: the admin group hears about the second submission too'
);

select tests.authenticate_as('admin_y');
select lives_ok(
  $$ select public.admin_decide_verification(tests.u('trainer_a'), 'verified', 'ignored for a verification') $$,
  'decide: the admin verifies'
);
select tests.clear_authentication();
select results_eq(
  $$ select verification_status::text, verified_at is not null from public.trainer_profiles where user_id = tests.u('trainer_a') $$,
  $$ values ('verified'::text, true) $$,
  'decide: the trainer is verified, with the time'
);
select results_eq(
  $$ select payload from public.notification_outbox where type = 'verification_result' and user_id = tests.u('trainer_a')
     order by id desc limit 1 $$,
  $$ values ('{"decision": "verified"}'::jsonb) $$,
  'decide: a verification message carries no reason'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.submit_trainer_verification() $$, 'P0001', 'already_verified', 'submit: a verified trainer has nothing to send'
);
select tests.clear_authentication();

select * from finish();
rollback;

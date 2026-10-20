-- Trainer honors of migration 20261020091317_trainer_honors.sql (ambassador programme §3, marketing backlog
-- item 8): admin_set_trainer_honor, admin_trainer_honors and get_trainer_honors.
begin;
\ir _helpers.psql
select plan(17);

select tests.create_admin('admin_a');
select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_trainer('trainer_b', 'boris');
select tests.create_user('client_c');

-- =========================================================================================================
-- Who may set them

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'ambassador', true, 'Привёл троих') $$,
  '42501', 'forbidden', 'set: a trainer cannot give themselves an honor'
);
select throws_ok(
  $$ select * from public.admin_trainer_honors(tests.user_id('trainer_a')) $$,
  '42501', 'forbidden', 'list: only admins read the reasons'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'trainer_honors' and grantee in ('anon', 'authenticated')),
  0, 'table: no grants to anon or authenticated'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'founder', true, 'Бета') $$,
  '42501', null, 'set: anon cannot call it'
);

-- =========================================================================================================
-- Granting and taking back

select tests.authenticate_as('admin_a');
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'founder', true, '  ') $$,
  '22023', 'reason_required', 'set: a reason is required'
);
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'founder', true, repeat('а', 501)) $$,
  '22023', 'reason_too_long', 'set: the reason is at most 500 characters'
);
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('client_c'), 'founder', true, 'Бета') $$,
  'P0001', 'trainer_not_found', 'set: only a trainer gets an honor'
);
select lives_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'founder', true, ' Тренер закрытой беты ') $$,
  'set: an admin grants founder'
);
select lives_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'ambassador', true, 'Привёл троих коллег') $$,
  'set: and ambassador'
);
select throws_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'founder', true, 'Ещё раз') $$,
  'P0001', 'honor_unchanged', 'set: granting a held honor again changes nothing'
);
select results_eq(
  $$ select honor::text, reason from public.admin_trainer_honors(tests.user_id('trainer_a')) $$,
  $$ values ('founder'::text, 'Тренер закрытой беты'::text), ('ambassador', 'Привёл троих коллег') $$,
  'list: the admin sees both with the trimmed reasons'
);

-- =========================================================================================================
-- The showcase shows them only for a verified trainer (Q55)

select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trainer_honors('anna-fit') $$, 'showcase: hidden while the trainer is not verified');
select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'verified', verified_at = now() where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select h::text from public.get_trainer_honors('Anna-Fit') h $$,
  $$ values ('founder'::text), ('ambassador') $$,
  'showcase: anyone sees a verified trainer''s honors, founder first'
);
select is_empty($$ select * from public.get_trainer_honors('boris') $$, 'showcase: a trainer without honors has none');

select tests.authenticate_as('admin_a');
select lives_ok(
  $$ select public.admin_set_trainer_honor(tests.user_id('trainer_a'), 'ambassador', false, 'Нарушил правила программы') $$,
  'set: an admin takes ambassador back'
);
select results_eq(
  $$ select action, reason, metadata ->> 'honor' from public.admin_audit_log
     where target_id = tests.user_id('trainer_a') and action like 'trainer_honor.%' order by id $$,
  $$ values ('trainer_honor.grant'::text, 'Тренер закрытой беты'::text, 'founder'::text),
            ('trainer_honor.grant', 'Привёл троих коллег', 'ambassador'),
            ('trainer_honor.revoke', 'Нарушил правила программы', 'ambassador') $$,
  'audit: each grant and revoke is logged with its reason'
);
select tests.clear_authentication();
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is_empty($$ select * from public.get_trainer_honors('anna-fit') $$, 'showcase: a closed showcase shows none');

select * from finish();
rollback;

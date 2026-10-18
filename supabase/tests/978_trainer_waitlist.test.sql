-- Waitlist of trainers from /for-trainers, migration 20261018134517_trainer_waitlist.sql (marketing backlog item
-- 10): signed out with a contact, signed in with the account, consent kept, read by admins and the trainer only.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_user('trainer_w');
select tests.create_user('someone');
select tests.create_admin('admin_a');

-- Signed out ----------------------------------------------------------------------------------------------------

select tests.authenticate_as_anon();
select throws_ok($$ select public.join_trainer_waitlist('Тренер Тест', 'ru', '2026-10-waitlist', null, null, null) $$,
  '22023', 'waitlist_invalid', 'signed out, a contact is required');
select throws_ok($$ select public.join_trainer_waitlist('  ', 'ru', '2026-10-waitlist', '@trainer_test', null, null) $$,
  '22023', 'waitlist_invalid', 'a name is required');
select throws_ok($$ select public.join_trainer_waitlist('Тренер Тест', 'ru', '2026-10-waitlist', '@trainer_test', 'lots', null) $$,
  '22023', 'waitlist_invalid', 'the clients answer is one of the options');
select throws_ok($$ select public.join_trainer_waitlist('Тренер Тест', 'ru', '', '@trainer_test', null, null) $$,
  '22023', 'waitlist_invalid', 'no consent, no entry');
select lives_ok($$ select public.join_trainer_waitlist('Тренер Тест', 'ru', '2026-10-waitlist', '@trainer_test', '6_15', 'ch_vk') $$,
  'signed out, a trainer joins with a contact');
select lives_ok($$ select public.join_trainer_waitlist('Другое имя', 'en', '2026-10-waitlist', '@TRAINER_TEST', null, 'bad label!') $$,
  'the same contact again is answered the same way');
select throws_ok($$ select * from public.trainer_waitlist $$, '42501', null, 'signed out, the list is not readable');
select tests.clear_authentication();

select results_eq(
  $$ select name, contact, clients, locale, source, consent_version from public.trainer_waitlist where user_id is null $$,
  $$ values ('Тренер Тест', '@trainer_test', '6_15', 'ru', 'ch_vk', '2026-10-waitlist') $$,
  'one entry per contact, the first one kept, with its source and consent');

-- Signed in -----------------------------------------------------------------------------------------------------

select tests.authenticate_as('trainer_w');
select lives_ok($$ select public.join_trainer_waitlist('Тренер Вэ', 'ru', '2026-10-waitlist', null, 'up_to_5', 'bad label!') $$,
  'signed in, no contact is needed');
select lives_ok($$ select public.join_trainer_waitlist('Тренер Вэ', 'ru', '2026-10-waitlist', '+7 900 000-00-00', 'over_40', null) $$,
  'joining again updates the own entry');
select results_eq($$ select name, contact, clients, source from public.trainer_waitlist $$,
  $$ values ('Тренер Вэ', '+7 900 000-00-00', 'over_40', null::text) $$,
  'the trainer sees only their own entry, updated, and a malformed label is dropped');

select tests.authenticate_as('someone');
select is((select count(*)::integer from public.trainer_waitlist), 0, 'another user sees nothing');

select tests.authenticate_as('admin_a');
select is((select count(*)::integer from public.trainer_waitlist), 2, 'the admin sees the whole list');
select tests.clear_authentication();

delete from public.profiles where id = tests.user_id('trainer_w');
select is((select count(*)::integer from public.trainer_waitlist where user_id is not null), 0,
  'a signed-in entry goes with the account');

select * from finish();
rollback;

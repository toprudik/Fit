-- Messages around the intake, migration 20261016193000_intake_notifications.sql (PRD wave-1 §2.4 INTK-2,
-- INTK-5; screens.md §2.2): intake_submitted to the trainers who see it, on the first version only, and
-- remind_intake from the trainer's intake screen.
begin;
\ir _helpers.psql
select plan(16);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_e');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_e', 'client_c', 'ended');
select tests.create_pair('trainer_a', 'client_d');
select tests.set_share('trainer_a', 'client_c', 'intake', true);
select tests.set_share('trainer_e', 'client_c', 'intake', true);
select tests.set_share('trainer_a', 'client_d', 'intake', true);

-- Pair ids for steps acting as someone who cannot see the pair.
create table tests.pair_ac (id uuid);
insert into tests.pair_ac values (tests.pair_id('trainer_a', 'client_c'));
grant select on tests.pair_ac to authenticated;

-- =========================================================================================================
-- remind_intake

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.remind_intake(tests.pair_id('trainer_a', 'client_c')) $$, '42501', null, 'remind: anon cannot call it'
);
select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ select public.remind_intake((select id from tests.pair_ac)) $$, 'P0001', 'not_found',
  'remind: only the trainer of the pair'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.remind_intake(tests.pair_id('trainer_a', 'client_c')) $$, 'P0001', 'not_found',
  'remind: not the client either'
);
select tests.authenticate_as('trainer_e');
select throws_ok(
  $$ select public.remind_intake(tests.pair_id('trainer_e', 'client_c')) $$, 'P0001', 'not_found',
  'remind: not in an ended pair'
);
select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.remind_intake(tests.pair_id('trainer_b', 'client_c')) $$, 'P0001', 'intake_hidden',
  'remind: not while the client does not show the intake to this trainer'
);
select tests.authenticate_as('trainer_a');
select is(public.remind_intake(tests.pair_id('trainer_a', 'client_c')), true, 'remind: the trainer reminds the client');
select is(public.remind_intake(tests.pair_id('trainer_a', 'client_c')), false, 'remind: once a day per pair');
select tests.clear_authentication();
select results_eq(
  $$ select type::text, payload ->> 'coaching_id', payload ->> 'first_name'
     from public.notification_outbox where user_id = tests.user_id('client_c') $$,
  $$ values ('intake_reminder'::text, tests.pair_id('trainer_a', 'client_c')::text, 'trainer_a'::text) $$,
  'remind: the client gets one reminder with the pair and the trainer''s name'
);

-- =========================================================================================================
-- intake_submitted

select tests.authenticate_as('client_c');
insert into public.intakes (user_id, form_version, answers, parq_answers)
values (tests.user_id('client_c'), 'v1', '{"goal":"strength"}', '{"q1":false,"q2":true}');
select tests.clear_authentication();
select results_eq(
  $$ select user_id, payload ->> 'coaching_id', payload ->> 'first_name', (payload ->> 'parq_flagged')::boolean
     from public.notification_outbox where type = 'intake_submitted' $$,
  $$ values (tests.user_id('trainer_a'), tests.pair_id('trainer_a', 'client_c')::text, 'client_c'::text, true) $$,
  'submitted: only the trainer of a live pair who sees the intake is told, with the PAR-Q flag'
);

select tests.authenticate_as('client_c');
insert into public.intakes (user_id, form_version, answers, parq_answers)
values (tests.user_id('client_c'), 'v1', '{"goal":"mass"}', '{"q1":false}');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'intake_submitted'), 1,
  'submitted: a new version is not announced again'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.remind_intake(tests.pair_id('trainer_a', 'client_c')) $$, 'P0001', 'intake_filled',
  'remind: not once the intake is filled in'
);

-- Two versions in one statement still announce once.
select tests.authenticate_as('client_d');
insert into public.intakes (user_id, form_version, answers, parq_answers) values
  (tests.user_id('client_d'), 'v1', '{"goal":"health"}', '{"q1":false}'),
  (tests.user_id('client_d'), 'v1', '{"goal":"posture"}', '{"q1":false}');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox
   where type = 'intake_submitted' and user_id = tests.user_id('trainer_a')
     and payload ->> 'coaching_id' = tests.pair_id('trainer_a', 'client_d')::text),
  1, 'submitted: two versions at once are announced once'
);
select is(
  (select (payload ->> 'parq_flagged')::boolean from public.notification_outbox
   where type = 'intake_submitted' and payload ->> 'coaching_id' = tests.pair_id('trainer_a', 'client_d')::text),
  false, 'submitted: no PAR-Q flag when every answer is no'
);

-- The trainer allowed later is not told; the client's own row in the outbox stays hidden from others.
select tests.authenticate_as('client_c');
update public.data_shares set intake = true where coaching_id = tests.pair_id('trainer_b', 'client_c');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where user_id = tests.user_id('trainer_b')), 0,
  'submitted: a trainer the client allows later gets no message'
);
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.intakes), 2, 'submitted: but now sees the intake versions');
select tests.authenticate_as('trainer_e');
select is((select count(*)::int from public.intakes), 0, 'submitted: an ended pair sees nothing');

select * from finish();
rollback;

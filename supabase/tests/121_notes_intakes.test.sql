-- Notes and intakes policies of migration 20261015123200_pairs_policies.sql (contract §6 121_notes_intakes):
-- coaching_notes (PAIR-2, decisions Q38, R12) and intakes (INTK-4/7, break-glass ADM-15).
begin;
\ir _helpers.psql
select plan(59);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A, M is A's card.
-- admin_x opens break-glass grants; admin_y never has one.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_card('trainer_a', 'card_m');
-- Both trainers accepted the data processing agreement (20261020141737_trainer_dpa.sql); 979 tests without it.
insert into public.consents (user_id, kind, version)
select tests.user_id(h), 'trainer_dpa', '2026-10-18' from unnest(array['trainer_a', 'trainer_b']) h;

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('session_a', tests.create_session('trainer_a', now() + interval '1 day')),
  ('session_b', tests.create_session('trainer_b', now() + interval '1 day'));
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- =========================================================================================================
-- coaching_notes: writing

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body)
     values (tests.i('pair_ac'), tests.u('trainer_a'), 'Left knee hurts on deep squats') $$,
  'coaching_notes: A adds a note to the A-C pair, hidden by default'
);
select lives_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, session_id, body, visible_to_client)
     values (tests.i('pair_ac'), tests.u('trainer_a'), tests.i('session_a'), 'Bring a towel', true) $$,
  'coaching_notes: A adds a visible note tied to own session'
);
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body) values (tests.i('pair_ac'), tests.u('client_d'), 'Not mine') $$,
  '42501', 'new row violates row-level security policy for table "coaching_notes"',
  'coaching_notes: A cannot write a note in someone else''s name'
);
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body) values (tests.i('pair_bc'), tests.u('trainer_a'), 'Peek') $$,
  '42501', 'new row violates row-level security policy for table "coaching_notes"',
  'coaching_notes: A cannot add a note to B''s pair'
);
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body) values (tests.i('pair_ac'), tests.u('trainer_a'), '') $$,
  '23514', null, 'coaching_notes: an empty body violates the check'
);
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, session_id, body)
     values (tests.i('pair_ac'), tests.u('trainer_a'), tests.i('session_b'), 'Wrong session') $$,
  'P0001', 'session_not_in_pair', 'coaching_notes: a session of B raises session_not_in_pair'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body) values (tests.i('pair_ac'), tests.u('client_c'), 'My own note') $$,
  '42501', 'new row violates row-level security policy for table "coaching_notes"',
  'coaching_notes: the client cannot add a note'
);
select tests.authenticate_as('trainer_b');
select lives_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body) values (tests.i('pair_bc'), tests.u('trainer_b'), 'B''s note on C') $$,
  'coaching_notes: B adds a note to the B-C pair'
);
select tests.clear_authentication();
-- A note on the ended pair, written while it was live.
insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
values (tests.i('pair_ae'), tests.u('trainer_a'), 'Great progress this month', true);

-- =========================================================================================================
-- coaching_notes: reading

select tests.authenticate_as('client_c');
select set_eq(
  $$ select body from public.coaching_notes $$, array['Bring a towel'],
  'coaching_notes: C reads only the note shown to C; the hidden note and B''s note are invisible'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.coaching_notes set visible_to_client = true where body = 'Left knee hurts on deep squats'
     returning visible_to_client $$,
  $$ values (true) $$,
  'coaching_notes: A shows the hidden note to C'
);
select set_eq(
  $$ select body from public.coaching_notes $$,
  array['Left knee hurts on deep squats', 'Bring a towel', 'Great progress this month'],
  'coaching_notes: A reads all own notes, never B''s'
);
select tests.authenticate_as('client_c');
select set_eq(
  $$ select body from public.coaching_notes $$, array['Left knee hurts on deep squats', 'Bring a towel'],
  'coaching_notes: C reads the note once it is visible'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select body from public.coaching_notes $$, array['B''s note on C'],
  'coaching_notes: B reads 0 rows of the A-C pair'
);
select tests.authenticate_as('client_d');
select is_empty($$ select id from public.coaching_notes $$, 'coaching_notes: another client of A reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.coaching_notes $$, 'coaching_notes: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.coaching_notes $$, 'coaching_notes: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.coaching_notes $$, '42501', null, 'coaching_notes: anon has no access');

-- =========================================================================================================
-- coaching_notes: editing

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.coaching_notes set body = 'Left knee hurts below 90 degrees', session_id = tests.i('session_a')
     where body = 'Left knee hurts on deep squats' returning body $$,
  $$ values ('Left knee hurts below 90 degrees'::text) $$,
  'coaching_notes: the author edits the body and ties it to own session'
);
select throws_ok(
  $$ update public.coaching_notes set session_id = tests.i('session_b') where body = 'Bring a towel' $$,
  'P0001', 'session_not_in_pair', 'coaching_notes: moving a note to B''s session raises session_not_in_pair'
);
select throws_ok(
  $$ update public.coaching_notes set author_id = tests.u('trainer_b') where body = 'Bring a towel' $$,
  '42501', null, 'coaching_notes: author_id is not writable'
);
select throws_ok(
  $$ update public.coaching_notes set coaching_id = tests.i('pair_ad') where body = 'Bring a towel' $$,
  '42501', null, 'coaching_notes: coaching_id is not writable'
);
select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.coaching_notes set body = 'edited by C' returning 1 $$,
  'coaching_notes: the client updating a visible note changes 0 rows'
);
select is_empty(
  $$ delete from public.coaching_notes returning 1 $$,
  'coaching_notes: the client deleting a visible note changes 0 rows'
);
select tests.authenticate_as('trainer_b');
select is_empty(
  $$ update public.coaching_notes set body = 'edited by B' where coaching_id = tests.i('pair_ac') returning 1 $$,
  'coaching_notes: B updating A''s notes changes 0 rows'
);
select is_empty(
  $$ delete from public.coaching_notes where coaching_id = tests.i('pair_ac') returning 1 $$,
  'coaching_notes: B deleting A''s notes changes 0 rows'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.coaching_notes where body = 'Bring a towel' returning body $$,
  $$ values ('Bring a towel'::text) $$,
  'coaching_notes: the author deletes a note'
);

-- After the pair ends the owner trainer keeps the notes (R12).
select results_eq(
  $$ select body from public.coaching_notes where coaching_id = tests.i('pair_ae') $$,
  $$ values ('Great progress this month'::text) $$,
  'coaching_notes: A still reads the note of the ended pair'
);
select results_eq(
  $$ update public.coaching_notes set body = 'Great progress in October' where coaching_id = tests.i('pair_ae') returning body $$,
  $$ values ('Great progress in October'::text) $$,
  'coaching_notes: A still edits the note of the ended pair'
);
select tests.authenticate_as('client_e');
select results_eq(
  $$ select body from public.coaching_notes $$, $$ values ('Great progress in October'::text) $$,
  'coaching_notes: E keeps reading the note A showed, after the pair ended'
);
select tests.clear_authentication();

-- =========================================================================================================
-- intakes: writing

select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.intakes (user_id, form_version, answers, parq_answers)
     values (tests.u('client_c'), 'v1', '{"goal":"strength"}', '{"q1":false,"q2":true}') $$,
  'intakes: C submits an intake'
);
select results_eq(
  $$ select parq_flagged, submitted_at from public.intakes $$, $$ values (true, now()) $$,
  'intakes: parq_flagged is computed from the answers and submitted_at is now()'
);
select throws_ok(
  $$ insert into public.intakes (user_id, form_version, answers, parq_answers, parq_flagged)
     values (tests.u('client_c'), 'v2', '{}', '{"q1":true}', false) $$,
  '428C9', null, 'intakes: supplying parq_flagged raises an error'
);
select throws_ok(
  $$ insert into public.intakes (user_id, form_version, answers, parq_answers, submitted_at)
     values (tests.u('client_c'), 'v2', '{}', '{}', '2020-01-01') $$,
  '42501', null, 'intakes: submitted_at cannot be supplied'
);
select throws_ok(
  $$ insert into public.intakes (user_id, form_version, answers, parq_answers)
     values (tests.u('client_d'), 'v1', '{}', '{}') $$,
  '42501', 'new row violates row-level security policy for table "intakes"',
  'intakes: C cannot submit an intake for D'
);
select throws_ok(
  $$ update public.intakes set answers = '{"goal":"mass"}' $$,
  '42501', null, 'intakes: update raises 42501 (a new answer is a new version)'
);
select tests.clear_authentication();
insert into public.intakes (user_id, form_version, answers, parq_answers) values
  (tests.u('client_c'), 'v1', '{"goal":"endurance"}', '{"q1":false}'),
  (tests.u('client_d'), 'v1', '{"goal":"health"}', '{"q1":false}'),
  (tests.u('card_m'), 'v1', '{"goal":"posture"}', '{"q1":false}');
select is(
  (select parq_flagged from public.intakes where answers ->> 'goal' = 'endurance'), false,
  'intakes: parq_flagged is false when every answer is no'
);

-- =========================================================================================================
-- intakes: reading (decisions Q38: only with share:intake in a live pair)

select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select user_id from public.intakes $$, array[tests.u('card_m')],
  'intakes: before consent A reads only the card''s intake, not C''s or D''s'
);
select tests.authenticate_as('client_c');
select lives_ok(
  $$ update public.data_shares set intake = true where coaching_id = tests.i('pair_ac') $$,
  'intakes: C shares the intake with A only'
);
select is((select count(*)::integer from public.intakes), 2, 'intakes: C reads both own versions');
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select answers ->> 'goal' from public.intakes where user_id = tests.u('client_c') $$,
  array['strength', 'endurance'],
  'intakes: A reads C''s intake once C shared it'
);
select is_empty(
  $$ select id from public.intakes where user_id = tests.u('client_d') $$,
  'intakes: A still reads 0 rows of D, who did not share'
);
select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.intakes $$, 'intakes: B reads 0 rows of C (not shared with B) and of A''s card');
select tests.authenticate_as('client_d');
select set_eq(
  $$ select user_id from public.intakes $$, array[tests.u('client_d')],
  'intakes: D reads only own intake'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.intakes $$, 'intakes: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.intakes $$, 'intakes: the admin without break-glass reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.intakes $$, '42501', null, 'intakes: anon has no access');
select tests.clear_authentication();

-- Break-glass (ADM-15): only a live, unrevoked grant of this admin that lists intake opens it.
select tests.create_break_glass('admin_x', 'client_c', '{photos,measurements}');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.intakes $$, 'intakes: a grant without intake opens nothing');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{intake}', now() - interval '1 hour', now() - interval '90 minutes');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.intakes $$, 'intakes: an expired intake grant opens nothing');
select tests.clear_authentication();
insert into tests.ids values ('grant_revoked', tests.create_break_glass('admin_x', 'client_c', '{intake}'));
update public.break_glass_grants set revoked_at = now() where id = tests.i('grant_revoked');
select is(
  (select count(*)::integer from public.break_glass_grants where revoked_at is not null), 1,
  'fixture: one revoked intake grant'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.intakes $$, 'intakes: a revoked intake grant opens nothing');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{intake}');
select tests.authenticate_as('admin_x');
select bag_eq(
  $$ select user_id from public.intakes $$, array[tests.u('client_c'), tests.u('client_c')],
  'intakes: a live intake grant shows C''s intake to that admin, and nobody else''s'
);
select is_empty($$ select id from public.coaching_notes $$, 'coaching_notes: an intake grant does not open trainer notes');
select tests.authenticate_as('admin_y');
select is_empty($$ select id from public.intakes $$, 'intakes: another admin does not benefit from the grant');

-- =========================================================================================================
-- intakes: deleting, and the end of the pair

select tests.authenticate_as('trainer_a');
select is_empty(
  $$ delete from public.intakes where user_id = tests.u('client_c') returning 1 $$,
  'intakes: the trainer cannot delete the client''s intake (0 rows)'
);
select tests.authenticate_as('client_c');
select results_eq(
  $$ delete from public.intakes where answers ->> 'goal' = 'endurance' returning form_version $$,
  $$ values ('v1'::text) $$,
  'intakes: the client deletes an own version'
);
select tests.clear_authentication();

-- The pair ends: A loses the intake (personal data) but keeps the pair, the shares row and the notes.
update public.coachings set status = 'ended', ended_at = now() where id = tests.i('pair_ac');
select tests.authenticate_as('trainer_a');
select is_empty(
  $$ select id from public.intakes where user_id = tests.u('client_c') $$,
  'intakes: after the A-C pair ends A reads 0 rows, although the share flag is still on'
);
select ok(
  exists (select 1 from public.coachings where id = tests.i('pair_ac'))
  and exists (select 1 from public.data_shares where coaching_id = tests.i('pair_ac') and intake),
  'after the end A still reads the pair and its shares'
);
select results_eq(
  $$ select body from public.coaching_notes where coaching_id = tests.i('pair_ac') $$,
  $$ values ('Left knee hurts below 90 degrees'::text) $$,
  'coaching_notes: after the end A still reads the A-C note'
);
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.intakes), 1, 'intakes: C still reads own intake after the pair ended');
select tests.clear_authentication();

select * from finish();
rollback;

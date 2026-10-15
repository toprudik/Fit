-- Workouts policies of migration 20261015123700_workouts_policies.sql (contract §6 500_workouts): the exercise
-- catalog (WORK-2, R61), templates (R51), workout logs with share:workouts for self logs (Q38, PRIV-4, R42, R62),
-- their exercises and sets, and personal records (WORK-4, R43).
begin;
\ir _helpers.psql
select plan(140);

-- Fixtures: C has live pairs to A, B and F; D a live pair to A; E an ended pair to A. S is a plain user.
-- admin_x gets break-glass grants on C; admin_y never has one.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_f');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_f', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');

-- Ids are generated up front, so rows written by users can be named in later assertions.
create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('session_a1', tests.create_session('trainer_a', now() - interval '1 day')),
  ('session_a2', tests.create_session('trainer_a', now() - interval '2 days'));
insert into tests.ids values
  ('booking_ac', tests.create_booking((select id from tests.ids where name = 'session_a1'), 'trainer_a', 'client_c')),
  ('booking_ad', tests.create_booking((select id from tests.ids where name = 'session_a2'), 'trainer_a', 'client_d'));
insert into tests.ids
select n, gen_random_uuid() from unnest(array[
  'squat', 'bench', 'pullup', 'ex_a', 'ex_b', 'ex_f',
  'tpl_a', 'tpl_b', 'item_1', 'item_2',
  'log_ac', 'log_spoof', 'log_ac_del', 'log_pr', 'log_bc', 'log_c_self', 'log_c_pr', 'log_d_self',
  'le_ac', 'le_ac_del', 'le_pr', 'le_c_self', 'le_c_f', 'le_c_pr',
  'set_ac', 'set_ac_del', 'set_95', 'set_100', 'set_120w', 'set_c_self', 'set_bw', 'set_weighted'
]) n;
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- The catalog (written by the import job) and the custom exercises of B and F.
insert into public.exercises (id, source, wger_id, name, license) values
  (tests.i('squat'), 'wger', 1, 'Squat', 'CC-BY-SA-4.0'),
  (tests.i('bench'), 'wger', 2, 'Bench press', 'CC-BY-SA-4.0'),
  (tests.i('pullup'), 'wger', 3, 'Pull-up', 'CC-BY-SA-4.0');
insert into public.exercise_translations (exercise_id, locale, name) values (tests.i('squat'), 'ru', 'Приседания');
insert into public.exercises (id, source, owner_id, name) values
  (tests.i('ex_b'), 'custom', tests.u('trainer_b'), 'B sled push'),
  (tests.i('ex_f'), 'custom', tests.u('trainer_f'), 'F band walk');
insert into public.workout_templates (id, owner_id, title) values (tests.i('tpl_b'), tests.u('trainer_b'), 'B legs');

-- =========================================================================================================
-- exercises (WORK-2)

select tests.authenticate_as('stranger_s');
select is(
  (select count(*)::integer from public.exercises where source = 'wger'), 3,
  'exercises: wger rows are readable by anyone signed in'
);
select is(
  (select name from public.exercise_translations where exercise_id = tests.i('squat') and locale = 'ru'), 'Приседания',
  'exercise_translations: wger translations are readable by anyone signed in'
);

select tests.authenticate_as_anon();
select throws_ok($$ select id from public.exercises $$, '42501', null, 'exercises: anon gets nothing');

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.exercises (id, source, owner_id, name, muscles_primary, video_url)
     values (tests.i('ex_a'), 'custom', tests.u('trainer_a'), 'A hip airplane', '{glutes}', 'https://example.com/v') $$,
  'exercises: A adds a custom exercise'
);
select throws_ok(
  $$ insert into public.exercises (source, owner_id, name) values ('custom', tests.u('trainer_b'), 'In B''s name') $$,
  '42501', 'new row violates row-level security policy for table "exercises"',
  'exercises: A cannot add a custom exercise owned by B'
);
select throws_ok(
  $$ insert into public.exercises (source, owner_id, name, license) values ('wger', null, 'Fake import', 'CC-BY-SA-4.0') $$,
  '42501', 'new row violates row-level security policy for table "exercises"',
  'exercises: A cannot add a wger row'
);
select throws_ok(
  $$ insert into public.exercises (source, owner_id, name, image_path)
     values ('custom', tests.u('trainer_a'), 'Wrong folder', 'custom/' || tests.u('trainer_b') || '/x.webp') $$,
  '23514', null, 'exercises: an image outside A''s custom folder violates the check'
);

select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.exercises (source, owner_id, name) values ('custom', tests.u('client_c'), 'My own move') $$,
  '42501', 'new row violates row-level security policy for table "exercises"',
  'exercises: C, not a trainer, cannot add a custom exercise'
);

-- Who sees A's custom exercise: A and every client of A, in any pair status; not B or a stranger.
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_a')), 1, 'exercises: A reads own custom exercise');
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_a')), 1, 'exercises: C (live pair) reads A''s custom exercise');
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_a')), 1, 'exercises: D (live pair) reads A''s custom exercise');
select tests.authenticate_as('client_e');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_a')), 1, 'exercises: E (ended pair) still reads A''s custom exercise');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_b')), 0, 'exercises: E does not read B''s custom exercise');
select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_a')), 0, 'exercises: B does not read A''s custom exercise (WORK-2)');
select tests.authenticate_as('stranger_s');
select is((select count(*)::integer from public.exercises where source = 'custom'), 0, 'exercises: a stranger reads no custom exercise');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.exercises where source = 'custom'), 0, 'exercises: an admin reads no custom exercise');

-- Updates and deletes
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ update public.exercises set name = 'A hip airplane, slow', archived_at = null where id = tests.i('ex_a') $$,
  'exercises: A updates own custom exercise'
);
select is((select name from public.exercises where id = tests.i('ex_a')), 'A hip airplane, slow', 'exercises: the update is stored');
select is_empty(
  $$ update public.exercises set name = 'Hijacked' where id = tests.i('ex_b') returning 1 $$,
  'exercises: A updating B''s custom exercise changes 0 rows'
);
select is_empty(
  $$ update public.exercises set name = 'Hijacked' where id = tests.i('squat') returning 1 $$,
  'exercises: A updating a wger row changes 0 rows'
);
select throws_ok(
  $$ update public.exercises set owner_id = tests.u('trainer_b') where id = tests.i('ex_a') $$,
  '42501', null, 'exercises: updating owner_id raises 42501'
);
select throws_ok(
  $$ update public.exercises set wger_id = 99 where id = tests.i('ex_a') $$,
  '42501', null, 'exercises: updating wger_id raises 42501'
);
select throws_ok(
  $$ delete from public.exercises where id = tests.i('ex_a') $$,
  '42501', null, 'exercises: delete raises 42501 (archive instead)'
);

-- =========================================================================================================
-- exercise_translations

select lives_ok(
  $$ insert into public.exercise_translations (exercise_id, locale, name, description)
     values (tests.i('ex_a'), 'en', 'Hip airplane', 'Balance on one leg') $$,
  'exercise_translations: A adds a translation to own custom exercise'
);
select throws_ok(
  $$ insert into public.exercise_translations (exercise_id, locale, name) values (tests.i('ex_b'), 'en', 'Not mine') $$,
  '42501', 'new row violates row-level security policy for table "exercise_translations"',
  'exercise_translations: A cannot translate B''s custom exercise'
);
select throws_ok(
  $$ insert into public.exercise_translations (exercise_id, locale, name) values (tests.i('squat'), 'en', 'Squat') $$,
  '42501', 'new row violates row-level security policy for table "exercise_translations"',
  'exercise_translations: A cannot translate a wger exercise'
);
select lives_ok(
  $$ update public.exercise_translations set description = 'Balance on one leg, hinge forward'
     where exercise_id = tests.i('ex_a') and locale = 'en' $$,
  'exercise_translations: A updates own translation'
);
select is_empty(
  $$ update public.exercise_translations set name = 'Hijacked' where exercise_id = tests.i('squat') returning 1 $$,
  'exercise_translations: A updating a wger translation changes 0 rows'
);
select tests.authenticate_as('client_c');
select is(
  (select count(*)::integer from public.exercise_translations where exercise_id = tests.i('ex_a')), 1,
  'exercise_translations: C reads the translation of A''s exercise'
);
select is_empty(
  $$ delete from public.exercise_translations where exercise_id = tests.i('ex_a') returning 1 $$,
  'exercise_translations: C deleting A''s translation changes 0 rows'
);
select tests.authenticate_as('trainer_b');
select is(
  (select count(*)::integer from public.exercise_translations where exercise_id = tests.i('ex_a')), 0,
  'exercise_translations: B does not read A''s translation'
);
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.exercise_translations (exercise_id, locale, name) values (tests.i('ex_a'), 'ru', 'Самолёт') $$,
  'exercise_translations: A adds a second language'
);
select results_eq(
  $$ delete from public.exercise_translations where exercise_id = tests.i('ex_a') and locale = 'ru' returning locale::text $$,
  $$ values ('ru') $$,
  'exercise_translations: A deletes own translation'
);

-- =========================================================================================================
-- workout_templates and workout_template_items

select lives_ok(
  $$ insert into public.workout_templates (id, owner_id, title, notes) values (tests.i('tpl_a'), tests.u('trainer_a'), 'A full body', 'Week 1') $$,
  'workout_templates: A creates a template'
);
select lives_ok(
  $$ insert into public.workout_template_items (id, template_id, position, exercise_id, target_sets, target_reps, target_weight_kg)
     values (tests.i('item_1'), tests.i('tpl_a'), 1, tests.i('squat'), 3, 8, 60),
            (tests.i('item_2'), tests.i('tpl_a'), 2, tests.i('ex_a'), 3, 10, null) $$,
  'workout_template_items: A adds a wger and an own exercise'
);
select throws_ok(
  $$ insert into public.workout_template_items (template_id, position, exercise_id) values (tests.i('tpl_a'), 3, tests.i('ex_b')) $$,
  '42501', 'new row violates row-level security policy for table "workout_template_items"',
  'workout_template_items: an item with B''s custom exercise fails RLS'
);
select throws_ok(
  $$ insert into public.workout_template_items (template_id, position, exercise_id) values (tests.i('tpl_b'), 1, tests.i('squat')) $$,
  '42501', 'new row violates row-level security policy for table "workout_template_items"',
  'workout_template_items: A cannot add an item to B''s template'
);
select throws_ok(
  $$ insert into public.workout_templates (owner_id, title) values (tests.u('trainer_b'), 'In B''s name') $$,
  '42501', 'new row violates row-level security policy for table "workout_templates"',
  'workout_templates: A cannot create a template owned by B'
);
select lives_ok(
  $$ update public.workout_template_items set position = case position when 1 then 2 else 1 end
     where template_id = tests.i('tpl_a') $$,
  'workout_template_items: swapping two positions in one statement passes'
);
select lives_ok($$ set constraints all immediate $$, 'workout_template_items: the swapped positions are unique');
select throws_ok(
  $$ insert into public.workout_template_items (template_id, position, exercise_id) values (tests.i('tpl_a'), 1, tests.i('bench')) $$,
  '23505', null, 'workout_template_items: a real duplicate position raises 23505'
);
select is(
  (select position::integer from public.workout_template_items where id = tests.i('item_1')), 2,
  'workout_template_items: the swap is stored'
);

select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.workout_templates where id = tests.i('tpl_a')), 0, 'workout_templates: B reads 0 of A''s templates');
select is((select count(*)::integer from public.workout_template_items where template_id = tests.i('tpl_a')), 0, 'workout_template_items: B reads 0 of A''s items');
select is_empty(
  $$ update public.workout_templates set title = 'Hijacked' where id = tests.i('tpl_a') returning 1 $$,
  'workout_templates: B updating A''s template changes 0 rows'
);
select is_empty(
  $$ delete from public.workout_template_items where template_id = tests.i('tpl_a') returning 1 $$,
  'workout_template_items: B deleting A''s items changes 0 rows'
);
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.workout_templates), 0, 'workout_templates: C reads 0 templates');
select is((select count(*)::integer from public.workout_template_items), 0, 'workout_template_items: C reads 0 items');
select throws_ok(
  $$ insert into public.workout_templates (owner_id, title) values (tests.u('client_c'), 'My plan') $$,
  '42501', 'new row violates row-level security policy for table "workout_templates"',
  'workout_templates: C, not a trainer, cannot create a template'
);

-- =========================================================================================================
-- workout_logs: writing

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.workout_logs (id, client_id, coaching_id, booking_id, template_id, title, performed_at, local_date)
     values (tests.i('log_ac'), tests.u('client_c'), tests.i('pair_ac'), tests.i('booking_ac'), tests.i('tpl_a'),
             'Session 1', now() - interval '1 day', current_date - 1) $$,
  'workout_logs: A logs a session of the A-C pair from a template'
);
select is(
  (select created_by from public.workout_logs where id = tests.i('log_ac')), tests.u('trainer_a'),
  'workout_logs: created_by is stamped with A'
);
select lives_ok(
  $$ insert into public.workout_logs (id, client_id, coaching_id, performed_at, local_date)
     values (tests.i('log_ac_del'), tests.u('client_c'), tests.i('pair_ac'), now() - interval '5 days', current_date - 5),
            (tests.i('log_pr'), tests.u('client_c'), tests.i('pair_ac'), now() - interval '3 days', current_date - 3) $$,
  'workout_logs: A adds more A-C pair logs without a booking'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, performed_at, local_date)
     values (tests.u('client_d'), tests.i('pair_ac'), now(), current_date) $$,
  '23503', null, 'workout_logs: the A-C pair with client D raises 23503'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, booking_id, performed_at, local_date)
     values (tests.u('client_c'), tests.i('pair_ac'), tests.i('booking_ad'), now(), current_date) $$,
  '23503', null, 'workout_logs: a booking of the A-D pair on an A-C log raises 23503'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, performed_at, local_date)
     values (tests.u('client_e'), tests.i('pair_ae'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: A cannot log in the ended A-E pair'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, template_id, performed_at, local_date)
     values (tests.u('client_c'), tests.i('pair_ac'), tests.i('tpl_b'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: A cannot use B''s template'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, performed_at, local_date, created_by)
     values (tests.u('client_c'), tests.i('pair_ac'), now(), current_date, tests.u('client_d')) $$,
  '42501', null, 'workout_logs: created_by is not insertable by users'
);

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, performed_at, local_date)
     values (tests.u('client_c'), tests.i('pair_ac'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: B cannot log in the A-C pair'
);
select lives_ok(
  $$ insert into public.workout_logs (id, client_id, coaching_id, performed_at, local_date)
     values (tests.i('log_bc'), tests.u('client_c'), tests.i('pair_bc'), now() - interval '2 days', current_date - 2) $$,
  'workout_logs: B logs in the B-C pair'
);

select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.workout_logs (id, client_id, title, performed_at, local_date)
     values (tests.i('log_c_self'), tests.u('client_c'), 'Run and band work', now() - interval '4 days', current_date - 4),
            (tests.i('log_c_pr'), tests.u('client_c'), 'Pull-ups', now() - interval '6 days', current_date - 6) $$,
  'workout_logs: C writes self logs'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, coaching_id, performed_at, local_date)
     values (tests.u('client_c'), tests.i('pair_ac'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: C cannot write a log with a coaching_id'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, performed_at, local_date) values (tests.u('client_d'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: C cannot write a log for D'
);
select throws_ok(
  $$ insert into public.workout_logs (client_id, booking_id, performed_at, local_date)
     values (tests.u('client_c'), tests.i('booking_ac'), now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: a self log cannot carry a booking'
);

select tests.authenticate_as('client_d');
select lives_ok(
  $$ insert into public.workout_logs (id, client_id, performed_at, local_date)
     values (tests.i('log_d_self'), tests.u('client_d'), now() - interval '1 day', current_date - 1) $$,
  'workout_logs: D writes a self log'
);

-- A spoofed author is overwritten by the invariant stamp even for code that may write the column (a definer
-- RPC runs as postgres with the caller's claims).
select tests.clear_authentication();
select tests.set_claims('trainer_a');
insert into public.workout_logs (id, client_id, coaching_id, performed_at, local_date, created_by)
values (tests.i('log_spoof'), tests.u('client_c'), tests.i('pair_ac'), now() - interval '7 days', current_date - 7, tests.u('client_d'));
select tests.clear_authentication();
select is(
  (select created_by from public.workout_logs where id = tests.i('log_spoof')), tests.u('trainer_a'),
  'workout_logs: a spoofed created_by is overwritten with A'
);

-- =========================================================================================================
-- Children: workout_log_exercises and workout_sets

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.workout_log_exercises (id, log_id, position, exercise_id)
     values (tests.i('le_ac'), tests.i('log_ac'), 1, tests.i('ex_a')),
            (tests.i('le_ac_del'), tests.i('log_ac_del'), 1, tests.i('squat')) $$,
  'workout_log_exercises: A adds exercises to own pair logs'
);
select lives_ok(
  $$ insert into public.workout_sets (id, log_exercise_id, position, reps, weight_kg, rpe)
     values (tests.i('set_ac'), tests.i('le_ac'), 1, 10, null, 7),
            (tests.i('set_ac_del'), tests.i('le_ac_del'), 1, 8, 40, null) $$,
  'workout_sets: A adds sets to own pair logs'
);
select throws_ok(
  $$ insert into public.workout_sets (log_exercise_id, position, weight_kg) values (tests.i('le_ac'), 2, 20) $$,
  '23514', null, 'workout_sets: a set with no reps, time or distance violates the check'
);
select throws_ok(
  $$ insert into public.workout_sets (log_exercise_id, position, reps, rpe) values (tests.i('le_ac'), 2, 5, 11) $$,
  '23514', null, 'workout_sets: rpe 11 violates the check'
);
select throws_ok(
  $$ insert into public.workout_log_exercises (log_id, position, exercise_id) values (tests.i('log_ac'), 2, tests.i('ex_b')) $$,
  '42501', 'new row violates row-level security policy for table "workout_log_exercises"',
  'workout_log_exercises: A cannot log B''s custom exercise'
);

select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.workout_log_exercises (id, log_id, position, exercise_id)
     values (tests.i('le_c_self'), tests.i('log_c_self'), 1, tests.i('ex_a')),
            (tests.i('le_c_f'), tests.i('log_c_self'), 2, tests.i('ex_f')) $$,
  'workout_log_exercises: C logs custom exercises of own trainers in a self log'
);
select lives_ok(
  $$ insert into public.workout_sets (id, log_exercise_id, position, duration_s) values (tests.i('set_c_self'), tests.i('le_c_self'), 1, 45) $$,
  'workout_sets: C adds a timed set to own self log'
);
select throws_ok(
  $$ insert into public.workout_sets (log_exercise_id, position, reps) values (tests.i('le_ac'), 2, 12) $$,
  '42501', 'new row violates row-level security policy for table "workout_sets"',
  'workout_sets: C cannot add a set to A''s log'
);
select throws_ok(
  $$ insert into public.workout_log_exercises (log_id, position, exercise_id) values (tests.i('log_ac'), 2, tests.i('squat')) $$,
  '42501', 'new row violates row-level security policy for table "workout_log_exercises"',
  'workout_log_exercises: C cannot add an exercise to A''s log'
);
select is_empty(
  $$ update public.workout_sets set reps = 20 where id = tests.i('set_ac') returning 1 $$,
  'workout_sets: C editing a set of A''s log changes 0 rows'
);

select tests.authenticate_as('client_d');
select throws_ok(
  $$ insert into public.workout_log_exercises (log_id, position, exercise_id) values (tests.i('log_d_self'), 1, tests.i('ex_b')) $$,
  '42501', 'new row violates row-level security policy for table "workout_log_exercises"',
  'workout_log_exercises: D cannot log a custom exercise of B, who is not D''s trainer'
);

select tests.authenticate_as('trainer_a');
select is_empty(
  $$ update public.workout_sets set duration_s = 90 where id = tests.i('set_c_self') returning 1 $$,
  'workout_sets: A editing a set of C''s self log changes 0 rows'
);
select is_empty(
  $$ delete from public.workout_log_exercises where id = tests.i('le_c_self') returning 1 $$,
  'workout_log_exercises: A deleting an exercise of C''s self log changes 0 rows'
);

select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.workout_log_exercises where log_id = tests.i('log_ac')), 0, 'workout_log_exercises: B reads 0 of the A-C log');
select is((select count(*)::integer from public.workout_sets where id in (tests.i('set_ac'), tests.i('set_ac_del'))), 0, 'workout_sets: B reads 0 A-C sets');

-- =========================================================================================================
-- personal_records (WORK-4)

-- A-C pair log: 95x5, then 100x5, then a warm-up single at 120.
select tests.authenticate_as('trainer_a');
insert into public.workout_log_exercises (id, log_id, position, exercise_id) values (tests.i('le_pr'), tests.i('log_pr'), 1, tests.i('squat'));
insert into public.workout_sets (id, log_exercise_id, position, reps, weight_kg) values (tests.i('set_95'), tests.i('le_pr'), 1, 5, 95);
select tests.clear_authentication();
select results_eq(
  $$ select value, set_id from public.personal_records
     where client_id = tests.u('client_c') and exercise_id = tests.i('squat') and record_type = 'max_weight' $$,
  $$ values (95.00::numeric, tests.i('set_95')) $$,
  'personal_records: 95x5 sets max_weight 95'
);
select tests.authenticate_as('trainer_a');
insert into public.workout_sets (id, log_exercise_id, position, reps, weight_kg) values (tests.i('set_100'), tests.i('le_pr'), 2, 5, 100);
insert into public.workout_sets (id, log_exercise_id, position, reps, weight_kg, is_warmup) values (tests.i('set_120w'), tests.i('le_pr'), 3, 1, 120, true);
select tests.clear_authentication();
select results_eq(
  $$ select value, set_id, achieved_at from public.personal_records
     where client_id = tests.u('client_c') and exercise_id = tests.i('squat') and record_type = 'max_weight' $$,
  $$ values (100.00::numeric, tests.i('set_100'), now() - interval '3 days') $$,
  'personal_records: 100x5 becomes the record on the 100 kg set; the warm-up 120 is ignored'
);
select is(
  (select count(*)::integer from public.personal_records
   where client_id = tests.u('client_c') and exercise_id = tests.i('squat') and record_type = 'max_reps'), 0,
  'personal_records: weighted sets give no max_reps'
);

-- C's self log: 12 bodyweight pull-ups and 15 with 10 kg.
select tests.authenticate_as('client_c');
insert into public.workout_log_exercises (id, log_id, position, exercise_id) values (tests.i('le_c_pr'), tests.i('log_c_pr'), 1, tests.i('pullup'));
insert into public.workout_sets (id, log_exercise_id, position, reps, weight_kg) values
  (tests.i('set_bw'), tests.i('le_c_pr'), 1, 12, null),
  (tests.i('set_weighted'), tests.i('le_c_pr'), 2, 15, 10);
select tests.clear_authentication();
select results_eq(
  $$ select record_type::text, value, set_id from public.personal_records
     where client_id = tests.u('client_c') and exercise_id = tests.i('pullup') order by 1 $$,
  $$ values ('max_reps', 12.00::numeric, tests.i('set_bw')), ('max_weight', 10.00::numeric, tests.i('set_weighted')) $$,
  'personal_records: max_reps counts only unweighted sets'
);

-- Who reads records: the client all; a trainer only records whose set it can read (R43).
select tests.authenticate_as('client_c');
select is(
  (select count(*)::integer from public.personal_records where exercise_id in (tests.i('squat'), tests.i('pullup'))), 3,
  'personal_records: C reads own records'
);
select throws_ok(
  $$ insert into public.personal_records (client_id, exercise_id, record_type, value, achieved_at)
     values (tests.u('client_c'), tests.i('bench'), 'max_weight', 300, now()) $$,
  '42501', null, 'personal_records: insert raises 42501'
);
select throws_ok(
  $$ update public.personal_records set value = 300 where client_id = tests.u('client_c') $$,
  '42501', null, 'personal_records: update raises 42501'
);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select exercise_id, record_type::text from public.personal_records
     where client_id = tests.u('client_c') and exercise_id in (tests.i('squat'), tests.i('pullup')) $$,
  $$ values (tests.i('squat'), 'max_weight'), (tests.i('pullup'), 'max_reps'), (tests.i('pullup'), 'max_weight') $$,
  'personal_records: A reads records of A-C sets and of C''s shared self log'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select exercise_id, record_type::text from public.personal_records
     where client_id = tests.u('client_c') and exercise_id in (tests.i('squat'), tests.i('pullup')) $$,
  $$ values (tests.i('pullup'), 'max_reps'), (tests.i('pullup'), 'max_weight') $$,
  'personal_records: B reads the self-log records but not the record set in the A-C pair'
);
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.personal_records), 0, 'personal_records: D reads none of C''s records');

-- Edits move the record: deleting the 100 kg set reverts to 95; changing the exercise moves it to bench.
select tests.authenticate_as('trainer_a');
delete from public.workout_sets where id = tests.i('set_100');
select tests.clear_authentication();
select results_eq(
  $$ select value, set_id from public.personal_records
     where client_id = tests.u('client_c') and exercise_id = tests.i('squat') and record_type = 'max_weight' $$,
  $$ values (95.00::numeric, tests.i('set_95')) $$,
  'personal_records: deleting the 100 kg set reverts the record to 95'
);
select tests.authenticate_as('trainer_a');
update public.workout_log_exercises set exercise_id = tests.i('bench') where id = tests.i('le_pr');
select tests.clear_authentication();
select set_eq(
  $$ select exercise_id, value, set_id from public.personal_records
     where client_id = tests.u('client_c') and exercise_id in (tests.i('squat'), tests.i('bench')) $$,
  $$ values (tests.i('bench'), 95.00::numeric, tests.i('set_95')), (tests.i('squat'), 40.00::numeric, tests.i('set_ac_del')) $$,
  'personal_records: changing the exercise moves the record; squat falls back to the 40 kg set of another log'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.workout_logs where id = tests.i('log_pr') returning id $$,
  $$ values (tests.i('log_pr')) $$,
  'workout_logs: A deletes a pair log A wrote'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from public.personal_records where client_id = tests.u('client_c') and exercise_id = tests.i('bench')), 0,
  'personal_records: deleting the log removes the record'
);

-- =========================================================================================================
-- workout_logs: visibility while all pairs are live and share workouts

select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.workout_logs $$,
  $$ values (tests.i('log_ac')), (tests.i('log_spoof')), (tests.i('log_ac_del')), (tests.i('log_bc')),
            (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: C reads every own log, pair and self'
);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_ac')), (tests.i('log_spoof')), (tests.i('log_ac_del')), (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: A reads the A-C pair logs and C''s shared self logs, not the B-C log'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_bc')), (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: B reads the B-C log and C''s shared self logs, never the A-C pair logs'
);
select is(
  (select count(*)::integer from public.workout_sets where id = tests.i('set_c_self')), 1,
  'workout_sets: B reads the sets of C''s shared self log'
);
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.workout_logs where client_id = tests.u('client_c')), 0, 'workout_logs: D reads none of C''s logs');
select tests.authenticate_as('stranger_s');
select is((select count(*)::integer from public.workout_logs), 0, 'workout_logs: a stranger reads 0 rows');

-- =========================================================================================================
-- workout_logs: edits and deletes (R42)

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.workout_logs set title = 'Session 1, legs', duration_min = 55 where id = tests.i('log_ac') returning title $$,
  $$ values ('Session 1, legs') $$,
  'workout_logs: the author edits the pair log'
);
select throws_ok(
  $$ update public.workout_logs set client_id = tests.u('client_d') where id = tests.i('log_ac') $$,
  '42501', null, 'workout_logs: updating client_id raises 42501'
);
select throws_ok(
  $$ update public.workout_logs set created_by = tests.u('client_c') where id = tests.i('log_ac') $$,
  '42501', null, 'workout_logs: updating created_by raises 42501'
);
select throws_ok(
  $$ update public.workout_logs set coaching_id = null where id = tests.i('log_ac') $$,
  '42501', null, 'workout_logs: updating coaching_id raises 42501'
);
select throws_ok(
  $$ update public.workout_logs set template_id = tests.i('tpl_b') where id = tests.i('log_ac') $$,
  '42501', 'new row violates row-level security policy for table "workout_logs"',
  'workout_logs: the author cannot point the log at B''s template'
);
select is_empty(
  $$ update public.workout_logs set title = 'Mine now' where id = tests.i('log_c_self') returning 1 $$,
  'workout_logs: A editing C''s self log changes 0 rows'
);
select is_empty(
  $$ delete from public.workout_logs where id = tests.i('log_c_self') returning 1 $$,
  'workout_logs: A deleting C''s self log changes 0 rows'
);

select tests.authenticate_as('trainer_b');
select is_empty(
  $$ delete from public.workout_logs where id = tests.i('log_ac') returning 1 $$,
  'workout_logs: B deleting an A-C log changes 0 rows'
);

select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.workout_logs set title = 'Edited by C' where id = tests.i('log_ac') returning 1 $$,
  'workout_logs: C editing A''s log changes 0 rows'
);
select results_eq(
  $$ update public.workout_logs set notes = 'Felt strong' where id = tests.i('log_c_self') returning notes $$,
  $$ values ('Felt strong') $$,
  'workout_logs: C edits own self log'
);
select results_eq(
  $$ delete from public.workout_logs where id = tests.i('log_ac_del') returning id $$,
  $$ values (tests.i('log_ac_del')) $$,
  'workout_logs: C deletes A''s pair log'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from public.workout_log_exercises where log_id = tests.i('log_ac_del'))
    + (select count(*)::integer from public.workout_sets where id = tests.i('set_ac_del')), 0,
  'workout_logs: the exercises and sets of the deleted log cascade'
);

-- A deletes a template: the log keeps existing with template_id null (R51).
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.workout_templates where id = tests.i('tpl_a') returning id $$,
  $$ values (tests.i('tpl_a')) $$,
  'workout_templates: A deletes own template'
);
select tests.clear_authentication();
select results_eq(
  $$ select template_id from public.workout_logs where id = tests.i('log_ac') $$,
  $$ values (null::uuid) $$,
  'workout_templates: the log keeps template_id null'
);
select is(
  (select count(*)::integer from public.workout_template_items where template_id = tests.i('tpl_a')), 0,
  'workout_templates: the items go with the template'
);

-- =========================================================================================================
-- share:workouts (Q38, PRIV-4) and break-glass

select tests.set_share('trainer_a', 'client_c', 'workouts', false);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_ac')), (tests.i('log_spoof')) $$,
  'workout_logs: with workouts off, A reads the pair logs but no self log'
);
select set_eq(
  $$ select exercise_id, record_type::text from public.personal_records where client_id = tests.u('client_c') $$,
  $$ values (tests.i('ex_a'), 'max_reps') $$,
  'personal_records: with workouts off, A reads only the record set in the pair log'
);
select is(
  (select count(*)::integer from public.workout_sets where id = tests.i('set_c_self')), 0,
  'workout_sets: with workouts off, A does not read self-log sets'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_bc')), (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: B still reads C''s self logs (PRIV-4)'
);
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'workouts', true);

-- Admins: nothing without break-glass; a live workouts grant opens the self logs only for the admin who holds it.
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.workout_logs), 0, 'workout_logs: an admin without break-glass reads 0 rows');
select is((select count(*)::integer from public.workout_sets), 0, 'workout_sets: an admin without break-glass reads 0 rows');
select is((select count(*)::integer from public.personal_records), 0, 'personal_records: an admin without break-glass reads 0 rows');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{measurements}');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.workout_logs), 0, 'workout_logs: a measurements grant does not open workouts');
select tests.clear_authentication();
insert into tests.ids values ('bg_x', tests.create_break_glass('admin_x', 'client_c', '{workouts}'));
select tests.create_break_glass('admin_y', 'client_c', '{workouts}', now() - interval '90 minutes', now() - interval '2 hours');
select tests.authenticate_as('admin_x');
select set_eq(
  $$ select id from public.workout_logs $$,
  $$ values (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: a live workouts grant shows the admin C''s self logs, not the pair logs'
);
select set_eq(
  $$ select exercise_id, record_type::text from public.personal_records $$,
  $$ values (tests.i('ex_a'), 'max_duration'), (tests.i('pullup'), 'max_reps'), (tests.i('pullup'), 'max_weight') $$,
  'personal_records: the admin with the grant reads only the records set in self logs'
);
select tests.authenticate_as('admin_y');
select is((select count(*)::integer from public.workout_logs), 0, 'workout_logs: an expired grant shows nothing');
select tests.clear_authentication();
update public.break_glass_grants set revoked_at = now() where id = tests.i('bg_x');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.workout_logs), 0, 'workout_logs: a revoked grant shows nothing');

-- =========================================================================================================
-- The A-C pair ends, then is deleted (R62)

select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = tests.i('pair_ac');
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_ac')), (tests.i('log_spoof')) $$,
  'workout_logs: after the A-C pair ends, A keeps the pair logs and loses C''s self logs'
);
select is(
  (select count(*)::integer from public.workout_sets where id = tests.i('set_ac')), 1,
  'workout_sets: after the pair ends, A still reads the pair log sets'
);
select tests.authenticate_as('client_c');
select is(
  (select count(*)::integer from public.exercises where id = tests.i('ex_a')), 1,
  'exercises: after the pair ends, C still reads A''s custom exercise in old logs'
);

select tests.clear_authentication();
delete from public.coachings where id = tests.i('pair_ac');
select results_eq(
  $$ select coaching_id, booking_id, created_by from public.workout_logs where id = tests.i('log_ac') $$,
  $$ values (null::uuid, null::uuid, tests.u('trainer_a')) $$,
  'workout_logs: deleting the pair keeps the log with coaching_id and booking_id null and its trainer author'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select id from public.workout_logs where client_id = tests.u('client_c') $$,
  $$ values (tests.i('log_bc')), (tests.i('log_c_self')), (tests.i('log_c_pr')) $$,
  'workout_logs: the former A-C log is not visible to B even with workouts shared (R62)'
);
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.workout_logs where client_id = tests.u('client_c')), 0, 'workout_logs: A reads none of C''s logs once the pair is gone');
select is_empty(
  $$ update public.workout_logs set title = 'Still mine' where id = tests.i('log_ac') returning 1 $$,
  'workout_logs: A can no longer edit the orphaned log'
);
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.workout_logs where id = tests.i('log_ac')), 1, 'workout_logs: C still reads the orphaned log');

-- =========================================================================================================
-- A trainer deletes the account (R61): F's custom exercise stays for C's log, owned by nobody.

select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_f')), 1, 'exercises: C reads F''s custom exercise while F exists');
select tests.clear_authentication();
select lives_ok($$ delete from auth.users where id = tests.u('trainer_f') $$, 'exercises: deleting F''s account succeeds');
select results_eq(
  $$ select owner_id, source::text from public.exercises where id = tests.i('ex_f') $$,
  $$ values (null::uuid, 'custom') $$,
  'exercises: F''s custom exercise stays with owner_id null'
);
select is(
  (select exercise_id from public.workout_log_exercises where id = tests.i('le_c_f')), tests.i('ex_f'),
  'exercises: C''s log still references it'
);
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.exercises where id = tests.i('ex_f')), 0, 'exercises: nobody reads an orphaned custom exercise');

select * from finish();
rollback;

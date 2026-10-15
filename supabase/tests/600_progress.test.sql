-- Progress policies of migration 20261015123800_progress_policies.sql (contract §6 600_progress): measurements
-- (PROG-1, PRIV-4, R41b), progress photos (PROG-5/6, R52), photo sets and the Free limit (R82, decisions Q64),
-- break-glass on both (ADM-15) and milestones (PROG-8).
begin;
\ir _helpers.psql
select plan(106);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A, M is A's card.
-- admin_x and admin_y are admins; S is a plain user.
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

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d'));
insert into tests.ids
select n, gen_random_uuid() from unnest(array[
  'm_c', 'm_spoof', 'm_ac', 'm_ac2', 'm_bc', 'm_am', 'm_e',
  'p_c', 'p_c2', 'p_e', 'bg_x'
]) n;
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
-- Object name of a progress photo: {client_id}/{photo id}.webp (R52).
create function tests.photo_path(p_client text, p_photo text) returns text language sql stable set search_path = '' as $$
  select tests.user_id(p_client)::text || '/' || tests.i(p_photo)::text || '.webp'
$$;

-- E measured before the pair ended; the A-E pair shares everything, which no longer matters once it ended.
insert into public.measurements (id, client_id, kind, value, measured_at, local_date, entered_by)
values (tests.i('m_e'), tests.u('client_e'), 'weight', 70, now() - interval '30 days', current_date - 30, tests.u('client_e'));
insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
values (tests.i('p_e'), tests.u('client_e'), 'front', current_date - 30, tests.photo_path('client_e', 'p_e'), true, 'auto', 1080, 1440);
select tests.set_share('trainer_a', 'client_e', 'photos', true);

-- =========================================================================================================
-- measurements: writing

select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.measurements (id, client_id, kind, value, measured_at, local_date)
     values (tests.i('m_c'), tests.u('client_c'), 'weight', 82.4, now() - interval '3 days', current_date - 3) $$,
  'measurements: C enters own weight'
);
select is((select entered_by from public.measurements where id = tests.i('m_c')), tests.u('client_c'), 'measurements: entered_by is stamped with C');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
     values (tests.u('client_c'), 'waist', 80, now(), current_date, tests.u('trainer_a')) $$,
  '42501', null, 'measurements: entered_by is not insertable by users'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_d'), 'weight', 60, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'measurements: C cannot enter a value for D'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_c'), 'weight', 0, now(), current_date) $$,
  '23514', null, 'measurements: value 0 violates the check'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_c'), 'custom', 10, now(), current_date) $$,
  '22P02', null, 'measurements: kind custom is not a valid enum value'
);

-- A spoofed author is overwritten even for code that may write the column (a definer RPC runs as postgres).
select tests.clear_authentication();
select tests.set_claims('client_c');
insert into public.measurements (id, client_id, kind, value, measured_at, local_date, entered_by)
values (tests.i('m_spoof'), tests.u('client_c'), 'waist', 81, now() - interval '3 days', current_date - 3, tests.u('trainer_a'));
select tests.clear_authentication();
select is((select entered_by from public.measurements where id = tests.i('m_spoof')), tests.u('client_c'), 'measurements: a spoofed entered_by is overwritten with C');

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.measurements (id, client_id, kind, value, measured_at, local_date)
     values (tests.i('m_ac'), tests.u('client_c'), 'weight', 82.0, now() - interval '1 day', current_date - 1),
            (tests.i('m_ac2'), tests.u('client_c'), 'chest', 101, now() - interval '1 day', current_date - 1) $$,
  'measurements: A enters values for C while measurements are shared'
);
select is((select entered_by from public.measurements where id = tests.i('m_ac')), tests.u('trainer_a'), 'measurements: entered_by is stamped with A');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_e'), 'weight', 71, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'measurements: A cannot enter a value for E (ended pair)'
);
select lives_ok(
  $$ insert into public.measurements (id, client_id, kind, value, measured_at, local_date)
     values (tests.i('m_am'), tests.u('card_m'), 'weight', 95, now(), current_date) $$,
  'measurements: A enters a value for card M'
);
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'measurements', false);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_c'), 'weight', 82, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'measurements: A cannot enter a value for C with the share off'
);
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'measurements', true);

select tests.authenticate_as('trainer_b');
select lives_ok(
  $$ insert into public.measurements (id, client_id, kind, value, measured_at, local_date)
     values (tests.i('m_bc'), tests.u('client_c'), 'hips', 98, now() - interval '2 days', current_date - 2) $$,
  'measurements: B enters a value for C in the B-C pair'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_d'), 'weight', 60, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'measurements: B cannot enter a value for D, who is not B''s client'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('card_m'), 'weight', 60, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'measurements: B cannot enter a value for A''s card M'
);

-- =========================================================================================================
-- measurements: reading (PRIV-4)

select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.measurements $$,
  $$ values (tests.i('m_c')), (tests.i('m_spoof')), (tests.i('m_ac')), (tests.i('m_ac2')), (tests.i('m_bc')) $$,
  'measurements: C reads every own value, whoever entered it (PROG-1)'
);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.measurements where client_id = tests.u('client_c') $$,
  $$ values (tests.i('m_c')), (tests.i('m_spoof')), (tests.i('m_ac')), (tests.i('m_ac2')), (tests.i('m_bc')) $$,
  'measurements: A reads C''s values, including those entered by B'
);
select is((select count(*)::integer from public.measurements where client_id = tests.u('card_m')), 1, 'measurements: A reads card M''s values');
select is((select count(*)::integer from public.measurements where client_id = tests.u('client_e')), 0, 'measurements: A reads none of E''s values after the pair ended');
select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.measurements where client_id = tests.u('card_m')), 0, 'measurements: B reads none of card M''s values');
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.measurements), 0, 'measurements: D reads none of C''s values');
select tests.authenticate_as('stranger_s');
select is((select count(*)::integer from public.measurements), 0, 'measurements: a stranger reads 0 rows');

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'measurements', false);
select tests.authenticate_as('trainer_a');
select is(
  (select count(*)::integer from public.measurements where client_id = tests.u('client_c')), 0,
  'measurements: with C''s share to A off, A reads none, not even its own entries'
);
select is_empty(
  $$ update public.measurements set value = 81.5 where id = tests.i('m_ac') returning 1 $$,
  'measurements: with the share off, A cannot edit its own entry'
);
select is_empty(
  $$ delete from public.measurements where id = tests.i('m_ac') returning 1 $$,
  'measurements: with the share off, A cannot delete its own entry'
);
select tests.authenticate_as('trainer_b');
select is(
  (select count(*)::integer from public.measurements where client_id = tests.u('client_c')), 5,
  'measurements: B still reads all of C''s values (PRIV-4)'
);
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'measurements', true);

-- =========================================================================================================
-- measurements: edits by the author only (R41b, PROG-1)

select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.measurements set value = 80 where id = tests.i('m_ac') returning 1 $$,
  'measurements: C editing A''s entry changes 0 rows'
);
select is_empty(
  $$ delete from public.measurements where id = tests.i('m_ac') returning 1 $$,
  'measurements: C deleting A''s entry changes 0 rows'
);
select results_eq(
  $$ update public.measurements set value = 82.1, note = 'after breakfast' where id = tests.i('m_c') returning value $$,
  $$ values (82.10::numeric) $$,
  'measurements: C edits own entry'
);
select throws_ok(
  $$ update public.measurements set entered_by = tests.u('client_c') where id = tests.i('m_ac') $$,
  '42501', null, 'measurements: updating entered_by raises 42501'
);
select throws_ok(
  $$ update public.measurements set client_id = tests.u('client_d') where id = tests.i('m_c') $$,
  '42501', null, 'measurements: updating client_id raises 42501'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.measurements set value = 81.8 where id = tests.i('m_ac') returning value $$,
  $$ values (81.80::numeric) $$,
  'measurements: A edits its own entry while the share is on'
);
select is_empty(
  $$ update public.measurements set value = 99 where id = tests.i('m_bc') returning 1 $$,
  'measurements: A editing B''s entry changes 0 rows'
);
select is_empty(
  $$ update public.measurements set value = 99 where id = tests.i('m_c') returning 1 $$,
  'measurements: A editing C''s own entry changes 0 rows'
);
select results_eq(
  $$ delete from public.measurements where id = tests.i('m_ac2') returning id $$,
  $$ values (tests.i('m_ac2')) $$,
  'measurements: A deletes its own entry'
);

-- =========================================================================================================
-- progress_photos (PROG-5/6)

select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c'), tests.u('client_c'), 'front', current_date, tests.photo_path('client_c', 'p_c'), true, 'auto+brush', 1080, 1440) $$,
  'progress_photos: C uploads a blurred photo to own folder'
);
select throws_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c2'), tests.u('client_c'), 'side', current_date, tests.photo_path('client_c', 'p_c2'), false, 'auto', 1080, 1440) $$,
  '23514', null, 'progress_photos: face_blurred false violates the check'
);
select throws_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c2'), tests.u('client_c'), 'side', current_date, tests.photo_path('client_d', 'p_c2'), true, 'auto', 1080, 1440) $$,
  '23514', null, 'progress_photos: a path in D''s folder violates the check'
);
select throws_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c2'), tests.u('client_c'), 'side', current_date, tests.photo_path('client_c', 'p_c2'), true, 'magic', 1080, 1440) $$,
  '23514', null, 'progress_photos: blur_method magic violates the check'
);
select throws_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c2'), tests.u('client_c'), 'side', current_date, tests.photo_path('client_c', 'p_c2'), true, 'auto', 0, 1440) $$,
  '23514', null, 'progress_photos: a zero width violates the check'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
     values (tests.i('p_c2'), tests.u('client_c'), 'side', current_date, tests.photo_path('client_c', 'p_c2'), true, 'auto', 1080, 1440) $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'progress_photos: A cannot upload a photo for C (PRD 2.11-6)'
);

-- Photos are closed by default and open per pair.
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 0, 'progress_photos: A reads 0 of C''s photos by default (PROG-5)');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_e')), 0, 'progress_photos: A reads 0 of E''s photos after the pair ended, share or not');
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'photos', true);
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 1, 'progress_photos: A reads C''s photo once photos are shared (PROG-6)');
select is_empty(
  $$ update public.progress_photos set note = 'Nice' where id = tests.i('p_c') returning 1 $$,
  'progress_photos: A updating C''s photo changes 0 rows'
);
select is_empty(
  $$ delete from public.progress_photos where id = tests.i('p_c') returning 1 $$,
  'progress_photos: A deleting C''s photo changes 0 rows'
);
select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 0, 'progress_photos: B still reads 0 (photos are shared with A only)');
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.progress_photos), 0, 'progress_photos: D reads 0 of C''s photos');
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'photos', false);
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 0, 'progress_photos: A reads 0 again after the share is revoked');

select tests.authenticate_as('client_c');
select results_eq(
  $$ update public.progress_photos set note = 'Week 4', angle = 'side' where id = tests.i('p_c') returning note, angle::text $$,
  $$ values ('Week 4', 'side') $$,
  'progress_photos: C updates note and angle'
);
select throws_ok(
  $$ update public.progress_photos set taken_on = current_date - 1 where id = tests.i('p_c') $$,
  '42501', null, 'progress_photos: updating taken_on raises 42501'
);
select throws_ok(
  $$ update public.progress_photos set storage_path = tests.photo_path('client_c', 'p_c2') where id = tests.i('p_c') $$,
  '42501', null, 'progress_photos: updating storage_path raises 42501'
);
select throws_ok(
  $$ update public.progress_photos set face_blurred = false where id = tests.i('p_c') $$,
  '42501', null, 'progress_photos: updating face_blurred raises 42501'
);

-- =========================================================================================================
-- Break-glass (ADM-15): admins read personal data only through a live grant for that category.

select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.measurements), 0, 'break-glass: the admin without a grant reads 0 measurements');
select is((select count(*)::integer from public.progress_photos), 0, 'break-glass: the admin without a grant reads 0 photos');
select tests.clear_authentication();
insert into tests.ids values ('bg_live', tests.create_break_glass('admin_x', 'client_c', '{measurements}'));
select tests.authenticate_as('admin_x');
select is(
  (select count(*)::integer from public.measurements where client_id = tests.u('client_c')), 4,
  'break-glass: with a measurements grant the admin reads C''s measurements'
);
select is((select count(*)::integer from public.measurements where client_id <> tests.u('client_c')), 0, 'break-glass: the grant covers C only');
select is((select count(*)::integer from public.progress_photos), 0, 'break-glass: a measurements grant opens no photos');
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_c'), 'weight', 50, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'break-glass: the grant is read-only; the admin cannot enter values'
);
select is_empty(
  $$ update public.measurements set value = 50 where id = tests.i('m_c') returning 1 $$,
  'break-glass: the admin cannot edit C''s values'
);
select tests.authenticate_as('admin_y');
select is((select count(*)::integer from public.measurements), 0, 'break-glass: another admin does not benefit from the grant');
select tests.clear_authentication();
select tests.create_break_glass('admin_y', 'client_c', '{measurements,photos}', now() - interval '90 minutes', now() - interval '2 hours');
select tests.authenticate_as('admin_y');
select is((select count(*)::integer from public.measurements), 0, 'break-glass: after expiry the admin reads 0 measurements');
select is((select count(*)::integer from public.progress_photos), 0, 'break-glass: after expiry the admin reads 0 photos');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{photos}');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 1, 'break-glass: a photos grant opens C''s photos');
select tests.clear_authentication();
update public.break_glass_grants set revoked_at = now() where id = tests.i('bg_live');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.measurements), 0, 'break-glass: after revocation the admin reads 0 measurements');
select tests.clear_authentication();
delete from public.user_roles where user_id = tests.u('admin_x');
select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.progress_photos), 0, 'break-glass: a former admin reads nothing, even with a live grant');

-- C deletes the photo.
select tests.authenticate_as('client_c');
select results_eq(
  $$ delete from public.progress_photos where id = tests.i('p_c') returning id $$,
  $$ values (tests.i('p_c')) $$,
  'progress_photos: C deletes own photo'
);

-- =========================================================================================================
-- milestones (PROG-8)

-- Nine attended sessions of the A-C pair, one per day, inserted as attended (R74 counts that).
select tests.clear_authentication();
-- Fixture rows are inserted with INSERT ... SELECT: a volatile helper in an UPDATE could run more than once.
create table tests.slots (n integer primary key, session_id uuid not null);
create table tests.marks (n integer primary key, booking_id uuid not null);
insert into tests.slots (n, session_id)
select n, tests.create_session('trainer_a', date_trunc('day', now()) - (30 - n) * interval '1 day' + interval '9 hours')
from generate_series(1, 12) n;
insert into tests.marks (n, booking_id)
select n, tests.create_booking(session_id, 'trainer_a', 'client_c', 'attended') from tests.slots where n <= 9;
select is(
  (select count(*)::integer from public.milestones where coaching_id = tests.i('pair_ac')), 0,
  'milestones: 9 attended sessions give no milestone'
);

-- A no-show and a late cancel do not count.
insert into tests.marks (n, booking_id)
select n, tests.create_booking(session_id, 'trainer_a', 'client_c', 'confirmed') from tests.slots where n in (10, 11, 12);
update public.bookings set status = 'no_show', attendance_marked_at = now()
where id = (select booking_id from tests.marks where n = 10);
update public.bookings set status = 'late_cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = (select booking_id from tests.marks where n = 11);
select is(
  (select count(*)::integer from public.milestones where coaching_id = tests.i('pair_ac')), 0,
  'milestones: a no-show and a late cancel do not count'
);

-- The 10th attended session (marked after a confirmation) gives sessions_10 at that session's start.
update public.bookings set status = 'attended', attendance_marked_at = now()
where id = (select booking_id from tests.marks where n = 12);
select results_eq(
  $$ select kind::text, booking_id, achieved_at from public.milestones where coaching_id = tests.i('pair_ac') $$,
  $$ select 'sessions_10', m.booking_id, x.starts_at
     from tests.marks m join tests.slots s on s.n = m.n join public.sessions x on x.id = s.session_id where m.n = 12 $$,
  'milestones: the 10th attended session gives sessions_10 with achieved_at = session start'
);

-- Re-marking: attended -> no_show keeps the row; no_show -> attended does not duplicate it.
update public.bookings set status = 'no_show' where id = (select booking_id from tests.marks where n = 12);
select is(
  (select count(*)::integer from public.milestones where coaching_id = tests.i('pair_ac')), 1,
  'milestones: attended -> no_show keeps the milestone'
);
update public.bookings set status = 'attended' where id = (select booking_id from tests.marks where n = 12);
update public.bookings set status = 'attended' where id = (select booking_id from tests.marks where n = 10);
select is(
  (select count(*)::integer from public.milestones where coaching_id = tests.i('pair_ac')), 1,
  'milestones: re-marking does not duplicate sessions_10'
);
select is(
  (select booking_id from public.milestones where coaching_id = tests.i('pair_ac')),
  (select booking_id from tests.marks where n = 12),
  'milestones: the milestone keeps the booking that first reached it'
);

-- Who reads milestones: both members of the pair, nobody else.
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.milestones), 1, 'milestones: C reads the pair milestone');
select throws_ok(
  $$ insert into public.milestones (coaching_id, kind, achieved_at) values (tests.i('pair_ac'), 'sessions_25', now()) $$,
  '42501', null, 'milestones: C cannot insert'
);
select throws_ok(
  $$ delete from public.milestones where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'milestones: C cannot delete'
);
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.milestones), 1, 'milestones: A reads the pair milestone');
select throws_ok(
  $$ insert into public.milestones (coaching_id, kind, achieved_at) values (tests.i('pair_ac'), 'sessions_25', now()) $$,
  '42501', null, 'milestones: A cannot insert'
);
select throws_ok(
  $$ update public.milestones set achieved_at = now() where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'milestones: A cannot update'
);
select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.milestones), 0, 'milestones: B reads 0 rows');
select tests.authenticate_as('client_d');
select is((select count(*)::integer from public.milestones), 0, 'milestones: D reads 0 rows');
select tests.authenticate_as('admin_y');
select is((select count(*)::integer from public.milestones), 0, 'milestones: an admin reads 0 rows');

-- =========================================================================================================
-- The A-C pair ends: personal data closes for A, the milestone (attendance history) stays for both.

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'photos', true);
insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
values (tests.i('p_c2'), tests.u('client_c'), 'back', current_date, tests.photo_path('client_c', 'p_c2'), true, 'none_no_face', 1080, 1440);
update public.coachings set status = 'ended', ended_at = now() where id = tests.i('pair_ac');
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.measurements where client_id = tests.u('client_c')), 0, 'ended pair: A reads none of C''s measurements');
select is((select count(*)::integer from public.progress_photos where client_id = tests.u('client_c')), 0, 'ended pair: A reads none of C''s photos');
select is_empty(
  $$ update public.measurements set value = 80 where id = tests.i('m_ac') returning 1 $$,
  'ended pair: A can no longer edit its own entry'
);
select throws_ok(
  $$ insert into public.measurements (client_id, kind, value, measured_at, local_date) values (tests.u('client_c'), 'weight', 82, now(), current_date) $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'ended pair: A cannot enter new values'
);
select is((select count(*)::integer from public.milestones where coaching_id = tests.i('pair_ac')), 1, 'ended pair: A still reads the milestone');
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.milestones), 1, 'ended pair: C still reads the milestone');
select tests.authenticate_as('trainer_b');
select is((select count(*)::integer from public.measurements where client_id = tests.u('client_c')), 4, 'ended pair: B (live pair) still reads C''s measurements');

-- =========================================================================================================
-- Photo sets and the Free photo limit (R82, decisions Q57 and Q64, PRD 2.14-6). A set is the photos of one
-- taken_on date, at most one per angle, on every plan. A Free client starts one new set per calendar month of
-- upload; Premium or a live pair with a paid trainer lifts the limit. A retake replaces the photo: the client
-- deletes the old row, then inserts the new one (UPDATE grants only note and angle).

select tests.clear_authentication();
select results_eq(
  $$ select c.conname::text collate "default", pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
     where c.conrelid = 'public.progress_photos'::regclass and c.contype = 'u' order by 1 $$,
  $$ values ('progress_photos_client_id_taken_on_angle_key', 'UNIQUE (client_id, taken_on, angle)'),
            ('progress_photos_storage_path_key', 'UNIQUE (storage_path)') $$,
  'photo set: progress_photos is unique per client, date and angle (R82)'
);
select hasnt_index('public', 'progress_photos', 'progress_photos_client_id_taken_on_idx',
  'photo set: the old (client_id, taken_on) index is dropped, the unique index serves its reads');
select matches(
  obj_description(
    (select c.oid from pg_catalog.pg_constraint c where c.conname = 'progress_photos_client_id_taken_on_angle_key'),
    'pg_constraint'),
  '^A set is the photos of one date, at most one per angle \(R82, decisions Q64\)',
  'photo set: the constraint comment states the rule'
);
select matches(
  obj_description('private.can_add_progress_photo(date)'::regprocedure, 'pg_proc'),
  'one per angle \(R82, decisions Q64\)',
  'photo set: the comment of can_add_progress_photo describes the decided set'
);

select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_trainer('trainer_p');
select tests.create_pair('trainer_p', 'client_g');
select tests.grant_plan('trainer_p', 'trainer_pro');
-- One photo row of a client for a date, with a fresh id and the matching object name.
create function tests.photo_row(p_client text, p_taken_on date, p_angle public.photo_angle default 'front')
returns public.progress_photos language plpgsql set search_path = '' as $$
declare
  v_row public.progress_photos;
begin
  v_row.id := gen_random_uuid();
  v_row.client_id := tests.user_id(p_client);
  v_row.angle := p_angle;
  v_row.taken_on := p_taken_on;
  v_row.storage_path := tests.user_id(p_client)::text || '/' || v_row.id::text || '.webp';
  v_row.face_blurred := true;
  v_row.blur_method := 'auto';
  v_row.width := 1080;
  v_row.height := 1440;
  return v_row;
end $$;
-- Front photos of the given dates in one insert, as the signed-in user; returns the row count.
create function tests.upload(p_client text, variadic p_dates date[]) returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  select (r).id, (r).client_id, (r).angle, (r).taken_on, (r).storage_path, (r).face_blurred, (r).blur_method, (r).width, (r).height
  from (select tests.photo_row(p_client, d) as r from unnest(p_dates) d) x;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
-- Photos of one date in the given angles in one insert, as the signed-in user; returns the row count.
create function tests.upload_angles(p_client text, p_taken_on date, variadic p_angles public.photo_angle[])
returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  select (r).id, (r).client_id, (r).angle, (r).taken_on, (r).storage_path, (r).face_blurred, (r).blur_method, (r).width, (r).height
  from (select tests.photo_row(p_client, p_taken_on, a) as r from unnest(p_angles) a) x;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
-- The replace path of R82, as the signed-in user: delete the photo of that date and angle, then insert a new
-- one. True when that date and angle then hold exactly the new photo.
create function tests.replace_photo(p_client text, p_taken_on date, p_angle public.photo_angle)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_old uuid;
  v_new public.progress_photos := tests.photo_row(p_client, p_taken_on, p_angle);
begin
  select p.id into v_old from public.progress_photos p
  where p.client_id = v_new.client_id and p.taken_on = p_taken_on and p.angle = p_angle
  order by p.created_at
  limit 1;
  delete from public.progress_photos p where p.id = v_old;
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  values (v_new.id, v_new.client_id, v_new.angle, v_new.taken_on, v_new.storage_path, v_new.face_blurred, v_new.blur_method,
          v_new.width, v_new.height);
  return array(
    select p.id from public.progress_photos p
    where p.client_id = v_new.client_id and p.taken_on = p_taken_on and p.angle = p_angle
  ) = array[v_new.id];
end $$;

select tests.authenticate_as('client_f');
select is(tests.upload_angles('client_f', current_date, 'side'), 1, 'photo limit: a Free client starts a set');
select throws_ok(
  $$ select tests.upload('client_f', current_date - 1) $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'photo limit: a second set in the same month fails for a Free client'
);
select throws_ok(
  $$ select tests.upload('client_f', current_date, current_date - 2) $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'photo limit: a multi-row insert that starts a second set fails as a whole'
);
select throws_ok(
  $$ select tests.upload('client_f', current_date - 40) $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'photo limit: a backdated taken_on still counts in the month of upload'
);
select is(tests.upload_angles('client_f', current_date, 'front', 'back'), 2,
  'photo limit: the missing angles of a set started this month are free');
select throws_ok(
  $$ select tests.upload_angles('client_f', current_date, 'side') $$,
  '23505', 'duplicate key value violates unique constraint "progress_photos_client_id_taken_on_angle_key"',
  'photo set: a second photo of the same date and angle fails'
);
select results_eq(
  $$ select taken_on, array_agg(angle::text order by angle) from public.progress_photos
     where client_id = tests.u('client_f') group by taken_on $$,
  $$ values (current_date, array['front', 'side', 'back']) $$,
  'photo set: the Free client has one set this month, one photo per angle'
);
select ok(tests.replace_photo('client_f', current_date, 'side'),
  'photo set: the client replaces a photo: deletes the old row, then inserts the retake');
select tests.clear_authentication();
select tests.create_user('client_h');
select tests.authenticate_as('client_h');
select throws_ok(
  $$ select tests.upload('client_h', current_date, current_date - 1) $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'photo limit: two new sets in one insert fail, the second row sees the first'
);
select tests.clear_authentication();
select tests.grant_plan('client_f', 'client_premium');
select tests.authenticate_as('client_f');
select is(tests.upload('client_f', current_date - 1, current_date - 2), 2, 'photo limit: with Premium there is no limit');
select tests.authenticate_as('client_g');
select is(tests.upload('client_g', current_date, current_date - 7, current_date - 14), 3,
  'photo limit: a client of a Pro trainer in a live pair has no limit (PLAN-3)');

-- Nobody else can replace a client's photo, not even a trainer who sees it: the delete matches nothing and the
-- insert is refused. The slot keeps G's photo, and one photo per date and angle holds without a Free limit too.
select tests.clear_authentication();
select tests.set_share('trainer_p', 'client_g', 'photos', true);
select tests.authenticate_as('trainer_p');
select throws_ok(
  $$ select tests.replace_photo('client_g', current_date, 'front') $$,
  '42501', 'new row violates row-level security policy for table "progress_photos"',
  'photo set: G''s trainer, who sees the photos, cannot replace one'
);
select tests.authenticate_as('client_g');
select throws_ok(
  $$ select tests.upload_angles('client_g', current_date, 'front') $$,
  '23505', 'duplicate key value violates unique constraint "progress_photos_client_id_taken_on_angle_key"',
  'photo set: G''s front photo still holds its slot; a second one fails on an unlimited plan too'
);

select * from finish();
rollback;

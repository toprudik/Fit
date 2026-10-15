-- Sessions policies of migration 20261015123300_schedule_policies.sql (contract §1.4 file 17, §6 210_sessions):
-- who creates, reads and edits sessions, the hidden meeting_url (R25, SCHED-21), the composite keys to slots,
-- repeats and trial links, and the status machine.
-- public.session_meeting_url() and public.session_occupancy() come with 20261015125000_views.sql.
begin;
\ir _helpers.psql
select plan(55);

-- Fixtures: C and D have live pairs to A, E an ended pair to A; B has no pair with them.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Sessions of A: personal with C confirmed, personal with C requested, personal with C's booking cancelled,
-- an open group, a closed group, an open group that was cancelled. One open group session of B.
insert into tests.ids values
  ('s_conf', tests.create_session('trainer_a', now() + interval '1 day', 'personal', 1, false, 'https://meet.example.com/conf')),
  ('s_req', tests.create_session('trainer_a', now() + interval '2 days', 'personal', 1, false, 'https://meet.example.com/req')),
  ('s_canc', tests.create_session('trainer_a', now() + interval '3 days')),
  ('s_open', tests.create_session('trainer_a', now() + interval '4 days', 'group', 5, true, 'https://meet.example.com/open')),
  ('s_closed', tests.create_session('trainer_a', now() + interval '5 days', 'group', 5)),
  ('s_open_cancelled', tests.create_session('trainer_a', now() + interval '6 days', 'group', 5, true)),
  ('s_b', tests.create_session('trainer_b', now() + interval '1 day', 'group', 5, true));
insert into tests.ids values
  ('bk_conf', tests.create_booking(tests.i('s_conf'), 'trainer_a', 'client_c')),
  ('bk_req', tests.create_booking(tests.i('s_req'), 'trainer_a', 'client_c', 'requested', 'client_slot')),
  ('bk_canc', tests.create_booking(tests.i('s_canc'), 'trainer_a', 'client_c'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.i('bk_canc');
update public.sessions set status = 'cancelled', cancelled_at = now() where id = tests.i('s_open_cancelled');

-- A place of each trainer; an open slot of each; a group repeat and a trial link of B.
with l as (
  insert into public.locations (trainer_id, name) values (tests.u('trainer_a'), 'Gym A'), (tests.u('trainer_b'), 'Gym B')
  returning id, name
)
insert into tests.ids select case name when 'Gym A' then 'loc_a' else 'loc_b' end, id from l;
with s as (
  insert into public.slots (trainer_id, starts_at, ends_at) values
    (tests.u('trainer_a'), now() + interval '10 days', now() + interval '10 days 1 hour'),
    (tests.u('trainer_b'), now() + interval '10 days', now() + interval '10 days 1 hour')
  returning id, trainer_id
)
insert into tests.ids select case when trainer_id = tests.u('trainer_a') then 'slot_a' else 'slot_b' end, id from s;
with r as (
  insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, capacity)
  values (tests.u('trainer_b'), 'FREQ=WEEKLY;BYDAY=TU', '2026-10-20 18:00', 'Europe/Moscow', 60, 'group', 8)
  returning id
)
insert into tests.ids select 'rec_b', id from r;
with t as (
  insert into public.trial_links (trainer_id, title, currency) values (tests.u('trainer_b'), 'Trial B', 'RUB')
  returning id
)
insert into tests.ids select 'tl_b', id from t;

-- =========================================================================================================
-- Insert

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, mode, location_id)
     values (tests.u('trainer_a'), 'personal', 'New personal', now() + interval '20 days', now() + interval '20 days 1 hour',
             'offline', tests.i('loc_a'))
     returning kind::text, status::text, created_by $$,
  $$ values ('personal', 'scheduled', tests.u('trainer_a')) $$,
  'insert: A creates a personal session, scheduled and stamped with created_by = A'
);
select results_eq(
  $$ insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, mode, meeting_url, capacity, open_for_booking)
     values (tests.u('trainer_a'), 'group', 'New group', now() + interval '21 days', now() + interval '21 days 1 hour',
             'online', 'https://meet.example.com/g', 8, true)
     returning kind::text, capacity, created_by $$,
  $$ values ('group', 8::smallint, tests.u('trainer_a')) $$,
  'insert: A creates an open online group session'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode)
     values (tests.u('trainer_a'), 'trial', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline') $$,
  '42501', 'new row violates row-level security policy for table "sessions"',
  'insert: kind trial fails RLS (trial sessions come from book_trial)'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, status, completed_at)
     values (tests.u('trainer_a'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline',
             'completed', now()) $$,
  '42501', null, 'insert: status completed is refused (status is not writable)'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, location_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'online',
             tests.i('loc_a')) $$,
  '23514', 'new row for relation "sessions" violates check constraint "sessions_location_mode_check"', 'insert: an online session with a place violates the check'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, open_for_booking)
     values (tests.u('trainer_a'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline', true) $$,
  '23514', 'new row for relation "sessions" violates check constraint "sessions_open_for_booking_check"', 'insert: open_for_booking on a personal session violates the check'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, location_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline',
             tests.i('loc_b')) $$,
  '23503', null, 'insert: a session of A at B''s place raises 23503'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode)
     values (tests.u('trainer_b'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline') $$,
  '42501', 'new row violates row-level security policy for table "sessions"',
  'insert: A cannot create a session for B'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, slot_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('slot_a')) $$,
  '42501', null, 'insert: slot_id is not writable (booking RPCs set it)'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode)
     values (tests.u('trainer_a'), 'personal', now() + interval '22 days', now() + interval '22 days 1 hour', 'offline') $$,
  '42501', 'new row violates row-level security policy for table "sessions"',
  'insert: a client cannot create a session for the trainer'
);

-- =========================================================================================================
-- Cross-trainer references (as the server): the composite keys refuse another trainer's rows.

select tests.clear_authentication();
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, slot_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('slot_b')) $$,
  '23503', null, 'references: B''s slot_id raises 23503'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, recurrence_id, original_starts_at, capacity)
     values (tests.u('trainer_a'), 'group', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('rec_b'), now() + interval '10 days', 8) $$,
  '23503', null, 'references: B''s recurrence_id raises 23503'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, trial_link_id)
     values (tests.u('trainer_a'), 'trial', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('tl_b')) $$,
  '23503', null, 'references: B''s trial_link_id raises 23503'
);
select lives_ok(
  $$ insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, mode, slot_id)
     values (tests.u('trainer_a'), 'personal', 'On slot', now() + interval '10 days', now() + interval '10 days 1 hour',
             'offline', tests.i('slot_a')) $$,
  'references: a session on A''s own slot is created'
);
select throws_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, slot_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('slot_a')) $$,
  '23505', null, 'references: two live sessions on one slot raise 23505'
);
update public.sessions set status = 'cancelled', cancelled_at = now() where title = 'On slot';
select lives_ok(
  $$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, slot_id)
     values (tests.u('trainer_a'), 'personal', now() + interval '10 days', now() + interval '10 days 1 hour', 'offline',
             tests.i('slot_a')) $$,
  'references: after the first is cancelled, the slot takes a new session'
);

-- =========================================================================================================
-- Visibility (R80, R81)

insert into tests.ids select 's_new_group', id from public.sessions where title = 'New group';
create table tests.a_sessions as select id from public.sessions where trainer_id = tests.u('trainer_a');
grant select on tests.a_sessions to authenticated;

select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.sessions $$, $$ select id from tests.a_sessions $$,
  'visibility: A reads every own session, cancelled ones included, and nothing else'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.sessions $$, array[tests.i('s_b')], 'visibility: B reads 0 of A''s sessions');
select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.sessions $$,
  array[tests.i('s_conf'), tests.i('s_req'), tests.i('s_canc'), tests.i('s_open'), tests.i('s_new_group')],
  'visibility: C reads sessions with own bookings (the cancelled one too) and A''s open scheduled group sessions'
);
select tests.authenticate_as('client_d');
select set_eq(
  $$ select id from public.sessions $$,
  array[tests.i('s_open'), tests.i('s_new_group')],
  'visibility: D without a booking reads only A''s open scheduled group sessions'
);
select tests.authenticate_as('client_e');
select is_empty($$ select id from public.sessions $$, 'visibility: E (ended pair, no bookings) reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.sessions $$, 'visibility: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.sessions $$, 'visibility: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.sessions $$, '42501', null, 'visibility: anon has no access');

-- An ended pair keeps its history: E sees the session of an old booking, not A's open sessions.
select tests.clear_authentication();
insert into tests.ids values ('s_e', tests.create_session('trainer_a', now() - interval '30 days'));
insert into tests.ids values ('bk_e', tests.create_booking(tests.i('s_e'), 'trainer_a', 'client_e', 'attended'));
select tests.authenticate_as('client_e');
select set_eq(
  $$ select id from public.sessions $$, array[tests.i('s_e')],
  'visibility: E reads the session of own past booking after the pair ended'
);

-- =========================================================================================================
-- meeting_url (R25, SCHED-21): never readable as a column; only through session_meeting_url().

select tests.authenticate_as('trainer_a');
select throws_ok($$ select meeting_url from public.sessions $$, '42501', null, 'meeting_url: A cannot select the column');
select throws_ok($$ select * from public.sessions $$, '42501', null, 'meeting_url: select * fails for A (list the columns)');
select throws_ok(
  $$ update public.sessions set meeting_url = 'https://meet.example.com/new' where id = tests.i('s_conf') $$,
  '42501', null, 'meeting_url: not writable after insert (an RPC changes it with notifications)'
);
select results_eq(
  $$ select public.session_meeting_url(tests.i('s_conf')) $$, $$ values ('https://meet.example.com/conf'::text) $$,
  'session_meeting_url: A gets the link');
select tests.authenticate_as('client_c');
select throws_ok($$ select meeting_url from public.sessions $$, '42501', null, 'meeting_url: C cannot select the column');
select results_eq(
  $$ select public.session_meeting_url(tests.i('s_conf')) $$, $$ values ('https://meet.example.com/conf'::text) $$,
  'session_meeting_url: C with a confirmed booking gets the link');
select results_eq(
  $$ select public.session_meeting_url(tests.i('s_req')) $$, $$ values (null::text) $$,
  'session_meeting_url: C with only a requested booking gets NULL');
select tests.authenticate_as('client_d');
select throws_ok($$ select meeting_url from public.sessions $$, '42501', null, 'meeting_url: D cannot select the column');
select results_eq(
  $$ select public.session_meeting_url(tests.i('s_open')) $$, $$ values (null::text) $$,
  'session_meeting_url: D gets NULL on an open session without a booking');
select tests.authenticate_as('stranger_s');
select throws_ok($$ select meeting_url from public.sessions $$, '42501', null, 'meeting_url: a stranger cannot select the column');
select results_eq(
  $$ select public.session_meeting_url(tests.i('s_conf')) $$, $$ values (null::text) $$,
  'session_meeting_url: a stranger gets NULL');

-- =========================================================================================================
-- session_occupancy: seat counts without the names of other clients.

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select occupied, capacity from public.session_occupancy(tests.i('s_conf')) $$, $$ values (1, 1::smallint) $$,
  'session_occupancy: A gets the counts');
select tests.authenticate_as('client_c');
select results_eq(
  $$ select occupied, capacity from public.session_occupancy(tests.i('s_conf')) $$, $$ values (1, 1::smallint) $$,
  'session_occupancy: a participant gets the counts');
select tests.authenticate_as('client_d');
select results_eq(
  $$ select occupied, capacity from public.session_occupancy(tests.i('s_open')) $$, $$ values (0, 5::smallint) $$,
  'session_occupancy: D gets the counts of an open session');
select is_empty(
  $$ select occupied from public.session_occupancy(tests.i('s_conf')) $$,
  'session_occupancy: D gets no row for C''s personal session');
select tests.authenticate_as('stranger_s');
select is_empty(
  $$ select occupied from public.session_occupancy(tests.i('s_open')) $$,
  'session_occupancy: a stranger gets no row');

-- =========================================================================================================
-- Update

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.sessions set title = 'Saturday group', capacity = 12, open_for_booking = true
     where id = tests.i('s_closed') returning title, capacity, open_for_booking $$,
  $$ values ('Saturday group', 12::smallint, true) $$,
  'update: A edits title, capacity and open_for_booking'
);
select throws_ok(
  $$ update public.sessions set open_for_booking = true where id = tests.i('s_conf') $$,
  '23514', 'new row for relation "sessions" violates check constraint "sessions_open_for_booking_check"', 'update: opening a personal session for booking violates the check'
);
select throws_ok(
  $$ update public.sessions set starts_at = starts_at + interval '1 hour' where id = tests.i('s_conf') $$,
  '42501', null, 'update: starts_at is not writable (moving is an RPC)'
);
select throws_ok(
  $$ update public.sessions set status = 'cancelled' where id = tests.i('s_conf') $$,
  '42501', null, 'update: status is not writable (cancelling is an RPC)'
);
select throws_ok(
  $$ update public.sessions set trainer_id = tests.u('trainer_b') where id = tests.i('s_conf') $$,
  '42501', null, 'update: trainer_id is not writable'
);
select throws_ok(
  $$ delete from public.sessions where id = tests.i('s_closed') $$,
  '42501', null, 'update: delete raises 42501'
);
select tests.authenticate_as('trainer_b');
select is_empty(
  $$ update public.sessions set title = 'Hacked' where id = tests.i('s_conf') returning 1 $$,
  'update: B cannot update A''s session (0 rows)'
);
select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.sessions set title = 'Mine' where id = tests.i('s_conf') returning 1 $$,
  'update: C cannot update a session it reads (0 rows)'
);
select tests.authenticate_as('client_d');
select is_empty(
  $$ update public.sessions set capacity = 100 where id = tests.i('s_open') returning 1 $$,
  'update: D cannot change the seats of an open session (0 rows)'
);

-- Status machine (R93) applies to every role, the server included.
select tests.clear_authentication();
select throws_ok(
  $$ update public.sessions set status = 'scheduled', cancelled_at = null where id = tests.i('s_open_cancelled') $$,
  'P0001', 'invalid_transition', 'status: cancelled -> scheduled raises invalid_transition'
);
select throws_ok(
  $$ update public.sessions set status = 'completed' where id = tests.i('s_req') $$,
  '23514', 'new row for relation "sessions" violates check constraint "sessions_completed_check"', 'status: completed without completed_at violates the check'
);
select lives_ok(
  $$ update public.sessions set status = 'completed', completed_at = now() where id = tests.i('s_req') $$,
  'status: scheduled -> completed passes'
);
select throws_ok(
  $$ update public.sessions set status = 'scheduled', completed_at = null where id = tests.i('s_req') $$,
  'P0001', 'invalid_transition', 'status: completed -> scheduled raises invalid_transition'
);
select lives_ok(
  $$ update public.sessions set status = 'cancelled', cancelled_at = now() where id = tests.i('s_req') $$,
  'status: completed -> cancelled passes'
);

select * from finish();
rollback;

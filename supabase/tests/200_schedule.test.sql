-- Schedule policies of migration 20261015123300_schedule_policies.sql (contract §1.4 file 17, §6 200_schedule):
-- locations, week_templates, week_template_items, slots, recurrences and the time-zone propagation trigger.
-- Sessions are in 210_sessions.
begin;
\ir _helpers.psql
select plan(100);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
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

insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e'));

-- Places: A has a live and an archived one, B one.
with l as (
  insert into public.locations (trainer_id, name, archived_at) values
    (tests.u('trainer_a'), 'Gym A', null),
    (tests.u('trainer_a'), 'Old gym A', now() - interval '30 days'),
    (tests.u('trainer_b'), 'Gym B', null)
  returning id, name
)
insert into tests.ids select case name when 'Gym A' then 'loc_a' when 'Old gym A' then 'loc_a_old' else 'loc_b' end, id from l;

-- Templates: one active per trainer, with an item on A's.
with t as (
  insert into public.week_templates (trainer_id, name, time_zone, is_active) values
    (tests.u('trainer_a'), 'Week A', 'Europe/Moscow', true),
    (tests.u('trainer_b'), 'Week B', 'Europe/Moscow', true)
  returning id, trainer_id
)
insert into tests.ids select case when trainer_id = tests.u('trainer_a') then 'tmpl_a' else 'tmpl_b' end, id from t;
with x as (
  insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min, location_id)
  values (tests.i('tmpl_a'), 1, '09:00', '12:00', 60, tests.i('loc_a'))
  returning id
)
insert into tests.ids select 'item_a', id from x;

-- Slots of A: open future, open past, closed future, booked future. One open future slot of B.
with s as (
  insert into public.slots (trainer_id, starts_at, ends_at, status) values
    (tests.u('trainer_a'), now() + interval '1 day', now() + interval '1 day 1 hour', 'open'),
    (tests.u('trainer_a'), now() - interval '1 day', now() - interval '23 hours', 'open'),
    (tests.u('trainer_a'), now() + interval '2 days', now() + interval '2 days 1 hour', 'closed'),
    (tests.u('trainer_a'), now() + interval '3 days', now() + interval '3 days 1 hour', 'booked'),
    (tests.u('trainer_b'), now() + interval '1 day', now() + interval '1 day 1 hour', 'open')
  returning id, trainer_id, status, starts_at
)
insert into tests.ids
select case
  when trainer_id = tests.u('trainer_b') then 'slot_b'
  when status = 'open' and starts_at > now() then 'slot_open'
  when status = 'open' then 'slot_past'
  when status = 'closed' then 'slot_closed'
  else 'slot_booked' end, id
from s;

-- A group repeat of B, for the cross-trainer and time-zone cases.
with x as (
  insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, capacity)
  values (tests.u('trainer_b'), 'FREQ=WEEKLY;BYDAY=TU', '2026-10-20 18:00', 'Europe/Moscow', 60, 'group', 8)
  returning id
)
insert into tests.ids select 'rec_b', id from x;

-- =========================================================================================================
-- locations

select tests.authenticate_as('trainer_a');
select set_eq($$ select name from public.locations $$, array['Gym A', 'Old gym A'], 'locations: A reads own places, archived included');
select lives_ok(
  $$ insert into public.locations (trainer_id, name, lat, lng) values (tests.u('trainer_a'), 'Park A', 55.75, 37.62) $$,
  'locations: A inserts a place with own trainer_id'
);
select throws_ok(
  $$ insert into public.locations (trainer_id, name) values (tests.u('trainer_b'), 'Fake B') $$,
  '42501', 'new row violates row-level security policy for table "locations"',
  'locations: A cannot insert a place for B'
);
select results_eq(
  $$ update public.locations set name = 'Gym A2', archived_at = now() where id = tests.i('loc_a') returning name $$,
  $$ values ('Gym A2') $$,
  'locations: A renames and archives own place'
);
select throws_ok(
  $$ update public.locations set trainer_id = tests.u('trainer_b') where id = tests.i('loc_a') $$,
  '42501', null, 'locations: trainer_id is not writable'
);
select throws_ok(
  $$ delete from public.locations where id = tests.i('loc_a_old') $$,
  '42501', null, 'locations: delete is refused (archive instead)'
);
select throws_ok(
  $$ insert into public.locations (trainer_id, name, lat, lng) values (tests.u('trainer_a'), 'North', 95, 10) $$,
  '23514', 'new row for relation "locations" violates check constraint "locations_lat_check"', 'locations: lat 95 violates the check'
);
select throws_ok(
  $$ insert into public.locations (trainer_id, name, lat) values (tests.u('trainer_a'), 'Half', 55) $$,
  '23514', 'new row for relation "locations" violates check constraint "locations_coordinates_check"', 'locations: lat without lng violates the check'
);

select tests.authenticate_as('client_c');
select set_eq(
  $$ select name from public.locations $$, array['Gym A2', 'Old gym A', 'Park A', 'Gym B'],
  'locations: C reads the places of both trainers, archived included'
);
select throws_ok(
  $$ insert into public.locations (trainer_id, name) values (tests.u('trainer_a'), 'Fake A') $$,
  '42501', 'new row violates row-level security policy for table "locations"',
  'locations: a client cannot insert a place for the trainer'
);
select throws_ok(
  $$ insert into public.locations (trainer_id, name) values (tests.u('client_c'), 'My place') $$,
  '23503', null, 'locations: a client is not a trainer, so a place of their own fails the foreign key'
);
select is_empty(
  $$ update public.locations set name = 'Hacked' where id = tests.i('loc_b') returning 1 $$,
  'locations: C cannot update B''s place (0 rows)'
);

select tests.authenticate_as('client_e');
select set_eq(
  $$ select name from public.locations $$, array['Gym A2', 'Old gym A', 'Park A'],
  'locations: E (ended pair) still reads A''s places (reference data, R81)'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select name from public.locations $$, array['Gym B'], 'locations: B reads 0 of A''s places');
select is_empty(
  $$ update public.locations set name = 'Hacked' where id = tests.i('loc_a') returning 1 $$,
  'locations: B cannot update A''s place (0 rows)'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.locations $$, 'locations: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.locations $$, 'locations: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.locations $$, '42501', null, 'locations: anon has no access');

-- A trial link may only name a place of its own trainer (composite foreign key).
select tests.clear_authentication();
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency, location_id)
     values (tests.u('trainer_a'), 'Trial', 'RUB', tests.i('loc_b')) $$,
  '23503', null, 'locations: a trial link of A pointing at B''s place raises 23503'
);

-- =========================================================================================================
-- week_templates and week_template_items

select tests.authenticate_as('trainer_a');
select set_eq($$ select id from public.week_templates $$, array[tests.i('tmpl_a')], 'week_templates: A reads only own templates');
select throws_ok(
  $$ insert into public.week_templates (trainer_id, name, time_zone, is_active)
     values (tests.u('trainer_a'), 'Summer', 'Europe/Moscow', true) $$,
  '23505', null, 'week_templates: a second active template raises 23505'
);
select lives_ok(
  $$ insert into public.week_templates (trainer_id, name, time_zone, buffer_min)
     values (tests.u('trainer_a'), 'Winter', 'Europe/Moscow', 10) $$,
  'week_templates: A adds an inactive template'
);
select throws_ok(
  $$ insert into public.week_templates (trainer_id, name, time_zone) values (tests.u('trainer_b'), 'Fake', 'Europe/Moscow') $$,
  '42501', 'new row violates row-level security policy for table "week_templates"',
  'week_templates: A cannot insert a template for B'
);
select results_eq(
  $$ update public.week_templates set horizon_weeks = 6, buffer_min = 15 where id = tests.i('tmpl_a')
     returning horizon_weeks, buffer_min $$,
  $$ values (6::smallint, 15::smallint) $$,
  'week_templates: A edits the horizon and the buffer'
);
select throws_ok(
  $$ update public.week_templates set generated_until = current_date where id = tests.i('tmpl_a') $$,
  '42501', null, 'week_templates: generated_until is not writable'
);
select throws_ok(
  $$ update public.week_templates set trainer_id = tests.u('trainer_b') where id = tests.i('tmpl_a') $$,
  '42501', null, 'week_templates: trainer_id is not writable'
);
select is_empty(
  $$ delete from public.week_templates where id = tests.i('tmpl_b') returning 1 $$,
  'week_templates: A cannot delete B''s template (0 rows)'
);

-- Items
select set_eq($$ select id from public.week_template_items $$, array[tests.i('item_a')], 'week_template_items: A reads own items');
select lives_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min, mode, meeting_url)
     values (tests.i('tmpl_a'), 3, '18:00', '20:00', 60, 'online', 'https://meet.example.com/a') $$,
  'week_template_items: A adds an online window with a link'
);
select throws_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min)
     values (tests.i('tmpl_b'), 1, '09:00', '10:00', 60) $$,
  '42501', 'new row violates row-level security policy for table "week_template_items"',
  'week_template_items: A cannot add an item to B''s template'
);
select throws_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min, location_id)
     values (tests.i('tmpl_a'), 2, '09:00', '10:00', 60, tests.i('loc_b')) $$,
  'P0001', 'location_not_owned', 'week_template_items: an item with B''s place raises location_not_owned'
);
select throws_ok(
  $$ update public.week_template_items set location_id = tests.i('loc_b') where id = tests.i('item_a') $$,
  'P0001', 'location_not_owned', 'week_template_items: moving an item to B''s place raises location_not_owned'
);
select throws_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min)
     values (tests.i('tmpl_a'), 2, '10:00', '10:00', 30) $$,
  '23514', 'new row for relation "week_template_items" violates check constraint "week_template_items_window_check"', 'week_template_items: end_time <= start_time violates the check'
);
select throws_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min)
     values (tests.i('tmpl_a'), 2, '10:00', '10:45', 60) $$,
  '23514', 'new row for relation "week_template_items" violates check constraint "week_template_items_window_check"', 'week_template_items: a window shorter than duration_min violates the check'
);
select throws_ok(
  $$ insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min, mode, meeting_url)
     values (tests.i('tmpl_a'), 2, '10:00', '12:00', 60, 'offline', 'https://meet.example.com/x') $$,
  '23514', 'new row for relation "week_template_items" violates check constraint "week_template_items_meeting_url_mode_check"', 'week_template_items: meeting_url on an offline item violates the check'
);
select throws_ok(
  $$ update public.week_template_items set template_id = tests.i('tmpl_b') where id = tests.i('item_a') $$,
  '42501', null, 'week_template_items: template_id is not writable'
);
select results_eq(
  $$ update public.week_template_items set end_time = '13:00', allow_trial = false where id = tests.i('item_a')
     returning end_time, allow_trial $$,
  $$ values ('13:00'::time, false) $$,
  'week_template_items: A widens the window and turns off trial bookings'
);

select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.week_templates $$, array[tests.i('tmpl_b')], 'week_templates: B reads 0 of A''s templates');
select is_empty($$ select id from public.week_template_items $$, 'week_template_items: B reads 0 of A''s items');
select is_empty(
  $$ delete from public.week_template_items where id = tests.i('item_a') returning 1 $$,
  'week_template_items: B cannot delete A''s item (0 rows)'
);
select tests.authenticate_as('client_c');
select is_empty($$ select id from public.week_templates $$, 'week_templates: C reads 0 rows');
select is_empty($$ select id from public.week_template_items $$, 'week_template_items: C reads 0 rows (the online link stays private, R77)');
select throws_ok(
  $$ insert into public.week_templates (trainer_id, name, time_zone) values (tests.u('trainer_a'), 'Fake', 'Europe/Moscow') $$,
  '42501', null, 'week_templates: a client cannot insert a template for the trainer'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.week_templates $$, 'week_templates: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.week_templates $$, 'week_templates: the admin reads 0 rows');

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ delete from public.week_templates where name = 'Winter' returning name $$,
  $$ values ('Winter') $$,
  'week_templates: A deletes own template'
);

-- =========================================================================================================
-- slots: visibility

select set_eq(
  $$ select id from public.slots $$,
  array[tests.i('slot_open'), tests.i('slot_past'), tests.i('slot_closed'), tests.i('slot_booked')],
  'slots: A reads every own slot'
);
select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.slots $$, array[tests.i('slot_open'), tests.i('slot_b')],
  'slots: C reads only open future slots of both trainers, not past, closed or booked ones'
);
select tests.authenticate_as('client_d');
select set_eq($$ select id from public.slots $$, array[tests.i('slot_open')], 'slots: D reads A''s open future slot');
select tests.authenticate_as('client_e');
select is_empty($$ select id from public.slots $$, 'slots: E (ended pair) reads 0 rows (R81)');
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.slots $$, array[tests.i('slot_b')], 'slots: B reads 0 of A''s slots');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.slots $$, 'slots: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.slots $$, 'slots: the admin reads 0 rows');

-- slots: writes
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at)
     values (tests.u('trainer_a'), now() + interval '1 day 30 minutes', now() + interval '1 day 90 minutes') $$,
  '23P01', null, 'slots: overlapping open slots raise 23P01'
);
select lives_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at, status)
     values (tests.u('trainer_a'), now() + interval '1 day', now() + interval '1 day 3 hours', 'closed') $$,
  'slots: a closed marker may cover an open slot'
);
select lives_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at, location_id)
     values (tests.u('trainer_a'), now() + interval '1 day 1 hour', now() + interval '1 day 2 hours', tests.i('loc_a')) $$,
  'slots: an adjacent open slot is allowed'
);
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at, status)
     values (tests.u('trainer_a'), now() + interval '5 days', now() + interval '5 days 1 hour', 'booked') $$,
  '42501', 'new row violates row-level security policy for table "slots"',
  'slots: A cannot insert a booked slot'
);
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at)
     values (tests.u('trainer_b'), now() + interval '5 days', now() + interval '5 days 1 hour') $$,
  '42501', 'new row violates row-level security policy for table "slots"',
  'slots: A cannot insert a slot for B'
);
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at, location_id)
     values (tests.u('trainer_a'), now() + interval '6 days', now() + interval '6 days 1 hour', tests.i('loc_b')) $$,
  '23503', null, 'slots: a slot at B''s place raises 23503'
);
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at, template_item_id)
     values (tests.u('trainer_a'), now() + interval '7 days', now() + interval '7 days 1 hour', tests.i('item_a')) $$,
  '42501', null, 'slots: template_item_id is not writable on insert'
);
select throws_ok(
  $$ update public.slots set template_item_id = tests.i('item_a') where id = tests.i('slot_open') $$,
  '42501', null, 'slots: template_item_id is not writable on update'
);
select throws_ok(
  $$ update public.slots set status = 'booked' where id = tests.i('slot_open') $$,
  '42501', 'new row violates row-level security policy for table "slots"',
  'slots: A setting booked fails RLS'
);
select is_empty(
  $$ update public.slots set status = 'open' where id = tests.i('slot_booked') returning 1 $$,
  'slots: A cannot reopen a booked slot (0 rows)'
);
select is_empty(
  $$ delete from public.slots where id = tests.i('slot_booked') returning 1 $$,
  'slots: deleting a booked slot changes 0 rows'
);
select results_eq(
  $$ update public.slots set status = 'closed' where id = tests.i('slot_past') returning status::text $$,
  $$ values ('closed') $$,
  'slots: A closes an open slot'
);
select results_eq(
  $$ delete from public.slots where id = tests.i('slot_closed') returning id $$,
  $$ values (tests.i('slot_closed')) $$,
  'slots: A deletes a closed slot'
);
select tests.authenticate_as('trainer_b');
select is_empty(
  $$ delete from public.slots where id = tests.i('slot_open') returning 1 $$,
  'slots: B cannot delete A''s slot (0 rows)'
);
select tests.authenticate_as('client_c');
select is_empty(
  $$ update public.slots set status = 'closed' where id = tests.i('slot_open') returning 1 $$,
  'slots: C cannot update a visible slot (0 rows)'
);
select throws_ok(
  $$ insert into public.slots (trainer_id, starts_at, ends_at)
     values (tests.u('trainer_a'), now() + interval '8 days', now() + interval '8 days 1 hour') $$,
  '42501', null, 'slots: a client cannot insert a slot for the trainer'
);

-- =========================================================================================================
-- recurrences

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind, title)
     values (tests.u('trainer_a'), tests.i('pair_ac'), 'FREQ=WEEKLY;BYDAY=MO,WE', '2026-10-19 10:00', 'Europe/Moscow',
             60, 'personal', 'C weekly') $$,
  'recurrences: A creates a personal repeat on A-C'
);
select lives_ok(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, capacity,
                                     open_for_booking, title)
     values (tests.u('trainer_a'), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA', '2026-10-24 09:00', 'Europe/Moscow', 90, 'group', 10,
             true, 'A group') $$,
  'recurrences: A creates an open group repeat'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
     values (tests.u('trainer_a'), tests.i('pair_bc'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal') $$,
  '23503', null, 'recurrences: a repeat of A on B''s pair raises 23503'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
     values (tests.u('trainer_a'), tests.i('pair_ae'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal') $$,
  '42501', 'new row violates row-level security policy for table "recurrences"',
  'recurrences: a repeat on the ended A-E pair fails RLS'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind)
     values (tests.u('trainer_b'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'group') $$,
  '42501', 'new row violates row-level security policy for table "recurrences"',
  'recurrences: A cannot create a repeat for B'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind, capacity)
     values (tests.u('trainer_a'), tests.i('pair_ac'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal', 2) $$,
  '23514', 'new row for relation "recurrences" violates check constraint "recurrences_personal_capacity_check"', 'recurrences: a personal repeat with capacity 2 violates the check'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind, capacity)
     values (tests.u('trainer_a'), tests.i('pair_ac'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'group', 4) $$,
  '23514', 'new row for relation "recurrences" violates check constraint "recurrences_pair_kind_check"', 'recurrences: a group repeat with a pair violates the check'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind)
     values (tests.u('trainer_a'), 'FREQ=DAILY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'group') $$,
  '23514', 'new row for relation "recurrences" violates check constraint "recurrences_rrule_check"', 'recurrences: a bad rrule violates the check'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, until_date, occurrence_count)
     values (tests.u('trainer_a'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'group', '2026-12-31', 10) $$,
  '23514', 'new row for relation "recurrences" violates check constraint "recurrences_end_check"', 'recurrences: until plus count violates the check'
);
select throws_ok(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, created_by)
     values (tests.u('trainer_a'), 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'group', tests.u('trainer_b')) $$,
  '42501', null, 'recurrences: created_by is not writable'
);
select results_eq(
  $$ update public.recurrences set title = 'C twice a week', until_date = '2026-12-31' where title = 'C weekly'
     returning title $$,
  $$ values ('C twice a week') $$,
  'recurrences: A edits own repeat'
);
select throws_ok(
  $$ update public.recurrences set ended_at = now() where title = 'A group' $$,
  '42501', null, 'recurrences: ended_at is not writable (stopping is an RPC)'
);
select throws_ok(
  $$ update public.recurrences set coaching_id = tests.i('pair_ad') where title = 'C twice a week' $$,
  '42501', null, 'recurrences: coaching_id is not writable'
);
select throws_ok(
  $$ delete from public.recurrences where title = 'A group' $$,
  '42501', null, 'recurrences: delete raises 42501'
);
select is_empty(
  $$ update public.recurrences set title = 'Hacked' where id = tests.i('rec_b') returning 1 $$,
  'recurrences: A cannot update B''s repeat (0 rows)'
);

-- The online link of a repeat is the trainer's (SCHED-21): not granted for SELECT, read through a function.
select lives_ok(
  $$ update public.recurrences set mode = 'online', meeting_url = 'https://meet.example.com/a-room'
     where title = 'C twice a week' $$,
  'recurrences: A sets an online link on own repeat'
);
select throws_ok(
  $$ select meeting_url from public.recurrences $$,
  '42501', null, 'recurrences: meeting_url is not readable directly, not even by A'
);
select results_eq(
  $$ select public.recurrence_meeting_url(id) from public.recurrences where title = 'C twice a week' $$,
  $$ values ('https://meet.example.com/a-room'::text) $$,
  'recurrences: A reads the link through recurrence_meeting_url'
);

select tests.authenticate_as('client_c');
select set_eq(
  $$ select title from public.recurrences $$, array['C twice a week'],
  'recurrences: C reads the personal repeat of own pair, not group repeats'
);
select throws_ok(
  $$ select meeting_url from public.recurrences $$,
  '42501', null, 'recurrences: C cannot read the link of the repeat (no confirmed booking needed to see the repeat)'
);
select throws_ok($$ select * from public.recurrences $$, '42501', null, 'recurrences: select * fails for C');
select results_eq(
  $$ select public.recurrence_meeting_url(id) from public.recurrences where title = 'C twice a week' $$,
  $$ values (null::text) $$,
  'recurrences: recurrence_meeting_url gives C NULL'
);
select is_empty(
  $$ update public.recurrences set title = 'Mine' where title = 'C twice a week' returning 1 $$,
  'recurrences: C cannot update the repeat (0 rows)'
);
select tests.authenticate_as('client_d');
select is_empty($$ select id from public.recurrences $$, 'recurrences: D reads 0 rows');
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.recurrences $$, array[tests.i('rec_b')], 'recurrences: B reads 0 of A''s repeats');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.recurrences $$, 'recurrences: the admin reads 0 rows');

-- created_by is stamped from the caller, also inside a definer RPC that passes another id.
select tests.clear_authentication();
select tests.set_claims('trainer_a');
select results_eq(
  $$ insert into public.recurrences (trainer_id, rrule, dtstart_local, time_zone, duration_min, kind, created_by)
     values (tests.u('trainer_a'), 'FREQ=WEEKLY;BYDAY=FR', '2026-10-23 10:00', 'Europe/Moscow', 60, 'group', tests.u('trainer_b'))
     returning created_by $$,
  $$ values (tests.u('trainer_a')) $$,
  'recurrences: created_by is stamped as A even when another id is sent'
);
select tests.clear_authentication();
select is(
  (select created_by from public.recurrences where title = 'C twice a week'),
  tests.u('trainer_a'),
  'recurrences: a direct insert by A is stamped with A'
);

-- =========================================================================================================
-- Time zone (R24): templates and open repeats follow the trainer; ended repeats and other trainers do not.

update public.recurrences set ended_at = now() where title = 'A group';
update public.user_settings set time_zone = 'Asia/Yekaterinburg' where user_id = tests.u('trainer_a');

select set_eq(
  $$ select distinct time_zone::text from public.week_templates where trainer_id = tests.u('trainer_a') $$,
  array['Asia/Yekaterinburg'],
  'time zone: A''s templates follow the new zone'
);
select set_eq(
  $$ select title, time_zone::text from public.recurrences where trainer_id = tests.u('trainer_a') $$,
  $$ values ('C twice a week', 'Asia/Yekaterinburg'), ('A group', 'Europe/Moscow'), (null, 'Asia/Yekaterinburg') $$,
  'time zone: A''s open repeats follow the new zone, the ended one keeps the old zone'
);
select results_eq(
  $$ select (select time_zone::text from public.week_templates where id = tests.i('tmpl_b')),
            (select time_zone::text from public.recurrences where id = tests.i('rec_b')) $$,
  $$ values ('Europe/Moscow', 'Europe/Moscow') $$,
  'time zone: B''s template and repeat are untouched'
);

select * from finish();
rollback;

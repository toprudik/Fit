-- Privacy matrix cross-check (data-model §4.3, contract §6 950_privacy_matrix), generated per table with format():
-- pair rows never cross the pair boundary (PAIR-1), the admin reads no personal data without break-glass,
-- anon holds no privilege on any public relation, and a trainer's card stays with that trainer.
begin;
\ir _helpers.psql
-- 6 checks per pair-scoped table (13), 2 per personal-data table (10), 11 card checks, 1 sequence check,
-- plus one anon check per public table and view of ours, so a new table is covered without editing this line.
select plan(
  13 * 6 + 10 * 2 + 11 + 1
  + (select count(*)::integer
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = c.oid and d.deptype = 'e'))
);

-- Fixtures: C has live pairs to A and B and shares everything with both, so only the pair boundary can hide
-- a pair row. D is A's other client, M is A's card, S a plain user.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_card('trainer_a', 'card_m');
select tests.set_share(t, 'client_c', c, true)
from unnest(array['trainer_a', 'trainer_b']) t, unnest(enum_range(null::public.share_category)) c;

insert into public.exercises (id, source, wger_id, name, license)
values ('00000000-0000-4000-8000-000000000950', 'wger', 950, 'Squat', 'CC-BY-SA-4.0');

-- One row of every pair-scoped table in the pair (coaching_trainer_meta and data_shares come from triggers).
create function tests.fill_pair(p_trainer text, p_client text) returns void language plpgsql set search_path = '' as $$
declare
  v_pair    uuid := tests.pair_id(p_trainer, p_client);
  v_trainer uuid := tests.user_id(p_trainer);
  v_client  uuid := tests.user_id(p_client);
  v_session uuid;
  v_booking uuid;
  v_pass    uuid;
begin
  insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
  values (v_pair, v_trainer, 'Note of ' || p_trainer, true);
  insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
  values (v_trainer, v_pair, 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal');
  v_session := tests.create_session(p_trainer, now() + interval '1 day');
  v_booking := tests.create_booking(v_session, p_trainer, p_client);
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason)
  values (v_booking, null, 'confirmed', v_trainer, 'trainer', 'test');
  v_pass := tests.create_pass(p_trainer, p_client, 10, 10000);
  insert into public.pass_freezes (pass_id, period, reason)
  values (v_pass, daterange(current_date + 10, current_date + 12), 'trip');
  insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
  values (v_pair, v_pass, 10000, 'RUB', 'cash', now(), 'confirmed');
  insert into public.milestones (coaching_id, kind, achieved_at) values (v_pair, 'sessions_10', now());
  insert into public.workout_logs (client_id, coaching_id, performed_at, local_date, created_by)
  values (v_client, v_pair, now() - interval '1 day', current_date - 1, v_trainer);
end $$;
select tests.fill_pair('trainer_a', 'client_c');
select tests.fill_pair('trainer_b', 'client_c');

-- C's own personal data: a self log with a set (which builds a personal record), a measurement, a photo,
-- an intake, an export and a calendar feed.
insert into public.workout_logs (id, client_id, performed_at, local_date, created_by)
values ('00000000-0000-4000-8000-000000000951', tests.user_id('client_c'), now(), current_date, tests.user_id('client_c'));
insert into public.workout_log_exercises (id, log_id, position, exercise_id)
values ('00000000-0000-4000-8000-000000000952', '00000000-0000-4000-8000-000000000951', 1,
        '00000000-0000-4000-8000-000000000950');
insert into public.workout_sets (log_exercise_id, position, reps, weight_kg)
values ('00000000-0000-4000-8000-000000000952', 1, 5, 100);
insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
values (tests.user_id('client_c'), 'weight', 80, now(), current_date, tests.user_id('client_c'));
insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
values ('00000000-0000-4000-8000-000000000953', tests.user_id('client_c'), 'front', current_date,
        tests.user_id('client_c')::text || '/00000000-0000-4000-8000-000000000953.webp', true, 'auto', 1080, 1440);
insert into public.intakes (user_id, form_version, answers, parq_answers)
values (tests.user_id('client_c'), 'v1', '{"goal": "strength"}', '{"q1": false}');
insert into public.data_exports (user_id) values (tests.user_id('client_c'));
insert into public.calendar_feeds (user_id, zone, token_hash)
values (tests.user_id('client_c'), 'client', sha256('feed-token'::bytea));

-- =========================================================================================================
-- Pair-scoped tables (PAIR-1)

-- How to find a row of a pair (pair_expr, %L = pair id) and how to name it (key_expr), per table.
create table tests.pair_tables (tbl text primary key, key_expr text not null, pair_expr text not null);
insert into tests.pair_tables values
  ('coachings',             't.id::text',          't.id = %L'),
  ('coaching_trainer_meta', 't.coaching_id::text', 't.coaching_id = %L'),
  ('data_shares',           't.coaching_id::text', 't.coaching_id = %L'),
  ('coaching_notes',        't.id::text',          't.coaching_id = %L'),
  ('recurrences',           't.id::text',          't.coaching_id = %L'),
  ('bookings',              't.id::text',          't.coaching_id = %L'),
  ('booking_events',        't.id::text',          't.booking_id in (select b.id from public.bookings b where b.coaching_id = %L)'),
  ('passes',                't.id::text',          't.coaching_id = %L'),
  ('pass_freezes',          't.id::text',          't.pass_id in (select p.id from public.passes p where p.coaching_id = %L)'),
  ('ledger_entries',        't.id::text',          't.coaching_id = %L'),
  ('payments',              't.id::text',          't.coaching_id = %L'),
  ('milestones',            't.id::text',          't.coaching_id = %L'),
  ('workout_logs',          't.id::text',          't.coaching_id = %L');

-- The keys of every pair row, collected as postgres (no RLS).
create table tests.pair_rows (tbl text not null, pair text not null, key text not null);
do $$
declare
  r record;
  p record;
begin
  for r in select * from tests.pair_tables loop
    for p in select * from (values ('ac', tests.pair_id('trainer_a', 'client_c')),
                                   ('bc', tests.pair_id('trainer_b', 'client_c'))) v (pair, id) loop
      execute format('insert into tests.pair_rows select %L, %L, %s from public.%I t where ' || r.pair_expr,
                     r.tbl, p.pair, r.key_expr, r.tbl, p.id);
    end loop;
  end loop;
end $$;
grant select on tests.pair_tables, tests.pair_rows to authenticated;

-- How many rows of the pair the current role reads in the table.
create function tests.pair_rows_read(p_tbl text, p_pair text) returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  execute format(
    'select count(*)::integer from public.%I t where %s in (select r.key from tests.pair_rows r where r.tbl = %L and r.pair = %L)',
    p_tbl, (select k.key_expr from tests.pair_tables k where k.tbl = p_tbl), p_tbl, p_pair)
  into v_count;
  return v_count;
end $$;
create function tests.pair_rows_total(p_tbl text, p_pair text) returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from tests.pair_rows r where r.tbl = p_tbl and r.pair = p_pair
$$;

select ok(
  tests.pair_rows_total(tbl, 'ac') > 0 and tests.pair_rows_total(tbl, 'bc') > 0,
  format('%s: fixtures have rows in the A-C and B-C pairs', tbl)
)
from tests.pair_tables order by tbl;

select tests.authenticate_as('trainer_a');
select is(tests.pair_rows_read(tbl, 'ac'), tests.pair_rows_total(tbl, 'ac'), format('%s: A reads every row of the A-C pair', tbl))
from tests.pair_tables order by tbl;
select is(tests.pair_rows_read(tbl, 'bc'), 0, format('%s: A reads 0 rows of the B-C pair', tbl))
from tests.pair_tables order by tbl;

select tests.authenticate_as('trainer_b');
select is(tests.pair_rows_read(tbl, 'bc'), tests.pair_rows_total(tbl, 'bc'), format('%s: B reads every row of the B-C pair', tbl))
from tests.pair_tables order by tbl;
select is(tests.pair_rows_read(tbl, 'ac'), 0, format('%s: B reads 0 rows of the A-C pair', tbl))
from tests.pair_tables order by tbl;

select tests.authenticate_as('client_d');
select is(tests.pair_rows_read(tbl, 'ac'), 0, format('%s: D, another client of A, reads 0 rows of the A-C pair', tbl))
from tests.pair_tables order by tbl;

-- =========================================================================================================
-- Personal data: the admin reads none of it without break-glass (§4.3)

select tests.clear_authentication();
create table tests.personal_tables (tbl text primary key);
insert into tests.personal_tables values
  ('measurements'), ('progress_photos'), ('intakes'), ('coaching_notes'), ('workout_logs'),
  ('workout_log_exercises'), ('workout_sets'), ('personal_records'), ('data_exports'), ('calendar_feeds');
grant select on tests.personal_tables to authenticated;

-- How many rows of the table the current role reads.
create function tests.rows_read(p_tbl text) returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  execute format('select count(*)::integer from public.%I', p_tbl) into v_count;
  return v_count;
end $$;

select ok(tests.rows_read(tbl) > 0, format('%s: fixtures have rows', tbl)) from tests.personal_tables order by tbl;

select tests.authenticate_as('admin_x');
select is(tests.rows_read(tbl), 0, format('%s: the admin reads 0 rows without break-glass', tbl))
from tests.personal_tables order by tbl;

-- =========================================================================================================
-- anon holds nothing on any public table, view or sequence

select tests.clear_authentication();
select ok(
  not exists (
    select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p (priv)
    where pg_catalog.has_table_privilege('anon', c.oid, p.priv))
  and not pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'),
  format('anon: no table or column privilege on public.%I', c.relname)
)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  -- relations of extensions (pgTAP views when it is installed in public) are not ours
  and not exists (select 1 from pg_catalog.pg_depend d where d.objid = c.oid and d.deptype = 'e')
order by c.relname;

select is_empty(
  $$ select c.relname
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       -- case keeps the planner from probing non-sequences in other schemas before the filter
       and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') end $$,
  'anon: no privilege on any public sequence'
);

-- =========================================================================================================
-- Card M stays with A: B, S and the admin read neither M's profile nor M's pair

create table tests.card (profile_id uuid not null, pair_id uuid not null);
insert into tests.card values (tests.user_id('card_m'), tests.pair_id('trainer_a', 'card_m'));
grant select on tests.card to authenticated;

select tests.authenticate_as('trainer_a');
select isnt_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: A reads M''s profile');
select isnt_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id $$,
  'card: A reads M''s pair');

select tests.authenticate_as('trainer_b');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: B reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: B reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: B reads 0 rows of M''s pair');

select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: S reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: S reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: S reads 0 rows of M''s pair');

select tests.authenticate_as('admin_x');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: the admin reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: the admin reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: the admin reads 0 rows of M''s pair');

select * from finish();
rollback;

-- Trainer schedule, part 1, of migration 20261016193700_schedule_slots.sql (PRD wave-1 §2.6.1, §2.6.7):
-- local_to_utc, save_week_template, the slot generator, close_schedule_days and reopen_schedule.
begin;
\ir _helpers.psql
select plan(29);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

-- A Tuesday at least a week away in Moscow, the trainer's zone: every slot on it is in the future.
create function tests.tuesday() returns date language sql stable set search_path = '' as $$
  select d::date from pg_catalog.generate_series((now() at time zone 'Europe/Moscow')::date + 7,
    (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d where extract(isodow from d) = 2
$$;
create function tests.slots_on(p_day date) returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(to_char(s.starts_at at time zone 'Europe/Moscow', 'HH24:MI') order by s.starts_at), '{}')
  from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.status = 'open'
    and (s.starts_at at time zone 'Europe/Moscow')::date = p_day
$$;

-- =========================================================================================================
-- local_to_utc (PRD 2.6.7-3)

select is(private.local_to_utc('2026-07-01 08:00', 'Europe/Moscow'), '2026-07-01 05:00Z'::timestamptz, 'local time: a plain day');
select is(private.local_to_utc('2026-03-29 08:00', 'Europe/Berlin'), '2026-03-29 06:00Z'::timestamptz, 'local time: 8:00 after spring forward');
select is(private.local_to_utc('2026-03-28 08:00', 'Europe/Berlin'), '2026-03-28 07:00Z'::timestamptz, 'local time: 8:00 before it (SCHED-18)');
select is(private.local_to_utc('2026-03-29 02:30', 'Europe/Berlin'), '2026-03-29 01:00Z'::timestamptz, 'local time: a time in the gap moves to its end');
select is(private.local_to_utc('2026-10-25 02:30', 'Europe/Berlin'), '2026-10-25 00:30Z'::timestamptz, 'local time: an ambiguous time takes the first');
select is(private.local_to_utc('2026-03-08 02:30', 'America/New_York'), '2026-03-08 07:00Z'::timestamptz, 'local time: the gap west of Greenwich');

-- =========================================================================================================
-- save_week_template and the generator (PRD 2.6.1-1, 2, SCHED-1)

select tests.authenticate_as('client_c');
select throws_ok($$ select public.save_week_template('[]') $$, '42501', 'not_a_trainer', 'template: only trainers');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select ok(
  public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60}]') >= 12,
  'template: returns the number of new slots, 4 for each Tuesday ahead'
);
select is(tests.slots_on(tests.tuesday()), array['09:00', '10:00', '11:00', '12:00'], 'template: Tue 9-13 by 60 min gives 4 slots (SCHED-1)');
select is(tests.slots_on(tests.tuesday() + 14), array['09:00', '10:00', '11:00', '12:00'], 'template: on every Tuesday of the 4 weeks');
select is(tests.slots_on(tests.tuesday() + 21), '{}'::text[], 'template: nothing past the horizon');
select is(tests.slots_on(tests.tuesday() + 1), '{}'::text[], 'template: nothing on other days');
select ok((select bool_and(s.starts_at > now()) from public.slots s), 'template: no slot in the past');
select throws_ok(
  $$ select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60},
                                         {"iso_weekday": 2, "start_time": "12:00", "end_time": "14:00", "duration_min": 60}]') $$,
  '22023', 'items_overlap', 'template: windows of one day may not overlap'
);

-- A booked slot survives a change of the template; the rest follows the new template (2.6.1-4).
select tests.clear_authentication();
insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, slot_id)
select s.trainer_id, 'personal', s.starts_at, s.ends_at, 'offline', s.id from public.slots s
where (s.starts_at at time zone 'Europe/Moscow') = tests.tuesday() + time '09:00';
update public.slots set status = 'booked' where (starts_at at time zone 'Europe/Moscow') = tests.tuesday() + time '09:00';
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60}]', 4::smallint, 30::smallint) $$,
  'template: saved again with 30 minutes between slots'
);
select is(tests.slots_on(tests.tuesday() + 7), array['09:00', '10:30', '12:00'], 'template: the buffer spaces the slots');
select is(
  (select count(*)::int from public.slots s where (s.starts_at at time zone 'Europe/Moscow')::date = tests.tuesday() and s.status = 'booked'), 1,
  'template: the booked slot stays'
);
select is(tests.slots_on(tests.tuesday()), array['10:30', '12:00'], 'template: new slots skip the booked time');
select tests.clear_authentication();

-- The generator skips a live session that is not on a slot, and the daily job adds nothing twice.
select tests.create_session('trainer_a', (tests.tuesday() + 14 + time '10:00') at time zone 'Europe/Moscow');
delete from public.slots where (starts_at at time zone 'Europe/Moscow')::date = tests.tuesday() + 14;
select private.roll_slots();
select is(tests.slots_on(tests.tuesday() + 14), array['09:00', '12:00'], 'generator: no slot over a session (2.6.1-3)');
select is(private.roll_slots(), 0, 'generator: running again adds nothing');

-- =========================================================================================================
-- close_schedule_days and reopen_schedule (PRD 2.6.1-5)

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.close_schedule_days(current_date, current_date - 1) $$, '22023', 'invalid_range', 'close: the end is not before the start');
select throws_ok($$ select * from public.close_schedule_days(current_date, current_date + 100) $$, '22023', 'invalid_range', 'close: at most three months');
select results_eq(
  $$ select count(*)::int from public.close_schedule_days(tests.tuesday() + 14, tests.tuesday() + 14) $$,
  $$ values (1) $$,
  'close: returns the session left on the closed day'
);
select is(tests.slots_on(tests.tuesday() + 14), '{}'::text[], 'close: the open slots of the day are gone');
select tests.clear_authentication();
select private.roll_slots();
select is(tests.slots_on(tests.tuesday() + 14), '{}'::text[], 'close: the generator leaves the day closed');
select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ select public.reopen_schedule((select id from public.slots where status = 'closed')) $$, 'reopen: the trainer opens the day again'
);
select is(tests.slots_on(tests.tuesday() + 14), array['09:00', '12:00'], 'reopen: the template fills the day back');

-- An empty week switches the template off and takes its future slots away.
select lives_ok($$ select public.save_week_template('[]') $$, 'template: an empty week');
select is(
  (select count(*)::int from public.slots where status = 'open'), 0, 'template: no open slots without a template'
);
select tests.clear_authentication();

select * from finish();
rollback;

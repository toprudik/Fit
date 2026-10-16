-- Trainer schedule, part 2, of migration 20261016204500_schedule_sessions.sql (PRD wave-1 §2.6.2, §2.6.5-5,
-- §2.6.7): create_session with weekly repeats, session_conflicts, update_session and cancel_session.
begin;
\ir _helpers.psql
select plan(44);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_d');

-- The day of the given ISO weekday 7 to 13 days ahead in Moscow, and an instant on it.
create function tests.next_day(p_isodow int) returns date language sql stable set search_path = '' as $$
  select d::date from pg_catalog.generate_series((now() at time zone 'Europe/Moscow')::date + 7,
    (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d where extract(isodow from d) = p_isodow
$$;
create function tests.at(p_day date, p_time time) returns timestamptz language sql stable set search_path = '' as $$
  select (p_day + p_time) at time zone 'Europe/Moscow'
$$;
create function tests.local_times(p_recurrence uuid) returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(to_char(s.starts_at at time zone 'Europe/Moscow', 'Dy HH24:MI') order by s.starts_at), '{}')
  from public.sessions s where s.recurrence_id = p_recurrence and s.status = 'scheduled'
$$;

-- =========================================================================================================
-- create_session: who may (PRD 2.6.2-2)

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(2), '10:00'), 60::smallint, 'offline') $$,
  '42501', 'not_a_trainer', 'create: only trainers');
select tests.clear_authentication();
select tests.pair_id('trainer_a', 'client_c') as pair_ac \gset
select tests.authenticate_as('trainer_b');
select throws_ok(
  format($$ select * from public.create_session(%L, tests.at(tests.next_day(2), '10:00'), 60::smallint, 'offline') $$, :'pair_ac'),
  '42501', 'not_your_client', 'create: only for the trainer''s own pair');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), now() - interval '1 hour', 60::smallint, 'offline') $$,
  '22023', 'in_past', 'create: not in the past');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(2), '10:00'), 10::smallint, 'offline') $$,
  '22023', 'invalid_duration', 'create: 15 minutes at least');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(2), '10:00'), 60::smallint, 'online', null, 'http://zoom') $$,
  '22023', 'invalid_link', 'create: an online link is https');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(2), '10:00'), 60::smallint, 'offline', gen_random_uuid()) $$,
  '22023', 'invalid_location', 'create: a place of the trainer''s own');

-- One session over a free slot of the template (2.6.1-3): the booking is confirmed at once (Q20).
select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60}]');
select is(
  (select created from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(2), '10:00'),
    60::smallint, 'offline', null, null, ' Спина ')),
  1, 'create: one session');
select tests.clear_authentication();

select is(
  (select row(s.kind, s.title, s.ends_at - s.starts_at, s.recurrence_id is null)::text from public.sessions s
   where s.starts_at = tests.at(tests.next_day(2), '10:00')),
  row('personal'::public.session_kind, 'Спина', interval '1 hour', true)::text, 'create: a personal session, title trimmed');
select is(
  (select row(b.status, b.source, b.client_id = tests.user_id('client_c'))::text from public.bookings b
   join public.sessions s on s.id = b.session_id where s.starts_at = tests.at(tests.next_day(2), '10:00')),
  row('confirmed'::public.booking_status, 'trainer'::public.booking_source, true)::text, 'create: the booking is confirmed (Q20)');
select is(
  (select count(*)::int from public.booking_events e join public.bookings b on b.id = e.booking_id
   join public.sessions s on s.id = b.session_id
   where s.starts_at = tests.at(tests.next_day(2), '10:00') and e.to_status = 'confirmed' and e.actor_role = 'trainer'),
  1, 'create: the booking has its history row');
select is(
  (select count(*)::int from public.slots s where s.trainer_id = tests.user_id('trainer_a') and s.status = 'open'
   and s.starts_at = tests.at(tests.next_day(2), '10:00')),
  0, 'create: the free slot under the session is gone');
select is(
  (select count(*)::int from public.slots s where s.trainer_id = tests.user_id('trainer_a') and s.status = 'open'
   and (s.starts_at at time zone 'Europe/Moscow')::date = tests.next_day(2)),
  3, 'create: the other slots of the day stay');
select is(
  (select row(o.payload ->> 'count', o.user_id = tests.user_id('client_c'), o.payload ? 'first_name')::text
   from public.notification_outbox o where o.type = 'booking_assigned'),
  row('1', true, true)::text, 'create: the client gets К1 naming the trainer');

-- session_conflicts (2.6.2-6): a warning, not a ban.
select tests.authenticate_as('trainer_a');
select is(
  (select count(*)::int from public.session_conflicts(tests.at(tests.next_day(2), '10:30'), tests.at(tests.next_day(2), '11:30'))),
  1, 'conflicts: an overlapping session is reported');
select is(
  (select coaching_id from public.session_conflicts(tests.at(tests.next_day(2), '10:30'), tests.at(tests.next_day(2), '11:30'))),
  tests.pair_id('trainer_a', 'client_c'), 'conflicts: with the pair to name the client');
select is(
  (select count(*)::int from public.session_conflicts(tests.at(tests.next_day(2), '11:00'), tests.at(tests.next_day(2), '12:00'))),
  0, 'conflicts: a session right after is not an overlap');
select tests.authenticate_as('trainer_b');
select is(
  (select count(*)::int from public.session_conflicts(tests.at(tests.next_day(2), '10:30'), tests.at(tests.next_day(2), '11:30'))),
  0, 'conflicts: only the caller''s sessions');

-- =========================================================================================================
-- Weekly repeats (2.6.2-4, 2.6.7-2)

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(1), '18:00'), 60::smallint, 'offline',
       p_weekdays => array[2, 4]::smallint[], p_count => 3::smallint) $$,
  '22023', 'invalid_repeat', 'repeat: the first session''s weekday is one of the days');
select throws_ok(
  $$ select * from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(1), '18:00'), 60::smallint, 'offline',
       p_weekdays => array[1]::smallint[]) $$,
  '22023', 'invalid_repeat', 'repeat: needs an end date or a count');
select is(
  (select created from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(1), '18:00'), 60::smallint,
     'online', null, 'https://meet.example/x', null, array[1, 3]::smallint[], null, 3::smallint)),
  3, 'repeat: Mon and Wed, 3 times');
select tests.clear_authentication();
select is(
  tests.local_times((select r.id from public.recurrences r where r.occurrence_count = 3)),
  array['Mon 18:00', 'Wed 18:00', 'Mon 18:00'], 'repeat: three sessions on the chosen days');
select is(
  (select row(r.rrule, r.time_zone, r.materialized_until is not null)::text from public.recurrences r where r.occurrence_count = 3),
  row('FREQ=WEEKLY;BYDAY=MO,WE', 'Europe/Moscow', true)::text, 'repeat: kept as a weekly rule in the trainer''s zone');
select is(
  (select count(*)::int from public.notification_outbox o where o.type = 'booking_assigned' and o.payload ->> 'count' = '3'),
  1, 'repeat: one К1 for the whole repeat (2.6.2-5)');
select tests.authenticate_as('trainer_a');
select is(
  (select created from public.create_session(tests.pair_id('trainer_a', 'client_c'), tests.at(tests.next_day(5), '07:00'), 45::smallint,
     'offline', null, null, null, array[5]::smallint[], tests.next_day(5) + 14, null)),
  3, 'repeat: weekly until a date, that date included');
select tests.clear_authentication();
select is(private.materialize_recurrence((select r.id from public.recurrences r where r.until_date is not null)), 0,
  'repeat: materialising again adds nothing');

-- A repeat keeps its local time across a daylight saving change (2.6.7-2): Berlin, 40 Mondays. Sessions exist
-- half a year ahead, so about 25 now and the rest from the nightly roll.
update public.user_settings set time_zone = 'Europe/Berlin' where user_id = tests.user_id('trainer_a');
select tests.authenticate_as('trainer_a');
select is(
  (select created from public.create_session(tests.pair_id('trainer_a', 'client_c'),
     ((tests.next_day(1) + time '08:00') at time zone 'Europe/Berlin'), 30::smallint, 'online',
     p_weekdays => array[1]::smallint[], p_count => 40::smallint)),
  (select count(*)::int from pg_catalog.generate_series(tests.next_day(1), (now() at time zone 'Europe/Berlin')::date + 183, interval '7 days')),
  'repeat: weekly sessions up to half a year ahead');
select tests.clear_authentication();
select is(
  (select count(distinct to_char(s.starts_at at time zone 'Europe/Berlin', 'HH24:MI'))::int
   from public.sessions s join public.recurrences r on r.id = s.recurrence_id where r.occurrence_count = 40),
  1, 'repeat: always 08:00 in the trainer''s zone');
select is(
  (select count(distinct extract(hour from s.starts_at at time zone 'UTC'))::int
   from public.sessions s join public.recurrences r on r.id = s.recurrence_id where r.occurrence_count = 40),
  (select count(distinct extract(hour from ((d::date + time '08:00') at time zone 'Europe/Berlin') at time zone 'UTC'))::int from
     pg_catalog.generate_series(tests.next_day(1), (now() at time zone 'Europe/Berlin')::date + 183, interval '7 days') d),
  'repeat: so the UTC time moves with daylight saving');
update public.user_settings set time_zone = 'Europe/Moscow' where user_id = tests.user_id('trainer_a');

-- =========================================================================================================
-- update_session (2.6.5-5)

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.update_session(gen_random_uuid(), now() + interval '1 day', 60::smallint, 'offline') $$,
  'P0001', 'session_not_found', 'update: an unknown session');
select is(
  public.update_session((select s.id from public.sessions s where s.starts_at = tests.at(tests.next_day(2), '10:00')),
    tests.at(tests.next_day(2), '15:00'), 90::smallint, 'offline'),
  1, 'update: moves one session');
select tests.clear_authentication();
select is(
  (select row(s.ends_at - s.starts_at, s.manually_adjusted_at is not null, s.title)::text from public.sessions s
   where s.starts_at = tests.at(tests.next_day(2), '15:00')),
  row(interval '90 minutes', true, null::text)::text, 'update: new length, marked as a manual change');
select is(
  (select row(o.payload ->> 'before_starts_at' is not null, o.payload ->> 'count')::text from public.notification_outbox o where o.type = 'session_changed'),
  row(true, '1')::text, 'update: the client gets К6 with the old time');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.update_session(
       (select s.id from public.sessions s join public.recurrences r on r.id = s.recurrence_id where r.occurrence_count = 3 order by s.starts_at offset 1 limit 1),
       tests.at(tests.next_day(1) + 3, '19:00'), 60::smallint, 'online', null, null, null, true) $$,
  '22023', 'following_keeps_date', 'update: this and following moves within the day');
select is(
  public.update_session(
    (select s.id from public.sessions s join public.recurrences r on r.id = s.recurrence_id where r.occurrence_count = 3 order by s.starts_at offset 1 limit 1),
    tests.at(tests.next_day(1) + 2, '19:30'), 60::smallint, 'online', null, null, null, true),
  2, 'update: this and following changes two sessions');
select tests.clear_authentication();
select is(
  tests.local_times((select r.id from public.recurrences r where r.occurrence_count = 3)),
  array['Mon 18:00', 'Wed 19:30', 'Mon 19:30'], 'update: the earlier session keeps its time');
select is(
  (select to_char(r.dtstart_local, 'HH24:MI') from public.recurrences r where r.occurrence_count = 3),
  '19:30', 'update: the repeat itself moves too');

-- =========================================================================================================
-- cancel_session (2.6.5)

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.cancel_session((select s.id from public.sessions s where s.starts_at = tests.at(tests.next_day(2), '15:00')), '  ') $$,
  '22023', 'reason_required', 'cancel: the trainer gives a reason (2.6.5-4)');
select is(
  public.cancel_session((select s.id from public.sessions s where s.starts_at = tests.at(tests.next_day(2), '15:00')), 'Заболел'),
  1, 'cancel: one session');
select tests.clear_authentication();
select is(
  (select row(s.status, b.status, b.cancelled_by_role, b.cancel_reason)::text from public.sessions s
   join public.bookings b on b.session_id = s.id where s.starts_at = tests.at(tests.next_day(2), '15:00')),
  row('cancelled'::public.session_status, 'cancelled'::public.booking_status, 'trainer'::public.actor_role, 'Заболел')::text,
  'cancel: the booking is cancelled by the trainer, no charge');
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.cancel_session((select s.id from public.sessions s where s.starts_at = tests.at(tests.next_day(2), '15:00')), 'Ещё раз') $$,
  'P0001', 'not_editable', 'cancel: a cancelled session stays as it is');

select is(
  public.cancel_session(
    (select s.id from public.sessions s join public.recurrences r on r.id = s.recurrence_id where r.until_date is not null order by s.starts_at offset 1 limit 1),
    'Отпуск', true),
  2, 'cancel: this and following cancels the rest of the repeat');
select tests.clear_authentication();
select is(
  (select row(r.ended_at is not null, private.materialize_recurrence(r.id))::text from public.recurrences r where r.until_date is not null),
  row(true, 0)::text, 'cancel: the repeat stops and makes no new sessions');
select is(
  (select jsonb_array_length(o.payload -> 'dates') from public.notification_outbox o
   where o.type = 'booking_cancelled_by_trainer' and o.payload ->> 'reason' = 'Отпуск'),
  2, 'cancel: one К5 listing both dates');

select tests.clear_authentication();
select s.id as a_session from public.sessions s where s.trainer_id = tests.user_id('trainer_a') and s.status = 'scheduled' limit 1 \gset
select tests.authenticate_as('trainer_b');
select throws_ok(
  format($$ select public.cancel_session(%L, 'x') $$, :'a_session'),
  'P0001', 'session_not_found', 'cancel: another trainer''s session is not found');

select * from finish();
rollback;

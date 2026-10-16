-- Trainer daily digest of migration 20261016224300_daily_digest.sql (PRD wave-1 §2.9-6, NOTIF-5): queued at the
-- trainer's digest time in their zone, once a day, with today's sessions, open requests, passes running out and
-- debts; an empty day sends nothing.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_q');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
update public.user_settings set time_zone = 'Europe/Moscow', daily_digest_time = '08:00', quiet_hours_start = null,
  quiet_hours_end = null
where user_id in (tests.user_id('trainer_a'), tests.user_id('trainer_b'));
-- trainer_q: digest at 07:00 inside quiet hours that end at 08:00.
update public.user_settings set time_zone = 'Europe/Moscow', daily_digest_time = '07:00', quiet_hours_start = '22:00',
  quiet_hours_end = '08:00'
where user_id = tests.user_id('trainer_q');
update public.coaching_trainer_meta set client_alias = 'Катя' where coaching_id = tests.pair_id('trainer_a', 'client_c');

-- The day under test is tomorrow in Moscow; "now" is a moment on it.
create function tests.at(p_time text) returns timestamptz language sql stable set search_path = '' as $$
  select (((pg_catalog.now() at time zone 'Europe/Moscow')::date + 1) + p_time::time) at time zone 'Europe/Moscow'
$$;
create function tests.digest(p_trainer text) returns jsonb language sql stable set search_path = '' as $$
  select o.payload from public.notification_outbox o
  where o.type = 'daily_digest' and o.user_id = tests.user_id(p_trainer)
$$;
create table tests.ids (name text primary key, id uuid not null);
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;

-- trainer_a: a personal session at 10:00, a group one at 18:00, one yesterday late and one the day after.
insert into tests.ids values
  ('s_morning', tests.create_session('trainer_a', tests.at('10:00'))),
  ('s_group', tests.create_session('trainer_a', tests.at('18:00'), 'group', 5)),
  ('s_before', tests.create_session('trainer_a', tests.at('00:00') - interval '30 minutes')),
  ('s_after', tests.create_session('trainer_a', tests.at('00:00') + interval '1 day')),
  ('s_req', tests.create_session('trainer_a', tests.at('00:00') + interval '3 days')),
  ('s_past', tests.create_session('trainer_a', now() - interval '5 days'));
update public.sessions set title = 'Функционалка' where id = tests.id('s_group');
select tests.create_booking(tests.id('s_morning'), 'trainer_a', 'client_c');
select tests.create_booking(tests.id('s_group'), 'trainer_a', 'client_c');
select tests.create_booking(tests.id('s_group'), 'trainer_a', 'client_d');
select tests.create_booking(tests.id('s_req'), 'trainer_a', 'client_d', 'requested', 'client_slot');
-- A pass with one session left for client_c, a debt of client_d (an attended session without a pass).
select tests.create_pass('trainer_a', 'client_c', 1);
insert into tests.ids values ('b_debt', tests.create_booking(tests.id('s_past'), 'trainer_a', 'client_d', 'attended'));
insert into public.ledger_entries (coaching_id, entry_type, booking_id, sessions_delta, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_d'), 'charge', tests.id('b_debt'), -1, 'attended', now() - interval '5 days');

-- trainer_q: one request so the digest is not empty.
insert into tests.ids values ('s_q', tests.create_session('trainer_q', tests.at('12:00')));
select tests.create_pair('trainer_q', 'client_c');
select tests.create_booking(tests.id('s_q'), 'trainer_q', 'client_c', 'requested', 'client_slot');

-- =========================================================================================================

select is(private.queue_daily_digests(tests.at('06:55')), 0, 'digest: nothing before the digest time');
-- Quiet hours: a 07:00 digest waits for their end, like any message that is not a reminder (ADR 0006).
select is(private.queue_daily_digests(tests.at('07:01')), 1, 'quiet hours: the 07:00 digest is queued on time');
select is(
  (select deliver_after from public.notification_outbox where type = 'daily_digest' and user_id = tests.user_id('trainer_q')),
  tests.at('08:00'),
  'quiet hours: it is delivered when they end'
);
select is(private.queue_daily_digests(tests.at('08:03')), 1, 'digest: queued at the trainer''s time (NOTIF-5)');
select is(tests.digest('trainer_b'), null, 'digest: an empty day sends nothing');
select is(private.queue_daily_digests(tests.at('08:08')), 0, 'digest: once a day');
select results_eq(
  $$ select (d ->> 'sessions_count')::int, (d ->> 'requests_count')::int, (d ->> 'passes_count')::int,
            (d ->> 'debts_count')::int, d ->> 'day'
     from tests.digest('trainer_a') d $$,
  $$ values (2, 1, 1, 1, ((now() at time zone 'Europe/Moscow')::date + 1)::text) $$,
  'digest: today''s sessions only, the open request, the pass running out and the debt'
);
select results_eq(
  $$ select e ->> 'name', e ->> 'kind', e ->> 'title', (e ->> 'booked')::int
     from tests.digest('trainer_a') d, jsonb_array_elements(d -> 'sessions') e
     order by e ->> 'starts_at' $$,
  $$ values ('Катя'::text, 'personal'::text, null::text, 1), (null, 'group', 'Функционалка', 2) $$,
  'digest: a personal session names the client by the trainer''s alias, a group one has its title and headcount'
);
select results_eq(
  $$ select e ->> 'name', (e ->> 'available')::int from tests.digest('trainer_a') d, jsonb_array_elements(d -> 'passes') e $$,
  $$ values ('Катя'::text, 1) $$,
  'digest: the pass with one session left'
);
select results_eq(
  $$ select e ->> 'name', (e ->> 'sessions')::int from tests.digest('trainer_a') d, jsonb_array_elements(d -> 'debts') e $$,
  $$ values ('client_d'::text, 1) $$,
  'digest: the debt in sessions, the client by name'
);
select is(
  (select array_agg(k order by k) from tests.digest('trainer_a') d, jsonb_object_keys(d) k),
  '{day,debts,debts_count,passes,passes_count,requests_count,sessions,sessions_count}',
  'digest: counts and short lists, nothing else'
);

-- Two hours late is too late: a stopped job does not send the morning digest at night.
delete from public.notification_outbox where type = 'daily_digest';
select is(private.queue_daily_digests(tests.at('10:30')), 0, 'digest: not more than two hours after its time');

select is(
  array(select j.jobname::text || ' ' || j.schedule from cron.job j where j.jobname = 'daily-digests'),
  '{"daily-digests */5 * * * *"}',
  'cron: the digest job runs every five minutes'
);
select is(private.notification_type_is_optional('daily_digest'), true, 'settings: the digest can be switched off');

select * from finish();
rollback;

-- The trainer's month in numbers (private.trainer_month_numbers): edges that the pre-beta mutation run (04.11) broke
-- without any test noticing. A session at midnight on the 1st belongs to the month, a client who reached 10 the month
-- before does not reach it again, and the 100th session is a milestone too.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer(h) from unnest(array['coach_m', 'coach_t', 'coach_h']) h;
select tests.create_user(c) from unnest(array['client_m', 'client_t', 'client_h']) c;
select tests.create_pair('coach_m', 'client_m');
select tests.create_pair('coach_t', 'client_t');
select tests.create_pair('coach_h', 'client_h');

-- The finished month before this one in Moscow (the default zone), its first instant and a day inside it.
select (date_trunc('month', now() at time zone 'Europe/Moscow') - interval '1 month')::date as last_month \gset
select :'last_month'::timestamp at time zone 'Europe/Moscow' as month_start \gset
select (:'last_month'::timestamp + interval '9 days 12 hours') at time zone 'Europe/Moscow' as mid \gset

-- coach_m: one session, at 00:00 on the 1st.
select tests.create_booking(tests.create_session('coach_m', :'month_start'::timestamptz), 'coach_m', 'client_m', 'attended');
select is(private.trainer_month_numbers(tests.user_id('coach_m'), :'last_month') ->> 'count', '1',
  'a session at midnight on the 1st is in the month');

-- coach_t: client_t had exactly 10 sessions before the month and 2 in it: the 10 was last month's milestone.
select tests.create_booking(tests.create_session('coach_t', :'mid'::timestamptz - make_interval(days => 40 + d)), 'coach_t', 'client_t', 'attended')
from generate_series(1, 10) d;
select tests.create_booking(tests.create_session('coach_t', :'mid'::timestamptz + make_interval(days => d)), 'coach_t', 'client_t', 'attended')
from generate_series(0, 1) d;
select is(private.trainer_month_numbers(tests.user_id('coach_t'), :'last_month') ->> 'milestones', '0',
  'a milestone reached the month before is not counted again');

-- coach_h: client_h had 99 sessions before the month and the 100th in it.
select tests.create_booking(tests.create_session('coach_h', :'mid'::timestamptz - make_interval(days => 40, hours => 3 * d)), 'coach_h', 'client_h', 'attended')
from generate_series(1, 99) d;
select tests.create_booking(tests.create_session('coach_h', :'mid'::timestamptz), 'coach_h', 'client_h', 'attended');
select is(private.trainer_month_numbers(tests.user_id('coach_h'), :'last_month') ->> 'milestones', '1',
  'the 100th session is a milestone');

select * from finish();
rollback;

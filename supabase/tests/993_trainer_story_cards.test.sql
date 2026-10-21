-- Trainer story cards (20261021012347_trainer_story_cards.sql, marketing backlog 5): the month in numbers, the
-- showcase card only while the showcase is open, and who may make them.
begin;
\ir _helpers.psql
select plan(21);

select tests.create_trainer('coach_s');
select tests.create_trainer('coach_quiet');
select tests.create_user(c) from unnest(array['client_one', 'client_two']) c;
select tests.create_pair('coach_s', 'client_one');
select tests.create_pair('coach_s', 'client_two');

-- The finished month before this one in Moscow (the default zone), and a day inside it.
select (date_trunc('month', now() at time zone 'Europe/Moscow') - interval '1 month')::date as last_month \gset
select (:'last_month'::timestamp + interval '9 days 12 hours') at time zone 'Europe/Moscow' as mid \gset

-- client_one: 9 held sessions before that month and 2 in it, so they reach 10 then; client_two: 1 in it.
select tests.create_booking(tests.create_session('coach_s', :'mid'::timestamptz - make_interval(days => 40 + d)), 'coach_s', 'client_one', 'attended')
from generate_series(1, 9) d;
select tests.create_booking(tests.create_session('coach_s', :'mid'::timestamptz + make_interval(days => d)), 'coach_s', 'client_one', 'attended')
from generate_series(0, 1) d;
select tests.create_booking(tests.create_session('coach_s', :'mid'::timestamptz + interval '3 days'), 'coach_s', 'client_two', 'confirmed');
-- A cancelled session in the month does not count.
select tests.create_booking(tests.create_session('coach_s', :'mid'::timestamptz + interval '4 days'), 'coach_s', 'client_two') as cancelled \gset
update public.sessions set status = 'cancelled', cancelled_at = now() where id = (select session_id from public.bookings where id = :'cancelled');

select is(
  private.trainer_month_numbers(tests.user_id('coach_s'), :'last_month'),
  '{"count": 3, "clients": 2, "milestones": 1}'::jsonb,
  'three held sessions, two clients, one of them reached 10');
select is(private.trainer_month_numbers(tests.user_id('coach_quiet'), :'last_month'), null, 'a quiet month has no numbers');

-- Making cards -------------------------------------------------------------------------------------------------------

select tests.authenticate_as('client_one');
select throws_ok($$ select public.create_trainer_story_card('trainer_showcase') $$, '42501', 'not_a_trainer', 'a client cannot');

select tests.authenticate_as('coach_s');
select throws_ok(format($$ select public.create_trainer_story_card('trainer_month', %L) $$,
                        date_trunc('month', now() at time zone 'Europe/Moscow')::date),
  'P0001', 'month_not_finished', 'the running month cannot be shared yet');
select throws_ok($$ select public.create_trainer_story_card('trainer_month') $$, 'P0001', 'month_not_finished', 'nor no month');
select throws_ok($$ select public.create_trainer_story_card('sessions') $$, '22023', 'unknown kind', 'client kinds are not for trainers');

select public.create_trainer_story_card('trainer_month', :'last_month') as month_card \gset
select is(public.story_card(:'month_card'),
  jsonb_build_object('kind', 'trainer_month', 'month', :'last_month', 'data', '{"count": 3, "clients": 2, "milestones": 1}'::jsonb),
  'the month card freezes the numbers and nothing else');

-- The showcase card needs an open showcase.
select tests.clear_authentication();
update public.trainer_profiles set is_public = false where user_id = tests.user_id('coach_s');
select tests.authenticate_as('coach_s');
select throws_ok($$ select public.create_trainer_story_card('trainer_showcase') $$, 'P0001', 'nothing_to_show',
  'a closed showcase has no card');
select tests.clear_authentication();
update public.trainer_profiles set is_public = true where user_id = tests.user_id('coach_s');
update public.profiles set display_name = 'Coach S' where id = tests.user_id('coach_s');
select tests.authenticate_as('coach_s');
select public.create_trainer_story_card('trainer_showcase') as showcase_card \gset
select is(public.story_card(:'showcase_card') -> 'data', '{"name": "Coach S", "slug": "coach-s", "trial": false}'::jsonb,
  'the showcase card carries the name, the address and no trial');
select is(public.story_card(:'showcase_card') ->> 'month',
  date_trunc('month', now() at time zone 'Europe/Moscow')::date::text, 'dated by the running month');

select tests.authenticate_as('coach_quiet');
select throws_ok(format($$ select public.create_trainer_story_card('trainer_month', %L) $$, :'last_month'),
  'P0001', 'nothing_to_show', 'a quiet month has no card');

select tests.authenticate_as_anon();
select throws_ok($$ select public.create_trainer_story_card('trainer_showcase') $$, '42501', null, 'anon cannot make one');
select isnt(public.story_card(:'showcase_card'), null, 'but the image route reads it without a session');
select tests.clear_authentication();

select is((select count(*)::int from public.story_cards where user_id = tests.user_id('coach_s')), 2, 'two cards stored');

-- Nobody reaches another trainer's month or the stored cards directly.
select tests.authenticate_as('coach_quiet');
select throws_ok(format($$ select private.trainer_month_numbers(%L, %L) $$, tests.user_id('coach_s'), :'last_month'),
  '42501', null, 'the month numbers are not callable');
select is((select count(*)::int from public.story_cards), 0, 'nor are other trainers'' cards readable');
select tests.clear_authentication();

-- Closed later, the showcase card answers like an expired one; the month card stays.
update public.trainer_profiles set is_public = false where user_id = tests.user_id('coach_s');
select is(public.story_card(:'showcase_card'), null, 'a showcase closed later hides its card');
select isnt(public.story_card(:'month_card'), null, 'the month card does not depend on the showcase');

-- Consent to publish (20261020171523_public_data_consents.sql): the showcase card rides on the showcase consent,
-- the month recap needs the consent to story cards, like the clients' cards.
select tests.create_trainer('coach_c');
select tests.create_user('client_c');
select tests.create_pair('coach_c', 'client_c');
select tests.create_booking(tests.create_session('coach_c', :'mid'::timestamptz), 'coach_c', 'client_c', 'attended');
update public.public_data_consents set revoked_at = now() where user_id = tests.user_id('coach_c') and scope = 'story';
select tests.authenticate_as('coach_c');
select isnt(public.create_trainer_story_card('trainer_showcase'), null, 'the showcase card needs no consent to story cards');
select throws_ok(format($$ select public.create_trainer_story_card('trainer_month', %L) $$, :'last_month'),
  'P0001', 'consent_required', 'the month recap needs the consent to story cards');
select tests.clear_authentication();
update public.public_data_consents set revoked_at = now() where user_id = tests.user_id('coach_c') and scope = 'showcase';
select tests.authenticate_as('coach_c');
select throws_ok($$ select public.create_trainer_story_card('trainer_showcase') $$, 'P0001', null,
  'without the showcase consent there is no showcase card');
select tests.clear_authentication();

select * from finish();
rollback;

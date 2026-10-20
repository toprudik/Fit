-- Streak and badge story cards, migration 20261018002741_story_streak_badge_cards.sql (PRD wave-3 §4 rule 4): a
-- card for each streak that runs on the month's last day and one for the month's badges with the latest of them.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
-- C gives the health data consent: without it the report has no health blocks (989).
insert into public.consents (user_id, kind, version) values (tests.user_id('client_c'), 'pd_health', '2026-11');

-- September 2026 of C (Moscow): the weekly goal met in the last two weeks, the food diary on the last three days,
-- no steps, and two badges that month.
select tests.create_booking(tests.create_session('trainer_a', s), 'trainer_a', 'client_c', 'attended')
from unnest(array['2026-09-22 07:00+00', '2026-09-24 07:00+00', '2026-09-28 07:00+00', '2026-09-29 07:00+00']::timestamptz[]) s;
insert into public.food_diary_entries (client_id, local_date, meal, title, kcal)
select tests.user_id('client_c'), d, 'lunch', 'Суп', 500
from unnest(array['2026-09-28', '2026-09-29', '2026-09-30']::date[]) d;
delete from public.user_badges where user_id = tests.user_id('client_c');
insert into public.user_badges (user_id, badge_code, awarded_at) values
  (tests.user_id('client_c'), 'sessions_1', '2026-09-22 10:00+03'),
  (tests.user_id('client_c'), 'diary_7', '2026-09-29 10:00+03');

create function tests.card(p_kind text) returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_id uuid := public.create_story_card('2026-09-01', p_kind);
begin
  return (select pg_catalog.jsonb_build_object('kind', c.kind, 'data', c.data) from public.story_cards c where c.id = v_id);
end $$;
grant execute on function tests.card(text) to authenticated;
create table tests.badge_card (id uuid);
grant insert, select on tests.badge_card to authenticated;

select tests.authenticate_as('client_c');
select is(tests.card('streak_workouts'), '{"kind": "streak_workouts", "data": {"count": 2}}'::jsonb,
  'the workout streak card: weeks in a row as of the last day');
select is(tests.card('streak_diary'), '{"kind": "streak_diary", "data": {"count": 3}}'::jsonb,
  'the diary streak card: only the number of days');
select throws_ok($$ select public.create_story_card('2026-09-01', 'streak_steps') $$, 'P0001', 'nothing_to_show',
  'no card for a streak that does not run');
select is(tests.card('badges'), '{"kind": "badges", "data": {"count": 2, "code": "diary_7"}}'::jsonb,
  'the badge card: the month''s count and its latest badge');
insert into tests.badge_card values (public.create_story_card('2026-09-01', 'badges'));
select is(
  public.story_card((select id from tests.badge_card)) - 'month',
  '{"kind": "badges", "data": {"count": 2, "code": "diary_7"}}'::jsonb,
  'the image route reads the badge card');
select throws_ok($$ select public.create_story_card('2026-09-01', 'streak_sleep') $$, '22023', 'unknown kind',
  'an unknown streak is an unknown kind');
select tests.clear_authentication();

delete from public.user_badges where user_id = tests.user_id('client_c');
select tests.authenticate_as('client_c');
select throws_ok($$ select public.create_story_card('2026-09-01', 'badges') $$, 'P0001', 'nothing_to_show',
  'no badge card for a month without badges');
select tests.clear_authentication();

select * from finish();
rollback;

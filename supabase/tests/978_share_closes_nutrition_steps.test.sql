-- Closing nutrition or steps closes what is derived from them, migration
-- 20261020102347_share_closes_nutrition_steps.sql: the food-diary badges and the parts of a sent monthly report.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

insert into public.user_badges (user_id, badge_code)
values (tests.user_id('client_c'), 'diary_7'), (tests.user_id('client_c'), 'sessions_1');
insert into public.monthly_report_shares (coaching_id, month, client_id, report)
values (tests.pair_id('trainer_a', 'client_c'), '2026-09-01', tests.user_id('client_c'), jsonb_build_object(
  'sessions', jsonb_build_object('total', 2),
  'nutrition', jsonb_build_object('days', 20),
  'steps', jsonb_build_object('average', 8000),
  'sleep', jsonb_build_object('average', 7.5),
  'measurements', jsonb_build_object('weight', -1.2),
  'streaks', jsonb_build_object('diary', 12, 'steps', 5, 'workouts', 3),
  'badges', jsonb_build_array('diary_7', 'sessions_1')));

create table tests.pair as select tests.pair_id('trainer_a', 'client_c') as id;
grant select on tests.pair to authenticated;

select tests.authenticate_as('trainer_a');
select is((select array_agg(badge_code order by badge_code) from public.user_badges),
  array['diary_7', 'sessions_1'], 'with nutrition shared the trainer sees the diary badge');
select is((select public.shared_monthly_report(id, '2026-09-01') -> 'report' from tests.pair) ?& array['nutrition', 'steps', 'sleep', 'measurements'],
  true, 'with everything shared the report is whole');

select tests.clear_authentication();
update public.data_shares set nutrition = false, steps = false, measurements = false
where coaching_id = (select id from tests.pair);

select tests.authenticate_as('trainer_a');
select is((select array_agg(badge_code) from public.user_badges), array['sessions_1'],
  'with nutrition closed the diary badge is hidden');
select is((select public.shared_monthly_report(id, '2026-09-01') -> 'report' from tests.pair) ?| array['nutrition', 'steps', 'sleep', 'measurements'],
  false, 'closed categories are cut from the report');
select is((select public.shared_monthly_report(id, '2026-09-01') #> '{report,streaks}' from tests.pair),
  '{"workouts": 3}'::jsonb, 'their streaks too');
select is((select public.shared_monthly_report(id, '2026-09-01') #> '{report,badges}' from tests.pair),
  '["sessions_1"]'::jsonb, 'and the diary badges');
select is((select public.shared_monthly_report(id, '2026-09-01') #> '{report,sessions,total}' from tests.pair),
  '2'::jsonb, 'the sessions stay');

select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.user_badges), 2, 'the client still sees all their badges');

select tests.clear_authentication();
update public.data_shares set nutrition = true where coaching_id = (select id from tests.pair);
select tests.authenticate_as('trainer_a');
select ok((select public.shared_monthly_report(id, '2026-09-01') -> 'report' from tests.pair) ? 'nutrition',
  'opening nutrition again brings it back');

select * from finish();
rollback;

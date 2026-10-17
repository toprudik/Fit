-- Feature use of migration 20261017200317_admin_feature_use.sql (PRD wave-2 §8 rule 2): the platform slice counts
-- clients who keep the food diary, log activity or have a live nutrition target, the clients slice has the same
-- yes/no flags, and neither says anything about what was eaten, walked or set.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_user(c) from unnest(array['client_c', 'client_d', 'client_e']) c;
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d', 'client_e']) c;

-- c: a diary entry today and a target of their own; d: steps today and a diary entry 40 days ago;
-- e: a trainer target but nutrition not shared, so it is not their target.
insert into public.food_diary_entries (client_id, local_date, meal, kcal)
values (tests.user_id('client_c'), private.client_today(tests.user_id('client_c')), 'lunch', 600);
insert into public.food_diary_entries (client_id, local_date, meal, kcal, logged_at)
values (tests.user_id('client_d'), private.client_today(tests.user_id('client_d')) - 40, 'lunch', 700, now() - interval '40 days');
insert into public.activity_entries (client_id, local_date, metric, value)
values (tests.user_id('client_d'), private.client_today(tests.user_id('client_d')), 'steps', 8000);
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_c'), 2000, private.client_today(tests.user_id('client_c')) - 5, tests.user_id('client_c'));
select tests.set_share('trainer_a', 'client_e', 'nutrition', false);
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_e'), tests.pair_id('trainer_a', 'client_e'), 1800,
        private.client_today(tests.user_id('client_e')) - 5, tests.user_id('trainer_a'));

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_analytics_platform(30) $$, '42501', null, 'platform: a trainer is still refused');
select throws_ok($$ select * from public.admin_analytics_clients(30) $$, '42501', null, 'clients: a trainer is still refused');

select tests.authenticate_as('admin_x');
select is(
  (select array[p.clients, p.clients_keeping_diary, p.clients_logging_activity, p.clients_with_target]
   from public.admin_analytics_platform(30) p),
  array[3, 1, 1, 1], 'platform: diary, activity and target counted once per client');
select is((select p.clients_keeping_diary from public.admin_analytics_platform(90) p), 2,
  'platform: the diary counts entries made within the period');
select is((select p.clients_with_target from public.admin_analytics_platform(7) p), 1,
  'platform: the target is as of now, whatever the period');

select is(
  (select row(c.keeps_diary, c.logs_activity, c.has_target)::text
   from public.admin_analytics_clients(30) c where c.client_id = tests.user_id('client_c')),
  row(true, false, true)::text, 'clients: c keeps the diary and has a target');
select is(
  (select row(c.keeps_diary, c.logs_activity, c.has_target)::text
   from public.admin_analytics_clients(30) c where c.client_id = tests.user_id('client_d')),
  row(false, true, false)::text, 'clients: d logs activity; the old diary entry is out of the period');
select is(
  (select c.has_target from public.admin_analytics_clients(30) c where c.client_id = tests.user_id('client_e')), false,
  'clients: a trainer target the client does not share is not counted');

select * from finish();
rollback;

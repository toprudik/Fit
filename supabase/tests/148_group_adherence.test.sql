-- Group adherence of migration 20261017162317_group_adherence.sql (PRD wave-2 §6 rule 8): the average adherence
-- of the members who share nutrition and were judged against a target, shown from three such clients.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user(c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) c;
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) c;
-- f keeps nutrition to themselves; g shares but has no target.
select tests.set_share('trainer_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d', 'client_e', 'client_g']) c;
select tests.set_share('trainer_a', 'client_f', 'nutrition', false);
select tests.grant_plan('trainer_a', 'trainer_pro');

create function tests.today(p_name text) returns date language sql stable security definer set search_path = '' as $$
  select private.client_today(tests.user_id(p_name))
$$;
create function tests.eat(p_name text, p_ago integer, p_kcal numeric) returns void language sql set search_path = '' as $$
  insert into public.food_diary_entries (client_id, local_date, meal, kcal)
  values (tests.user_id(p_name), tests.today(p_name) - p_ago, 'lunch', p_kcal)
$$;

insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
select 'calculator', tests.user_id(c), 2000, tests.today(c) - 60, tests.user_id(c)
from unnest(array['client_c', 'client_d', 'client_e', 'client_f']) c;
-- c: 2 of 2 days in the norm (100%); d: 1 of 2 (50%); f: 0 of 1 but not shared; g: logged without a target.
select tests.eat('client_c', 1, 2000);
select tests.eat('client_c', 5, 1900);
select tests.eat('client_d', 2, 2100);
select tests.eat('client_d', 3, 3000);
select tests.eat('client_f', 1, 500);
select tests.eat('client_g', 1, 2000);
-- e: older than 30 days only, so not counted yet.
select tests.eat('client_e', 40, 2000);

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name) values (auth.uid(), 'Утро');
select id as group_id from public.groups where name = 'Утро' \gset
select public.add_group_member(:'group_id', tests.pair_id('trainer_a', c))
from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) c;

select is((select array[adherence, adherence_clients] from public.group_analytics(:'group_id')), array[null, 2]::integer[],
  'under three judged clients the average is not shown');

-- e logs a day in the norm within the 30 days: three judged clients.
select tests.clear_authentication();
select tests.eat('client_e', 10, 2050);
select tests.authenticate_as('trainer_a');
select is((select adherence_clients from public.group_analytics(:'group_id')), 3,
  'only members who share nutrition and have a judged day count');
select is((select adherence from public.group_analytics(:'group_id')), 83,
  'the average of 100%, 50% and 100% is 83%');
select is((select members from public.group_analytics(:'group_id')), 5, 'every member still counts as a member');

select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select * from public.group_analytics(%L) $$, :'group_id'), '42501', 'forbidden',
  'another trainer reads nothing of the group');

select * from finish();
rollback;

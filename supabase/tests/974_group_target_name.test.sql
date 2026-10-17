-- my_nutrition_target of migration 20261017183117_group_target_name.sql (PRD wave-2 §2 rule 15): a group template
-- names its group, a trainer's or the calculator's target does not.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d']) c;
select tests.set_share('trainer_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d']) c;
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.pair_id('trainer_a', 'client_c') as pair_c \gset
select tests.pair_id('trainer_a', 'client_d') as pair_d \gset
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_d'), :'pair_d', 2000, current_date - 10, tests.user_id('trainer_a'));
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_e'), 2100, current_date - 10, tests.user_id('client_e'));

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Сброс веса', 'lose');
select g.id as group_lose from public.groups g where g.name = 'Сброс веса' \gset
select public.add_group_member(:'group_lose', :'pair_c');
select public.add_group_member(:'group_lose', :'pair_d');
select public.set_group_target(:'group_lose', 1600, 120, 50, 160, 2000, 10000);

select tests.authenticate_as('client_c');
select results_eq($$ select source::text, trainer_name, group_name from public.my_nutrition_target() $$,
  $$ values ('group', 'trainer_a', 'Сброс веса') $$, 'a group template names its group and trainer');
select tests.authenticate_as('client_d');
select results_eq($$ select source::text, group_name from public.my_nutrition_target() $$, $$ values ('trainer', null::text) $$,
  'a trainer''s own target names no group');
select tests.authenticate_as('client_e');
select results_eq($$ select source::text, group_name from public.my_nutrition_target() $$, $$ values ('calculator', null::text) $$,
  'the calculator''s target names no group');

select * from finish();
rollback;

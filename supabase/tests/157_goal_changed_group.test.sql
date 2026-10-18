-- A new goal reaches the trainer of a group template too, migration 20261018003917_goal_changed_group.sql (wave-2
-- §1.3): the trainer whose own or group target is in force is told, the message names the group.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.set_share('trainer_a', 'client_c', 'nutrition', true);
select tests.set_share('trainer_b', 'client_c', 'nutrition', true);
select tests.grant_plan('trainer_a', 'trainer_pro');
insert into public.client_goals (user_id, goal) values (tests.user_id('client_c'), 'lose');

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Марафон', 'lose');
select g.id as group_id from public.groups g where g.name = 'Марафон' \gset
select public.add_group_member(:'group_id', tests.pair_id('trainer_a', 'client_c'));
select public.set_group_target(:'group_id', 1800);
select tests.clear_authentication();

-- Trainer B has no target of their own: B is not told.
select tests.authenticate_as('client_c');
select ok(public.set_client_goal('gain'), 'the client sets a new goal');
select tests.clear_authentication();

select results_eq(
  $$ select user_id, payload->>'goal', payload->>'group_name' from public.notification_outbox where type = 'goal_changed' $$,
  format($$ values (%L::uuid, 'gain', 'Марафон') $$, tests.user_id('trainer_a')),
  'the trainer of the group template is told, and the message names the group');

-- With an own target of the pair, the message is about that target, once.
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_c'), tests.pair_id('trainer_a', 'client_c'), 2000, current_date - 10, tests.user_id('trainer_a'));
delete from public.notification_outbox where type = 'goal_changed';
select tests.authenticate_as('client_c');
select ok(public.set_client_goal('maintain'), 'the client changes the goal again');
select tests.clear_authentication();
select results_eq(
  $$ select user_id, payload->>'group_name' from public.notification_outbox where type = 'goal_changed' $$,
  format($$ values (%L::uuid, null::text) $$, tests.user_id('trainer_a')),
  'the pair''s own target wins: one message, without the group');

select * from finish();
rollback;

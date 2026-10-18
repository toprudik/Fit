-- Frozen nutrition targets of finished days (migration 20261018072553_nutrition_day_targets.sql, wave-2 §5.4):
-- revoking the permission, leaving a group or ending a pair changes today's target but not the days already over.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d']) c;
select tests.set_share('trainer_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d']) c;
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.pair_id('trainer_a', 'client_c') as pair_c \gset
select tests.pair_id('trainer_a', 'client_d') as pair_d \gset
select private.client_today(tests.user_id('client_d')) as today \gset

-- client_d: a trainer target since 10 days ago and a calculator one under it.
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_d'), :'pair_d', 2000, :'today'::date - 10, tests.user_id('trainer_a'));
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_d'), 2300, :'today'::date - 10, tests.user_id('client_d'));

-- client_c: the template of their group, backdated to 10 days ago.
select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Сброс веса', 'lose');
select g.id as group_lose from public.groups g where g.name = 'Сброс веса' \gset
select public.add_group_member(:'group_lose', :'pair_c');
select public.set_group_target(:'group_lose', 1600, 120, 50, 160, 2000, 10000);
select tests.clear_authentication();
update public.nutrition_targets set effective_from = :'today'::date - 10 where group_id = :'group_lose';
update public.group_members set added_at = now() - interval '10 days' where group_id = :'group_lose';

select private.freeze_nutrition_days();
select is((select count(*)::integer from private.nutrition_day_targets
           where client_id in (tests.user_id('client_c'), tests.user_id('client_d'))), 14,
  'the last 7 finished days of both clients are frozen');
select is(private.freeze_nutrition_days(), 0, 'freezing again writes nothing');

-- The trainer loses access to client_d's nutrition and client_c leaves the group.
select tests.set_share('trainer_a', 'client_d', 'nutrition', false);
delete from public.group_members where coaching_id = :'pair_c';

select is((select kcal::integer from public.nutrition_targets
           where id = private.active_nutrition_target(tests.user_id('client_d'), :'today'::date - 1)), 2000,
  'yesterday keeps the trainer target after the permission is revoked');
select is((select kcal::integer from public.nutrition_targets
           where id = private.active_nutrition_target(tests.user_id('client_d'), :'today'::date)), 2300,
  'today falls back to the calculator');
select is((select kcal::integer from public.nutrition_targets
           where id = private.active_nutrition_target(tests.user_id('client_d'), :'today'::date - 9)), 2300,
  'a finished day that was never frozen follows today''s rules');
select is((select kcal::integer from public.nutrition_targets
           where id = private.active_nutrition_target(tests.user_id('client_c'), :'today'::date - 3)), 1600,
  'a day in the group keeps the group template after leaving it');
select is(private.active_nutrition_target(tests.user_id('client_c'), :'today'::date), null,
  'today client_c has no target');

-- Ending the pair: client_c's frozen days stay as they were.
update public.coachings set status = 'ended', ended_at = now() where id = :'pair_c';
select is((select kcal::integer from public.nutrition_targets
           where id = private.active_nutrition_target(tests.user_id('client_c'), :'today'::date - 1)), 1600,
  'yesterday keeps the template after the pair ends');

select ok(not has_table_privilege('authenticated', 'private.nutrition_day_targets', 'select'),
  'clients cannot read the frozen targets');

select * from finish();
rollback;

-- Trainer groups and broadcasts of migration 20261017041310_trainer_groups.sql (PRD wave-2 §6, 6.1-6.7): plan
-- gates, the group template as a target source, the primary nutrition group, the goal warning, broadcasts with
-- their stats, the daily limit, muting, and what other trainers and clients see.
begin;
\ir _helpers.psql
select plan(34);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_free');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_user('client_h');
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) c;
select tests.create_pair('trainer_b', 'client_h');
select tests.create_pair('trainer_free', 'client_h');
select tests.set_share('trainer_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g']) c;
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.grant_plan('trainer_b', 'trainer_pro');
select tests.pair_id('trainer_a', 'client_c') as pair_c \gset
select tests.pair_id('trainer_a', 'client_d') as pair_d \gset
select tests.pair_id('trainer_a', 'client_e') as pair_e \gset
select tests.pair_id('trainer_a', 'client_f') as pair_f \gset
select tests.pair_id('trainer_a', 'client_g') as pair_g \gset
select tests.pair_id('trainer_b', 'client_h') as pair_bh \gset
insert into public.client_goals (user_id, goal) values (tests.user_id('client_f'), 'gain'), (tests.user_id('client_c'), 'lose');
-- Client d has the calculator's target, client e also A's own target.
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_d'), 2100, current_date - 10, tests.user_id('client_d'));
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_e'), :'pair_e', 2000, current_date - 10, tests.user_id('trainer_a'));

-- Plan gate and ownership -------------------------------------------------------------------------------------

select tests.authenticate_as('trainer_free');
select throws_ok($$ insert into public.groups (trainer_id, name) values (auth.uid(), 'Free group') $$, '42501', null,
  'a trainer without trainer.groups cannot create a group');

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Сброс веса', 'lose');
select g.id as group_lose from public.groups g where g.name = 'Сброс веса' \gset
select is((select count(*)::int from public.groups), 1, 'trainer A with Pro creates a group');

-- 6.1: three clients join, the template becomes their target where nothing outranks it.
select is(public.add_group_member(:'group_lose', :'pair_c'), false, 'client c (goal lose) joins without a warning');
select is(public.add_group_member(:'group_lose', :'pair_d'), false, 'client d without a goal joins without a warning');
select is(public.add_group_member(:'group_lose', :'pair_e'), false, 'client e joins');
select throws_ok(format($$ select public.add_group_member(%L, %L) $$, :'group_lose', :'pair_c'), 'P0001', 'already_member',
  'a pair joins a group once');
select is(public.group_target_impact(:'group_lose'), 2, 'the template would apply to c and d, not to e with A''s own target');
select ok(public.set_group_target(:'group_lose', 1600, 120, 50, 160, 2000, 10000) is not null, 'A sets the group template');
select throws_ok(format($$ select public.set_group_target(%L, 1100) $$, :'group_lose'), '22023', 'low_kcal_unconfirmed',
  'a template under 1200 kcal needs a confirmation');
select is((select count(*)::int from public.coachings where primary_nutrition_group_id = :'group_lose'), 3,
  'the members take the group as their primary nutrition group');
select is(public.pair_nutrition_state(:'pair_c'), 'group', 'A sees that the group template is active for c');
select is(public.pair_nutrition_state(:'pair_e'), 'mine', 'A''s own target still wins for e');

select tests.authenticate_as('client_c');
select results_eq($$ select source::text, kcal::int, trainer_name from public.my_nutrition_target() $$,
  $$ values ('group', 1600, 'trainer_a') $$, 'client c gets the group template with the trainer''s name');
select tests.authenticate_as('client_d');
select results_eq($$ select source::text, kcal::int from public.my_nutrition_target() $$, $$ values ('group', 1600) $$,
  'the template outranks client d''s calculator target');
select tests.authenticate_as('client_e');
select results_eq($$ select source::text, kcal::int from public.my_nutrition_target() $$, $$ values ('trainer', 2000) $$,
  'client e keeps the trainer''s individual target');

-- 6.2: a client whose goal is gain joins a lose group: the warning flag.
select tests.authenticate_as('trainer_a');
select is(public.add_group_member(:'group_lose', :'pair_f'), true, 'client f (goal gain) joins with the goal warning');
select public.add_group_member(:'group_lose', :'pair_g');

-- 6.3: a second group with a template asks which one is primary.
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Марафон', null);
select g.id as group_two from public.groups g where g.name = 'Марафон' \gset
select public.set_group_target(:'group_two', 1900);
select throws_ok(format($$ select public.add_group_member(%L, %L) $$, :'group_two', :'pair_c'), 'P0001', 'primary_choice_required',
  'joining a second group with a template needs the primary choice');
select public.add_group_member(:'group_two', :'pair_c', true);
select is((select primary_nutrition_group_id from public.coachings where id = :'pair_c'), :'group_two'::uuid,
  'the chosen group becomes primary');
select public.add_group_member(:'group_two', :'pair_d', false);
select is((select primary_nutrition_group_id from public.coachings where id = :'pair_d'), :'group_lose'::uuid,
  'keeping the current group leaves it primary');
select tests.authenticate_as('client_c');
select results_eq($$ select kcal::int from public.my_nutrition_target() $$, $$ values (1900) $$,
  'client c now gets the primary group''s template');

-- 6.7: other trainers and clients.
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.groups), 0, 'trainer B sees none of A''s groups');
select throws_ok(format($$ select public.add_group_member(%L, %L) $$, :'group_lose', :'pair_bh'), '42501', 'forbidden',
  'trainer B cannot add to A''s group');
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.add_group_member(%L, %L) $$, :'group_lose', :'pair_bh'), 'P0001', 'pair_not_found',
  'trainer A cannot add a client of another trainer');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.group_members), 2, 'a client reads only own membership rows');
select results_eq($$ select name from public.my_groups() order by name $$, $$ values ('Марафон'), ('Сброс веса') $$,
  'a client sees the names of own groups');

-- 6.4: a broadcast to 5 members: c is in quiet hours, d blocked the bot, the rest get it.
select tests.clear_authentication();
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;
update public.user_settings
set time_zone = 'UTC',
    quiet_hours_start = (now() at time zone 'UTC')::time - interval '1 hour',
    quiet_hours_end = (now() at time zone 'UTC')::time + interval '1 hour'
where user_id = tests.user_id('client_c');
update public.profiles set bot_blocked_at = now() where id = tests.user_id('client_d');
delete from public.notification_outbox;

select tests.authenticate_as('trainer_free');
select throws_ok(format($$ select public.send_broadcast(%L, 'Hi') $$, :'group_lose'), '42501', 'plan_required',
  'a trainer without trainer.broadcasts cannot send');
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.send_broadcast(%L, 'Go', 'url', 'http://x.test') $$, :'group_lose'), '22023',
  'invalid_broadcast', 'a link button takes https only');
select public.send_broadcast(:'group_lose', 'Тренировка завтра в 10', 'deep_link') as first_broadcast \gset
select tests.clear_authentication();
select is((select count(*)::int from public.notification_outbox where broadcast_id = :'first_broadcast'), 5,
  'one outbox row per member');

select tests.authenticate_as_service_role();
select public.record_outbox_result(c.outbox_id, 'sent', 1) from public.claim_outbox(100) c;
select tests.authenticate_as('trainer_a');
select results_eq(format($$ select recipients, sent, deferred, undelivered, muted from public.broadcast_history(%L) $$, :'group_lose'),
  $$ values (5, 3, 1, 1, 0) $$, 'the stats: 3 sent, 1 deferred by quiet hours, 1 not delivered');

-- 6.6: client e mutes trainer A's broadcasts.
select tests.authenticate_as('client_e');
select public.set_broadcasts_muted(:'pair_e', true);
select throws_ok(format($$ select public.set_broadcasts_muted(%L, true) $$, :'pair_bh'), 'P0001', 'pair_not_found',
  'a client mutes only own pairs');
select tests.authenticate_as('trainer_a');
select public.send_broadcast(:'group_lose', 'Второе') as second_broadcast \gset
select results_eq(format($$ select muted from public.broadcast_history(%L) where id = %L $$, :'group_lose', :'second_broadcast'),
  $$ values (1) $$, 'a muted client is counted as turned off by the recipient');
select tests.clear_authentication();
select is((select count(*)::int from public.notification_outbox where broadcast_id = :'second_broadcast' and user_id = tests.user_id('client_e')
  and status = 'pending'), 0, 'nothing is queued for the muted client');
select tests.authenticate_as('trainer_a');

-- 6.5: the sixth broadcast of the day is refused.
select public.send_broadcast(:'group_lose', 'Третье');
select public.send_broadcast(:'group_lose', 'Четвёртое');
select public.send_broadcast(:'group_lose', 'Пятое');
select is(public.broadcasts_today(), 5, 'five broadcasts today');
select throws_ok(format($$ select public.send_broadcast(%L, 'Шестое') $$, :'group_lose'), 'P0001', 'broadcast_limit',
  'the sixth broadcast of the day is refused');

select * from finish();
rollback;

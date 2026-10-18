-- The challenge participation badge (migration 20261018024117_challenge_joined_badge.sql, PRD wave-3 §2.2-5):
-- a finished challenge gives "challenge_joined" to everyone who scored, and nothing to a participant at zero.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_z');
select tests.create_pair('trainer_a', 'client_c') as pair_c \gset
select tests.create_pair('trainer_a', 'client_z') as pair_z \gset
update public.user_settings set time_zone = 'UTC'
where user_id in (select tests.user_id(h) from unnest(array['trainer_a', 'client_c', 'client_z']) h);
select (now() at time zone 'UTC')::date as today \gset

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Бодрые', 'lose');
select g.id as group_id from public.groups g where g.name = 'Бодрые' \gset
select public.add_group_member(:'group_id', p) from unnest(array[:'pair_c', :'pair_z']::uuid[]) p;
select public.create_challenge(:'group_id', 'Неделя шагов', 'steps', 1::smallint, :'today', 100000, false) as ch \gset

select tests.authenticate_as('client_c');
select public.join_challenge(:'ch');
select tests.authenticate_as('client_z');
select public.join_challenge(:'ch');

select tests.clear_authentication();
insert into public.activity_entries (client_id, local_date, metric, value, source)
values (tests.user_id('client_c'), :'today'::date - 2, 'steps', 3000, 'manual');
update public.challenges set starts_on = :'today'::date - 7, ends_on = :'today'::date - 1 where id = :'ch';

select is(private.finish_challenges(), 1, 'the challenge finishes');
select results_eq(
  $$ select badge_code from public.user_badges where user_id = tests.user_id('client_c') and badge_code like 'challenge%' $$,
  $$ values ('challenge_joined') $$,
  'a participant who scored short of the goal, with no leaderboard, gets the participation badge only');
select is((select count(*)::int from public.user_badges where user_id = tests.user_id('client_z')), 0,
  'a participant at zero gets nothing');
select is((select count(*)::int from public.notification_outbox where type = 'badge' and payload ->> 'badge' = 'challenge_joined'), 1,
  'the badge queues one bot message');

select * from finish();
rollback;

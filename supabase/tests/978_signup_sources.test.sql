-- Signup sources of migration 20261018192613_signup_sources.sql: users cannot read or write the table, only
-- plain labels go in, one row per account, and admins see accounts by label with trainers and clients.
begin;
\ir _helpers.psql
select plan(12);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_card('trainer_a', 'client_card');

-- As the server writes them with the secret key: trainer a from VK, client c from VK with a campaign, trainer b
-- from the Telegram channel, client d without a label; the admin signed up before labels were kept.
insert into public.signup_sources (user_id, source, campaign, entry) values
  (tests.user_id('trainer_a'), 'vk', null, 'mini_app'),
  (tests.user_id('client_c'), 'vk', 'autumn', 'web'),
  (tests.user_id('trainer_b'), 'tg', null, 'mini_app'),
  (tests.user_id('client_d'), null, null, 'mini_app');

select throws_ok(
  $$ insert into public.signup_sources (user_id, source, entry) values (tests.user_id('admin_x'), 'Ivan Petrov', 'web') $$,
  '23514', null, 'only a plain lowercase label goes in');
select throws_ok(
  $$ insert into public.signup_sources (user_id, source, campaign, entry) values (tests.user_id('admin_x'), null, 'autumn', 'web') $$,
  '23514', null, 'no campaign without a source');
select throws_ok(
  $$ insert into public.signup_sources (user_id, source, entry) values (tests.user_id('trainer_a'), 'yt', 'web') $$,
  '23505', null, 'one row per account');

-- =========================================================================================================

select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.signup_sources $$, '42501', null, 'a user cannot read the table');
select throws_ok(
  $$ insert into public.signup_sources (user_id, source, entry) values (auth.uid(), 'ig', 'web') $$,
  '42501', null, 'a user cannot write it');
select throws_ok($$ select * from public.admin_owner_sources() $$, '42501', null, 'a user cannot call the breakdown');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_owner_sources() $$, '42501', null, 'anon cannot call it');

select tests.authenticate_as('admin_x');
select is(
  (select users from public.admin_owner_sources() where source = 'vk' and campaign is null), 1,
  'vk without a campaign: trainer a');
select is(
  (select array[users, trainers, clients] from public.admin_owner_sources() where source = 'vk' and campaign = 'autumn'),
  array[1, 0, 1], 'vk with a campaign: client c, a client of a live pair');
select is(
  (select array[users, trainers, clients] from public.admin_owner_sources() where source = 'tg'), array[1, 1, 0],
  'tg: trainer b');
select is(
  (select users from public.admin_owner_sources() where source is null), 2,
  'no label: client d and the admin from before labels, no card');
select is((select sum(users)::integer from public.admin_owner_sources()), 5, 'every account once, cards left out');

select * from finish();
rollback;

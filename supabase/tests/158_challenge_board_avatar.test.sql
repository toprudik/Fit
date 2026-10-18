-- The avatar on the challenge leaderboard, migration 20261018052219_challenge_board_avatar.sql (PRD wave-3
-- §2.4-17): challenge_board returns the photo of each row the caller may read, and nothing more.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_pair('trainer_a', 'client_c') as pair_c \gset
select tests.create_pair('trainer_a', 'client_e') as pair_e \gset
select tests.create_pair('trainer_a', 'client_f') as pair_f \gset
update public.user_settings set time_zone = 'UTC' where user_id in (tests.user_id('trainer_a'), tests.user_id('client_c'), tests.user_id('client_e'), tests.user_id('client_f'));
update public.profiles set photo_url = 'https://t.example/c.jpg' where id = tests.user_id('client_c');
update public.profiles set photo_url = 'https://t.example/e.jpg' where id = tests.user_id('client_e');
update public.profiles set photo_url = 'https://t.example/f.jpg' where id = tests.user_id('client_f');
select (now() at time zone 'UTC')::date as today \gset

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Шаги', null);
select g.id as group_id from public.groups g where g.name = 'Шаги' \gset
select public.add_group_member(:'group_id', p) from unnest(array[:'pair_c', :'pair_e', :'pair_f']::uuid[]) p;
select public.create_challenge(:'group_id', 'Октябрь', 'steps', 2::smallint, :'today', 10000, true) as ch \gset

select tests.authenticate_as('client_c');
select public.join_challenge(:'ch', true);
select tests.authenticate_as('client_e');
select public.join_challenge(:'ch');
select tests.authenticate_as('client_f');
select public.join_challenge(:'ch', true, 'Ракета');

select tests.authenticate_as('client_e');
select results_eq(format('select name, photo_url from public.challenge_board(%L) order by name', :'ch'),
  $$ values ('client_c'::text, 'https://t.example/c.jpg'::text), ('client_e', 'https://t.example/e.jpg'), ('Ракета', null) $$,
  'a participant sees the photo of a shown participant and their own, not of one under an alias');

select tests.authenticate_as('client_c');
select results_eq(format('select photo_url from public.challenge_board(%L) where is_me', :'ch'),
  $$ values ('https://t.example/c.jpg'::text) $$,
  'a participant sees their own photo');
select is((select count(*)::int from public.challenge_board(:'ch') where name = 'client_e'), 0,
  'the photo of a participant off the board is not shown to others');
select tests.authenticate_as('client_f');
select results_eq(format('select photo_url from public.challenge_board(%L) where is_me', :'ch'),
  $$ values ('https://t.example/f.jpg'::text) $$,
  'one under an alias sees their own photo');

select tests.authenticate_as('trainer_a');
select is((select count(photo_url)::int from public.challenge_board(:'ch')), 3, 'the trainer sees every photo, the alias too');

select * from finish();
rollback;

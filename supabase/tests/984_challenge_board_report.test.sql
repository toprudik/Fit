-- The board's report_id, migration 20261020092417_challenge_board_report.sql: another participant reports an alias by
-- its challenge_participants row, and nothing on the board gives away a user's id or an aliased photo.
begin;
\ir _helpers.psql
select plan(7);

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

select tests.clear_authentication();
select p.id as alias_row from public.challenge_participants p where p.challenge_id = :'ch' and p.alias = 'Ракета' \gset
select tests.authenticate_as('client_e');
select results_eq(format('select name, report_id is not null from public.challenge_board(%L) order by name', :'ch'),
  $$ values ('client_c'::text, false), ('client_e', false), ('Ракета', true) $$,
  'only an alias of someone else can be reported');
select is((select report_id from public.challenge_board(:'ch') where name = 'Ракета'),
  :'alias_row'::uuid,
  'it is the row of this challenge');
select is((select count(*)::int from public.challenge_board(:'ch') b
           where b.report_id in (select id from public.profiles)), 0, 'never a user id');
select is((select photo_url from public.challenge_board(:'ch') where name = 'Ракета'), null, 'and the photo under an alias stays hidden');
select lives_ok(format($$ select public.report_content('challenge_alias', %L, 'insult') $$,
  (select report_id from public.challenge_board(:'ch') where name = 'Ракета')), 'the report goes through by that id');

select tests.authenticate_as('client_f');
select is((select report_id from public.challenge_board(:'ch') where is_me), null, 'no report on one''s own row');

select tests.authenticate_as('trainer_a');
select is((select count(report_id)::int from public.challenge_board(:'ch')), 0, 'the trainer reports nothing from the board');

select * from finish();
rollback;

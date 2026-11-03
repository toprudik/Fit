-- QA 37 (20261103084705_digest_name_and_quiet_hours.sql): the daily digest goes out at the hour the trainer
-- picked even inside their quiet hours, and names a client the way the app does (alias, then the name the client
-- chose, then first and last name, then @username).
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
select tests.pair_id('trainer_a', 'client_c') as pair_ac \gset

select ok(private.notification_ignores_quiet_hours('daily_digest'), 'the digest ignores quiet hours');
select ok(not private.notification_ignores_quiet_hours('booking_created'), 'other messages still wait for quiet hours to end');

update public.coaching_trainer_meta set client_alias = null where coaching_id = :'pair_ac';
update public.profiles set display_name = 'Катюша', first_name = 'Екатерина', last_name = 'Петрова', username = 'katya_test'
where id = tests.user_id('client_c');
select is(private.trainer_client_label(:'pair_ac'), 'Катюша', 'the name the client chose comes before first and last name');

update public.profiles set display_name = null where id = tests.user_id('client_c');
select is(private.trainer_client_label(:'pair_ac'), 'Екатерина Петрова', 'without it, first and last name');

select * from finish();
rollback;

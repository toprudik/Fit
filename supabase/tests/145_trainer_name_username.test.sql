-- «Написать тренеру» in the bot, migration 20261017134613_trainer_name_username.sql (PRD wave-1 §3, К1/К4–К6).
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.profiles set first_name = 'Ира', username = 'ira_trainer' where id = tests.user_id('trainer_a');
update public.profiles set first_name = 'Олег', username = null where id = tests.user_id('trainer_b');

select is(private.trainer_name(tests.user_id('trainer_a')) ->> 'username', 'ira_trainer', 'the name carries the username');
select ok(not private.trainer_name(tests.user_id('trainer_b')) ? 'username', 'a trainer without one adds no key');

select tests.authenticate_as('trainer_a');
select created from public.create_session(tests.pair_id('trainer_a', 'client_c'), date_trunc('hour', now()) + interval '2 days',
                                          60::smallint, 'offline');
select tests.clear_authentication();

select is((select payload ->> 'username' from public.notification_outbox
           where type = 'booking_assigned' and user_id = tests.user_id('client_c')),
          'ira_trainer', 'К1 carries the trainer''s username');
select is((select payload ->> 'first_name' from public.notification_outbox
           where type = 'booking_assigned' and user_id = tests.user_id('client_c')),
          'Ира', 'and still the name');

select * from finish();
rollback;

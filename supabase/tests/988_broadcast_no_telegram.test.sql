-- Migration 20261022213317_broadcast_no_telegram.sql (QA 22.10): a group member without Telegram is not shown as
-- waiting for quiet hours. send_broadcast skips their row at once and broadcast_history counts them apart.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_card('trainer_a', 'card_k');
-- Quiet hours for everyone right now, so a member with Telegram waits.
update public.user_settings
set time_zone = 'UTC',
    quiet_hours_start = (now() at time zone 'UTC')::time - interval '1 hour',
    quiet_hours_end = (now() at time zone 'UTC')::time + interval '1 hour';

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name) values (auth.uid(), 'Утро');
select g.id as group_id from public.groups g where g.name = 'Утро' \gset
select public.add_group_member(:'group_id', tests.pair_id('trainer_a', 'client_c'));
select public.add_group_member(:'group_id', tests.pair_id('trainer_a', 'card_k'));
select public.send_broadcast(:'group_id', 'Тренировка завтра в 10') as broadcast_id \gset
select tests.clear_authentication();

select is((select status::text || ':' || last_error from public.notification_outbox
           where broadcast_id = :'broadcast_id' and user_id = tests.user_id('card_k')),
  'skipped:no_telegram', 'the member without Telegram is skipped at once, not queued');
select is((select status::text from public.notification_outbox
           where broadcast_id = :'broadcast_id' and user_id = tests.user_id('client_c')),
  'pending', 'the member with Telegram is queued as before');

select tests.authenticate_as('trainer_a');
select results_eq(format($$ select recipients, sent, deferred, undelivered, muted, no_telegram
                            from public.broadcast_history(%L) $$, :'group_id'),
  $$ values (2, 0, 1, 0, 0, 1) $$, 'the stats count the member without Telegram apart from deferred and undelivered');

-- A row queued before this migration for a member without Telegram also counts as no Telegram, not as waiting.
select tests.clear_authentication();
update public.notification_outbox set status = 'pending', last_error = null
where broadcast_id = :'broadcast_id' and user_id = tests.user_id('card_k');
select tests.authenticate_as('trainer_a');
select results_eq(format($$ select deferred, no_telegram from public.broadcast_history(%L) $$, :'group_id'),
  $$ values (1, 1) $$, 'a pending row of a member without Telegram is not shown as waiting for quiet hours');

select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.broadcast_history(:'group_id')), 0, 'another trainer sees no history');

select * from finish();
rollback;

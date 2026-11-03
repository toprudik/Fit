-- A client coming back by code restores the ended pair, and the trainer's coaching_created message says so
-- (migration 20261102222553_returning_client_notice.sql): returning is false for a first join, true after.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');

create table tests.links (code text not null);
grant select, insert on tests.links to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.links select code from public.my_client_invite();

select tests.authenticate_as('client_c');
select public.join_by_code((select code from tests.links));
select tests.clear_authentication();

select results_eq(
  $$ select (payload ->> 'returning')::boolean from public.notification_outbox
     where user_id = tests.user_id('trainer_a') and type = 'coaching_created' $$,
  $$ values (false) $$,
  'first join: the message is about a new client'
);

update public.coachings set status = 'ended', ended_at = now(), ended_by = tests.user_id('client_c')
where trainer_id = tests.user_id('trainer_a') and client_id = tests.user_id('client_c');
-- The dedupe key holds the second, so the second join gets its own row.
update public.notification_outbox set dedupe_key = dedupe_key || ':old' where type = 'coaching_created';

select tests.authenticate_as('client_c');
select public.join_by_code((select code from tests.links));
select tests.clear_authentication();

select is(
  (select count(*)::int from public.coachings where client_id = tests.user_id('client_c')),
  1,
  'coming back: the same pair is restored'
);
select results_eq(
  $$ select (payload ->> 'returning')::boolean from public.notification_outbox
     where user_id = tests.user_id('trainer_a') and type = 'coaching_created' and dedupe_key not like '%:old' $$,
  $$ values (true) $$,
  'coming back: the message says the client is back'
);

select * from finish();
rollback;

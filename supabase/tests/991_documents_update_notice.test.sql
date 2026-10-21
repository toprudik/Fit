-- The bot message ahead of new editions of the documents, migration 20261021004943_documents_update_notice.sql
-- (право 15): an admin announces the day, everyone with an account gets one message, once.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_admin('admin_a');
select tests.create_trainer('trainer_t');
select tests.create_user('client_c');
select tests.create_user('client_gone');
select tests.create_card('trainer_t', 'card_k');
insert into public.account_deletions (user_id, scheduled_for) values (tests.user_id('client_gone'), now() + interval '30 days');
delete from public.notification_outbox;

select tests.authenticate_as('client_c');
select throws_ok($$ select public.announce_documents_update(current_date + 14) $$, '42501', null, 'only an admin announces');

select tests.authenticate_as('admin_a');
select throws_ok($$ select public.announce_documents_update(current_date - 1) $$, 'P0001', 'date_not_ahead',
  'the day must be ahead: the message warns');
select is(public.announce_documents_update(current_date + 14), 3, 'the admin, the trainer and C get it');

select tests.authenticate_as_service_role();
select is(
  (select array_agg(t.handle order by t.handle) from public.notification_outbox o join tests.users t on t.id = o.user_id
   where o.type = 'documents_update'),
  array['admin_a', 'client_c', 'trainer_t'],
  'not the card without an account, not the account being deleted'
);
select is(
  (select payload from public.notification_outbox where user_id = tests.user_id('client_c') and type = 'documents_update'),
  pg_catalog.jsonb_build_object('effective_on', current_date + 14),
  'the message carries the day'
);
select ok(exists (select 1 from public.admin_audit_log where action = 'documents.update_announced'), 'the announcement is in the audit log');

select tests.authenticate_as('admin_a');
select is(public.announce_documents_update(current_date + 14), 0, 'a second call for the same day queues nothing');

select * from finish();
rollback;

-- The team message of migration 20261017001900_feedback_received.sql (PRD wave-1 §2.13, FDBK-1, А2): a new feedback
-- row queues one feedback_received for the admin group, and the payload names nobody.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_user('client_c');
select tests.authenticate_as('client_c');
insert into public.feedback (id, zone, kind, body, route, platform, app_version, locale, theme)
values ('00000000-0000-4000-8000-0000000000f1', 'client', 'bug', repeat('Не открывается запись. ', 40), '/client/bookings',
        'tma-ios', 'abc1234', 'ru', 'dark');
select tests.clear_authentication();

select is(
  (select count(*)::integer from public.notification_outbox where type = 'feedback_received'), 1,
  'feedback: one message to the team'
);
select results_eq(
  $$ select chat_target, user_id from public.notification_outbox where type = 'feedback_received' $$,
  $$ values ('admin_group'::text, null::uuid) $$,
  'feedback: it goes to the admin group, not to a person'
);
select results_eq(
  $$ select payload ->> 'feedback_id', payload ->> 'kind', payload ->> 'zone', char_length(payload ->> 'excerpt'),
            (payload ->> 'screenshots')::integer
     from public.notification_outbox where type = 'feedback_received' $$,
  $$ values ('00000000-0000-4000-8000-0000000000f1'::text, 'bug'::text, 'client'::text, 400, 0) $$,
  'feedback: the payload has the id, kind, zone, the first 400 characters and the screenshot count'
);
select is(
  (select payload ?| array['user_id', 'name', 'first_name', 'username', 'telegram_id']
   from public.notification_outbox where type = 'feedback_received'),
  false,
  'feedback: the payload names nobody'
);
select is(
  (select dedupe_key from public.notification_outbox where type = 'feedback_received'),
  'feedback_received:00000000-0000-4000-8000-0000000000f1',
  'feedback: one message per feedback row'
);

select * from finish();
rollback;

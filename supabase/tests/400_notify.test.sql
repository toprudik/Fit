-- Notify policies of migration 20261015123600_notify_policies.sql (contract §6 400_notify): the server-only
-- notification outbox (ADR 0006) and calendar feeds without token_hash (R50).
begin;
\ir _helpers.psql
select plan(33);

-- Fixtures: C and D are clients of A; C has a confirmed booking on a session of A.
select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values ('session_a', tests.create_session('trainer_a', now() + interval '2 days'));
insert into tests.ids values
  ('booking_c', tests.create_booking((select id from tests.ids where name = 'session_a'), 'trainer_a', 'client_c'));
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Two reminders of C's booking and one digest of D, as the server queues them.
insert into public.notification_outbox (user_id, type, dedupe_key, payload, booking_id, session_id, scheduled_for, deliver_after)
values
  (tests.u('client_c'), 'session_reminder', 'reminder:c:1440', '{}', tests.i('booking_c'), tests.i('session_a'),
   now() + interval '1 day', now() + interval '1 day'),
  (tests.u('client_c'), 'session_reminder', 'reminder:c:60', '{}', tests.i('booking_c'), tests.i('session_a'),
   now() + interval '47 hours', now() + interval '47 hours'),
  (tests.u('client_d'), 'daily_digest', 'digest:d:2026-10-16', '{}', null, null, now(), now());

-- Calendar feeds: C has a client feed and a revoked trainer-zone feed; D has a client feed.
insert into public.calendar_feeds (user_id, zone, token_hash, revoked_at) values
  (tests.u('client_c'), 'client', sha256('c-client'::bytea), null),
  (tests.u('client_c'), 'trainer', sha256('c-trainer-old'::bytea), now()),
  (tests.u('client_d'), 'client', sha256('d-client'::bytea), null);

-- =========================================================================================================
-- notification_outbox: server only

select ok(
  (select count(*) = 1
          and bool_and(not p.polpermissive and p.polcmd = '*'
                       and pg_get_expr(p.polqual, p.polrelid) = 'false'
                       and pg_get_expr(p.polwithcheck, p.polrelid) = 'false')
   from pg_policy p where p.polrelid = 'public.notification_outbox'::regclass),
  'notification_outbox: its only policy is a restrictive deny-all for every command'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass),
  'notification_outbox: RLS is on'
);
select is(
  array(select r.rolname::text from pg_roles r
        where r.rolname in ('anon', 'authenticated')
          and (has_table_privilege(r.rolname, 'public.notification_outbox', 'select, insert, update, delete, truncate, references, trigger')
               or has_sequence_privilege(r.rolname, 'public.notification_outbox_id_seq', 'usage, select, update'))
        order by 1),
  '{}'::text[],
  'notification_outbox: anon and authenticated hold no privilege on the table or its sequence'
);

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select id from public.notification_outbox $$,
  '42501', null, 'notification_outbox: C cannot select, not even own rows'
);
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_c'), 'daily_digest', 'digest:c:spoof', '{}', now(), now()) $$,
  '42501', null, 'notification_outbox: C cannot insert'
);
select throws_ok(
  $$ update public.notification_outbox set status = 'cancelled' where user_id = tests.u('client_c') $$,
  '42501', null, 'notification_outbox: C cannot update'
);
select throws_ok(
  $$ delete from public.notification_outbox where user_id = tests.u('client_c') $$,
  '42501', null, 'notification_outbox: C cannot delete'
);

select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select id from public.notification_outbox $$,
  '42501', null, 'notification_outbox: an admin cannot select either'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select id from public.notification_outbox $$,
  '42501', null, 'notification_outbox: anon gets nothing'
);

select tests.authenticate_as_service_role();
select is(
  (select count(*)::integer from public.notification_outbox), 3,
  'notification_outbox: server code with the secret key reads every row'
);
select lives_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_d'), 'coaching_created', 'coaching:d:1', '{}', now(), now()) $$,
  'notification_outbox: server code with the secret key queues a row'
);

select tests.clear_authentication();

-- Constraints (as postgres)
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_d'), 'daily_digest', 'digest:d:2026-10-16', '{}', now(), now()) $$,
  '23505', null, 'notification_outbox: a duplicate dedupe_key raises 23505'
);
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after, status)
     values (tests.u('client_d'), 'daily_digest', 'digest:d:sent', '{}', now(), now(), 'sent') $$,
  '23514', null, 'notification_outbox: sent without sent_at violates the check'
);
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_d'), 'daily_digest', 'digest:d:early', '{}', now(), now() - interval '1 minute') $$,
  '23514', null, 'notification_outbox: deliver_after before scheduled_for violates the check'
);
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_d'), 'session_reminder', 'reminder:none', '{}', now(), now()) $$,
  '23514', null, 'notification_outbox: a session reminder without a booking violates the check'
);
select throws_ok(
  $$ insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
     values (tests.u('client_d'), 'daily_digest', 'digest:d:array', '[]', now(), now()) $$,
  '23514', null, 'notification_outbox: a payload that is not an object violates the check'
);

-- Deleting a booking removes its reminders, and only those.
delete from public.bookings where id = tests.i('booking_c');
select is(
  (select count(*)::integer from public.notification_outbox where user_id = tests.u('client_c')), 0,
  'notification_outbox: deleting a booking cascades its reminders'
);
select is(
  (select count(*)::integer from public.notification_outbox where user_id = tests.u('client_d')), 2,
  'notification_outbox: rows of other users stay'
);

-- =========================================================================================================
-- calendar_feeds

select tests.authenticate_as('client_c');
select results_eq(
  $$ select zone::text, revoked_at is not null from public.calendar_feeds order by 1 $$,
  $$ values ('client', false), ('trainer', true) $$,
  'calendar_feeds: C reads (zone, revoked_at) of both own feeds'
);
select is(
  (select count(*)::integer from public.calendar_feeds where user_id = tests.u('client_d')), 0,
  'calendar_feeds: C reads 0 of D''s feeds'
);
select lives_ok(
  $$ select id, user_id, zone, created_at, revoked_at, last_accessed_at from public.calendar_feeds $$,
  'calendar_feeds: every column except token_hash is readable'
);
select throws_ok(
  $$ select token_hash from public.calendar_feeds $$,
  '42501', null, 'calendar_feeds: select token_hash raises 42501'
);
select throws_ok(
  $$ select * from public.calendar_feeds $$,
  '42501', null, 'calendar_feeds: select * raises 42501 (the app lists columns)'
);
select throws_ok(
  $$ insert into public.calendar_feeds (user_id, zone, token_hash) values (tests.u('client_c'), 'trainer', sha256('mine'::bytea)) $$,
  '42501', null, 'calendar_feeds: insert raises 42501 (create_calendar_feed RPC only)'
);
select throws_ok(
  $$ update public.calendar_feeds set revoked_at = now() where user_id = tests.u('client_c') $$,
  '42501', null, 'calendar_feeds: update raises 42501 (revoke_calendar_feed RPC only)'
);
select throws_ok(
  $$ delete from public.calendar_feeds where user_id = tests.u('client_c') $$,
  '42501', null, 'calendar_feeds: delete raises 42501'
);

select tests.authenticate_as('admin_x');
select is(
  (select count(*)::integer from public.calendar_feeds), 0,
  'calendar_feeds: an admin reads no one else''s feeds'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select id from public.calendar_feeds $$,
  '42501', null, 'calendar_feeds: anon gets nothing'
);

select tests.authenticate_as_service_role();
select is(
  (select count(*)::integer from public.calendar_feeds where token_hash = sha256('c-client'::bytea)), 1,
  'calendar_feeds: server code with the secret key looks a feed up by token_hash'
);

select tests.clear_authentication();
select throws_ok(
  $$ insert into public.calendar_feeds (user_id, zone, token_hash) values (tests.u('client_c'), 'client', sha256('c-client-2'::bytea)) $$,
  '23505', null, 'calendar_feeds: a second active feed for the same user and zone raises 23505'
);
update public.calendar_feeds set revoked_at = now() where user_id = tests.u('client_c') and zone = 'client';
select lives_ok(
  $$ insert into public.calendar_feeds (user_id, zone, token_hash) values (tests.u('client_c'), 'client', sha256('c-client-2'::bytea)) $$,
  'calendar_feeds: a new feed is allowed after revoking the old one'
);
select throws_ok(
  $$ insert into public.calendar_feeds (user_id, zone, token_hash) values (tests.u('client_d'), 'trainer', '\x00'::bytea) $$,
  '23514', null, 'calendar_feeds: a token_hash that is not 32 bytes violates the check'
);
select throws_ok(
  $$ insert into public.calendar_feeds (user_id, zone, token_hash) values (tests.u('client_d'), 'trainer', sha256('d-client'::bytea)) $$,
  '23505', null, 'calendar_feeds: the same token_hash twice raises 23505'
);

select * from finish();
rollback;

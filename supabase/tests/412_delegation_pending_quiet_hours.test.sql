-- The reminder about an unaccepted substitute goes out on time in quiet hours, silently, instead of waiting for
-- the morning and being skipped once the session has begun (20261103121017_delegation_pending_quiet_hours.sql,
-- QA bug 32). Other delegation messages still wait for the end of quiet hours.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');
-- Quiet hours around now for the owner, in UTC so the test does not depend on the clock.
update public.user_settings
set time_zone = 'UTC',
    quiet_hours_start = ((now() at time zone 'UTC') - interval '1 hour')::time,
    quiet_hours_end = ((now() at time zone 'UTC') + interval '1 hour')::time
where user_id = tests.user_id('trainer_a');

create temp table ids on commit drop as
select tests.create_session('trainer_a', now() + interval '90 minutes') as session_id;
insert into public.delegations (owner_trainer_id, kind, session_id, scopes)
select tests.user_id('trainer_a'), 'substitute', session_id, '{schedule}' from ids;

select private.queue_delegation_reminders();
select private.enqueue_notification('delegation', 'k:d:declined',
  pg_catalog.jsonb_build_object('event', 'declined', 'delegation_id', (select id from public.delegations limit 1)),
  tests.user_id('trainer_a'));

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  (select c.payload ->> 'event' from claimed c where c.kind = 'delegation'),
  'pending',
  'claim: the reminder about an unaccepted substitute goes out in quiet hours');
select is(
  (select c.silent from claimed c where c.kind = 'delegation'),
  true,
  'claim: it goes out silently');
select ok(
  (select o.status = 'pending' and o.deliver_after > now() from public.notification_outbox o where o.dedupe_key = 'k:d:declined'),
  'claim: another delegation message still waits for the end of quiet hours');

select * from finish();
rollback;

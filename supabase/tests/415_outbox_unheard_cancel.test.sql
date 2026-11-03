-- A trainer's cancellation goes out only if the person may have heard of the session (QA 43,
-- 20261103131157_outbox_skip_unheard_cancel.sql): skipped when the only «Новое занятие» about it was skipped.
begin;
\ir _helpers.psql
select plan(2);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('unheard', tests.create_session('trainer_a', now() + interval '1 day')),
  ('heard', tests.create_session('trainer_a', now() + interval '2 days')),
  ('booked', tests.create_session('trainer_a', now() + interval '3 days'));

select private.enqueue_notification('booking_assigned', 'n:unheard', '{}', tests.user_id('client_c'),
  p_session_id => (select id from tests.ids where name = 'unheard'));
select private.enqueue_notification('booking_assigned', 'n:heard', '{}', tests.user_id('client_c'),
  p_session_id => (select id from tests.ids where name = 'heard'));
update public.notification_outbox set status = 'skipped', last_error = 'booking_outdated' where dedupe_key = 'n:unheard';
update public.notification_outbox set status = 'sent', sent_at = now() where dedupe_key = 'n:heard';

select private.enqueue_notification('booking_cancelled_by_trainer', 'k:' || name, '{}', tests.user_id('client_c'),
  p_session_id => id)
from tests.ids;

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id
        where o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:booked', 'k:heard'],
  'claim: a cancellation goes out when the person booked themselves or got «Новое занятие»');
select is(
  (select last_error from public.notification_outbox where dedupe_key = 'k:unheard' and status = 'skipped'),
  'booking_outdated', 'claim: a cancellation of a session the person never heard of is skipped');

select * from finish();
rollback;

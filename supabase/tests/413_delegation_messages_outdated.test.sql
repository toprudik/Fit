-- A substitute's messages held back by quiet hours are skipped once none of its sessions is ahead
-- (20261103122317_delegation_messages_outdated.sql, QA bug 33): the client's «можно отменить без списания», the
-- invite and the owner's answers. An invite for several sessions still goes out while one of them is ahead.
begin;
\ir _helpers.psql
select plan(2);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('s_started', tests.create_session('trainer_a', now() - interval '1 hour')),
  ('s_ahead', tests.create_session('trainer_a', now() + interval '1 day')),
  ('s_cancelled', tests.create_session('trainer_a', now() + interval '2 days'));
update public.sessions set status = 'cancelled', cancelled_at = now() where id = tests.i('s_cancelled');

-- Accepted for a session that has begun, pending for a cancelled one, and an invite for two sessions led by the
-- started one with the second still ahead.
with x as (insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, status, accepted_at)
  values (tests.user_id('trainer_a'), tests.user_id('trainer_b'), 'substitute', tests.i('s_started'), '{schedule}', 'active', now()) returning id)
insert into tests.ids select 'd_started', id from x;
with x as (insert into public.delegations (owner_trainer_id, kind, session_id, scopes)
  values (tests.user_id('trainer_a'), 'substitute', tests.i('s_cancelled'), '{schedule}') returning id)
insert into tests.ids select 'd_cancelled', id from x;
with x as (insert into public.delegations (owner_trainer_id, kind, session_id, scopes)
  values (tests.user_id('trainer_a'), 'substitute', tests.i('s_started'), '{schedule}') returning id)
insert into tests.ids select 'd_lead', id from x;
insert into public.delegations (owner_trainer_id, kind, session_id, scopes, lead_id)
values (tests.user_id('trainer_a'), 'substitute', tests.i('s_ahead'), '{schedule}', tests.i('d_lead'));
with x as (insert into public.delegations (owner_trainer_id, kind, scopes, all_clients)
  values (tests.user_id('trainer_a'), 'assistant', '{schedule}', true) returning id)
insert into tests.ids select 'd_assistant', id from x;

select private.enqueue_notification('delegation', 'k:client',
  pg_catalog.jsonb_build_object('event', 'substitute', 'delegation_id', tests.i('d_started')), tests.user_id('client_c'));
select private.enqueue_notification('delegation', 'k:accepted',
  pg_catalog.jsonb_build_object('event', 'accepted', 'delegation_id', tests.i('d_started')), tests.user_id('trainer_a'));
select private.enqueue_notification('delegation', 'k:invited:cancelled',
  pg_catalog.jsonb_build_object('event', 'invited', 'delegation_id', tests.i('d_cancelled')), tests.user_id('trainer_b'));
select private.enqueue_notification('delegation', 'k:declined:cancelled',
  pg_catalog.jsonb_build_object('event', 'declined', 'delegation_id', tests.i('d_cancelled')), tests.user_id('trainer_a'));
select private.enqueue_notification('delegation', 'k:invited:several',
  pg_catalog.jsonb_build_object('event', 'invited', 'delegation_id', tests.i('d_lead')), tests.user_id('trainer_b'));
select private.enqueue_notification('delegation', 'k:assistant',
  pg_catalog.jsonb_build_object('event', 'assistant', 'delegation_id', tests.i('d_assistant')), tests.user_id('client_c'));

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:assistant', 'k:invited:several'],
  'claim: an assistant message and an invite with a session still ahead go out');
select is(
  array(select o.dedupe_key || '=' || o.last_error from public.notification_outbox o where o.status = 'skipped' and o.dedupe_key like 'k:%' order by o.dedupe_key),
  array['k:accepted=delegation_outdated', 'k:client=delegation_outdated', 'k:declined:cancelled=delegation_outdated',
        'k:invited:cancelled=delegation_outdated'],
  'claim: messages about a substitute whose session has begun or was cancelled are skipped');

select * from finish();
rollback;

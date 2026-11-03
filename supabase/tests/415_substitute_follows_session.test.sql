-- A substitute follows its session when the session moves (20261103124317_substitute_follows_session.sql, QA bug
-- 35): an accepted one keeps access until the new end, an unaccepted one gets a reminder before the new time, and
-- the reminder queued for the old time is skipped.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('s_accepted', tests.create_session('trainer_a', now() + interval '1 day')),
  ('s_pending', tests.create_session('trainer_a', now() + interval '1 hour'));
with x as (insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, status, accepted_at, ends_at)
  select tests.user_id('trainer_a'), tests.user_id('trainer_b'), 'substitute', s.id, '{schedule}', 'active', now(), s.ends_at
  from public.sessions s where s.id = tests.i('s_accepted') returning id)
insert into tests.ids select 'd_accepted', id from x;
with x as (insert into public.delegations (owner_trainer_id, kind, session_id, scopes, ends_at)
  select tests.user_id('trainer_a'), 'substitute', s.id, '{schedule}', s.ends_at
  from public.sessions s where s.id = tests.i('s_pending') returning id)
insert into tests.ids select 'd_pending', id from x;

-- The reminder for the old time is queued, then both sessions move.
select private.queue_delegation_reminders();
update public.sessions set starts_at = starts_at + interval '3 hours', ends_at = ends_at + interval '3 hours'
where id = tests.i('s_accepted');
update public.sessions set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes'
where id = tests.i('s_pending');

select is(
  (select d.ends_at from public.delegations d where d.id = tests.i('d_accepted')),
  (select s.ends_at from public.sessions s where s.id = tests.i('s_accepted')),
  'move: an accepted substitute ends with the session at its new end');
select is(
  (select o.last_error from public.notification_outbox o
   where o.type = 'delegation' and o.payload ->> 'delegation_id' = tests.i('d_pending')::text and o.status = 'skipped'),
  'session_moved',
  'move: the reminder queued for the old time is skipped');

select is(private.queue_delegation_reminders(), 1, 'move: the unaccepted substitute is due a reminder again');
select is(
  (select (o.payload ->> 'starts_at')::timestamptz from public.notification_outbox o
   where o.type = 'delegation' and o.payload ->> 'delegation_id' = tests.i('d_pending')::text and o.status = 'pending'),
  (select s.starts_at from public.sessions s where s.id = tests.i('s_pending')),
  'move: the new reminder names the new time');

select * from finish();
rollback;

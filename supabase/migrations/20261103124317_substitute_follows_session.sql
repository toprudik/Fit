-- Moving a session broke its substitute (QA bug 35). An accepted one ended at the old end (ends_at was copied
-- when it was created): the substitute lost access, the owner saw «Передать на подмену» again and got
-- «Подмена на это занятие уже есть». An unaccepted one got no reminder before the new time (reminded_at stayed set
-- and the outbox key had no time), and a reminder queued for the old time could still go out with it.
-- Now a substitute follows its session: ends_at moves with it, the reminder is due again, a stale reminder is
-- skipped, and the reminder key carries the session's start. Body of
-- 20261103121017_delegation_pending_quiet_hours.sql otherwise for queue_delegation_reminders.

create function private.substitute_follow_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delegations d
  set ends_at = new.ends_at,
      reminded_at = case when d.status = 'pending' then null else d.reminded_at end
  where d.session_id = new.id and d.kind = 'substitute' and d.status in ('pending', 'active')
    -- A session put back before the substitute began (only tests and repairs do that) leaves it as it is.
    and new.ends_at > d.starts_at;

  update public.notification_outbox o
  set status = 'skipped', last_error = 'session_moved', locked_until = null
  where o.type = 'delegation' and o.status = 'pending' and o.payload ->> 'event' = 'pending'
    and o.payload ->> 'session_id' = new.id::text;
  return null;
end $$;
revoke all on function private.substitute_follow_session() from public;

create trigger sessions_substitute_follow
after update of starts_at, ends_at on public.sessions
for each row
when (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at)
execute function private.substitute_follow_session();

create or replace function private.queue_delegation_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_key text;
  v_count integer := 0;
begin
  for v_row in
    select d.id, d.owner_trainer_id, s.id as session_id, s.starts_at
    from public.delegations d join public.sessions s on s.id = d.session_id
    where d.kind = 'substitute' and d.status = 'pending' and d.reminded_at is null and s.status = 'scheduled'
      and s.starts_at > pg_catalog.now() and s.starts_at <= pg_catalog.now() + interval '2 hours'
    for update of d skip locked
  loop
    -- The start is in the key, so a session moved after its reminder gets a new one.
    v_key := pg_catalog.format('delegation-pending:%s:%s', v_row.id, pg_catalog.date_part('epoch', v_row.starts_at)::bigint);
    perform private.enqueue_notification(
      'delegation',
      v_key,
      pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', v_row.id, 'session_id', v_row.session_id,
                                    'starts_at', v_row.starts_at),
      v_row.owner_trainer_id,
      p_session_id => v_row.session_id);
    -- enqueue_notification moved it past the owner's quiet hours; the reminder cannot wait that long.
    update public.notification_outbox set deliver_after = pg_catalog.now() where dedupe_key = v_key and status = 'pending';
    update public.delegations set reminded_at = pg_catalog.now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

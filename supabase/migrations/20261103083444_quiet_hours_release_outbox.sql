-- Quiet hours were applied once, when a message was queued: turning them off or shortening them did not release
-- what was already held, so a cancellation held until 08:00 arrived after a newer booking sent at once, and a
-- request held past its time expired unseen (QA 31). data-model.md promises that a held message moves to the new
-- end of quiet hours. Changing quiet hours or the time zone now recomputes deliver_after of the user's pending,
-- not yet attempted messages of the types that wait for quiet hours.

create function private.user_settings_requeue_quiet_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox o
  set deliver_after = private.quiet_hours_end(new.user_id, greatest(o.scheduled_for, pg_catalog.now()))
  where o.user_id = new.user_id
    and o.status = 'pending'
    and o.attempts = 0
    and not private.notification_ignores_quiet_hours(o.type);
  return null;
end $$;

comment on function private.user_settings_requeue_quiet_hours() is
  'Trigger: after the user changes quiet hours or the time zone, moves their held messages to the new end of '
  'quiet hours (or releases them now), data-model.md "Тихие часы".';
revoke all on function private.user_settings_requeue_quiet_hours() from public, anon, authenticated;

create trigger user_settings_requeue_quiet_hours
  after update of quiet_hours_start, quiet_hours_end, time_zone on public.user_settings
  for each row
  when (old.quiet_hours_start is distinct from new.quiet_hours_start
        or old.quiet_hours_end is distinct from new.quiet_hours_end
        or old.time_zone is distinct from new.time_zone)
  execute function private.user_settings_requeue_quiet_hours();

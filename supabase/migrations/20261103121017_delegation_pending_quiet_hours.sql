-- The reminder about an unaccepted substitute two hours before the session was held by quiet hours and skipped as
-- outdated once the session began, so a substitute for 07:00 never got one (QA bug 32). claim_outbox now sends it
-- on time, silently, like a session reminder: queue_delegation_reminders queues it for now, and claim_outbox does not
-- hold it. Bodies of 20261017090713_delegations.sql and 20261103083213_outbox_skip_cancelled_session.sql otherwise.

create or replace function private.queue_delegation_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select d.id, d.owner_trainer_id, s.id as session_id, s.starts_at
    from public.delegations d join public.sessions s on s.id = d.session_id
    where d.kind = 'substitute' and d.status = 'pending' and d.reminded_at is null and s.status = 'scheduled'
      and s.starts_at > pg_catalog.now() and s.starts_at <= pg_catalog.now() + interval '2 hours'
    for update of d skip locked
  loop
    perform private.enqueue_notification(
      'delegation',
      pg_catalog.format('delegation-pending:%s', v_row.id),
      pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', v_row.id, 'session_id', v_row.session_id,
                                    'starts_at', v_row.starts_at),
      v_row.owner_trainer_id,
      p_session_id => v_row.session_id);
    -- enqueue_notification moved it past the owner's quiet hours; the reminder cannot wait that long.
    update public.notification_outbox
    set deliver_after = pg_catalog.now()
    where dedupe_key = pg_catalog.format('delegation-pending:%s', v_row.id) and status = 'pending';
    update public.delegations set reminded_at = pg_catalog.now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.claim_outbox(p_limit integer default 50)
returns table (
  outbox_id   bigint,
  kind        public.notification_type,
  payload     jsonb,
  chat_id     bigint,
  chat_target text,
  locale      public.app_locale,
  time_zone   text,
  silent      boolean,
  attempt     smallint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.now();
  v_reason text;
  v_quiet_end timestamptz;
  r record;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid limit' using errcode = '22023', detail = 'claim_outbox takes 1 to 100 rows';
  end if;

  update public.notification_outbox o
  set status = case when o.attempts >= private.outbox_max_attempts() then 'failed' else 'pending' end::public.outbox_status,
      locked_until = null,
      last_error = 'lease_expired',
      deliver_after = greatest(o.deliver_after, v_now)
  where o.status = 'processing' and o.locked_until < v_now;

  for r in
    select o.id, o.type, o.user_id, o.chat_target, o.booking_id, o.session_id, o.payload,
           p.telegram_id, p.bot_blocked_at, p.blocked_at, s.locale, s.time_zone
    from public.notification_outbox o
    left join public.profiles p on p.id = o.user_id
    left join public.user_settings s on s.user_id = o.user_id
    where o.status = 'pending' and o.deliver_after <= v_now
    order by o.deliver_after, o.id
    limit p_limit
    for update of o skip locked
  loop
    v_reason := case
      when r.user_id is null then null
      when r.telegram_id is null then 'no_telegram'
      when r.blocked_at is not null then 'account_blocked'
      when r.bot_blocked_at is not null then 'bot_blocked'
      when r.type not in ('account_deletion', 'export_ready')
           and exists (select 1 from public.account_deletions d where d.user_id = r.user_id and d.cancelled_at is null)
        then 'account_deleting'
      when exists (select 1 from public.notification_preferences np
                   where np.user_id = r.user_id and np.type = r.type and not np.enabled)
        then 'disabled'
      when r.type = 'session_reminder'
           and not exists (select 1 from public.bookings b join public.sessions ss on ss.id = b.session_id
                           where b.id = r.booking_id and b.status = 'confirmed' and ss.starts_at > v_now)
        then 'reminder_outdated'
      -- A booking message held back by quiet hours goes out only while it is still true: no «Новая запись»
      -- after the client has cancelled, no request to answer once it is answered.
      when r.type in ('booking_created', 'booking_assigned', 'booking_confirmed') and r.booking_id is not null
           and not exists (select 1 from public.bookings b
                           where b.id = r.booking_id and b.status in ('confirmed', 'attended', 'no_show'))
        then 'booking_outdated'
      -- «Новое занятие» and «Занятие перенесено» carry the session, not a booking: they go out only while the
      -- client still has a live booking on that session or a later one of its repeat (QA 30).
      when r.type in ('booking_assigned', 'session_changed') and r.booking_id is null and r.session_id is not null
           and not exists (select 1 from public.sessions s0
                           join public.sessions s
                             on s.id = s0.id or (s0.recurrence_id is not null and s.recurrence_id = s0.recurrence_id)
                           join public.bookings b on b.session_id = s.id
                           where s0.id = r.session_id and s.status = 'scheduled' and s.starts_at > v_now
                             and b.client_id = r.user_id and b.status in ('requested', 'confirmed'))
        then 'booking_outdated'
      when r.type = 'booking_requested' and r.booking_id is not null
           and not exists (select 1 from public.bookings b where b.id = r.booking_id and b.status = 'requested')
        then 'booking_outdated'
      -- «Подмену … пока никто не принял» only while the substitute is still pending and the session has not begun.
      when r.type = 'delegation' and r.payload ->> 'event' = 'pending'
           and not exists (select 1 from public.delegations d join public.sessions ss on ss.id = d.session_id
                           where d.id = (r.payload ->> 'delegation_id')::uuid and d.status = 'pending'
                             and ss.status = 'scheduled' and ss.starts_at > v_now)
        then 'delegation_outdated'
    end;

    if v_reason is not null then
      update public.notification_outbox o
      set status = 'skipped', last_error = v_reason, locked_until = null
      where o.id = r.id;
      continue;
    end if;

    v_quiet_end := case when r.user_id is null then v_now else private.quiet_hours_end(r.user_id, v_now) end;
    -- «Подмену … пока никто не принял» goes out on time, silently, like a session reminder: held to the end of quiet
    -- hours it lands after a morning session has begun and is skipped above (QA bug 32).
    if v_quiet_end > v_now and not private.notification_ignores_quiet_hours(r.type)
       and not (r.type = 'delegation' and r.payload ->> 'event' = 'pending') then
      update public.notification_outbox o set deliver_after = v_quiet_end where o.id = r.id;
      continue;
    end if;

    update public.notification_outbox o
    set status = 'processing', attempts = o.attempts + 1, locked_until = v_now + interval '5 minutes'
    where o.id = r.id
    returning o.attempts into attempt;

    outbox_id := r.id;
    kind := r.type;
    payload := r.payload;
    chat_id := r.telegram_id;
    chat_target := r.chat_target;
    locale := coalesce(r.locale, 'ru');
    time_zone := r.time_zone;
    silent := v_quiet_end > v_now;
    return next;
  end loop;
end $$;


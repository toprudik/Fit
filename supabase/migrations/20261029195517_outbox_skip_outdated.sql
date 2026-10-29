-- A message held back by quiet hours could arrive when it was no longer true: «Новая запись» at 08:00 for a booking
-- the client had cancelled at 05:49, «Подмену на занятие … пока никто не принял» a day after the session began.
-- claim_outbox now skips such rows the way it skips an outdated session reminder. Body of
-- 20261015220000_notification_dispatch.sql otherwise.

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
    select o.id, o.type, o.user_id, o.chat_target, o.booking_id, o.payload,
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
    if v_quiet_end > v_now and not private.notification_ignores_quiet_hours(r.type) then
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


-- A client's booking request that came in during the trainer's quiet hours, for a session that starts before they
-- end, was held until morning, expired at the session's start and was skipped: the trainer never saw it (QA 44).
-- Rudik chose to send such a request at once, silently, like a session reminder. The rule lives in
-- private.request_before_quiet_end and is applied where quiet hours are: enqueue_notification, claim_outbox and
-- the requeue after a quiet-hours change. Bodies of 20261015220000_notification_dispatch.sql,
-- 20261103131157_outbox_skip_unheard_cancel.sql and 20261103083444_quiet_hours_release_outbox.sql otherwise.

create function private.request_before_quiet_end(
  p_type public.notification_type,
  p_session_id uuid,
  p_quiet_end timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_type = 'booking_requested'
    and exists (select 1 from public.sessions s where s.id = p_session_id and s.starts_at < p_quiet_end)
$$;

comment on function private.request_before_quiet_end(public.notification_type, uuid, timestamptz) is
  'True for a booking request whose session starts before the trainer''s quiet hours end: it is sent at once, '
  'silently, instead of waiting for the morning (QA 44).';
revoke all on function private.request_before_quiet_end(public.notification_type, uuid, timestamptz)
  from public, anon, authenticated;

create or replace function private.enqueue_notification(
  p_type public.notification_type,
  p_dedupe_key text,
  p_payload jsonb default '{}',
  p_user uuid default null,
  p_chat_target text default null,
  p_scheduled_for timestamptz default null,
  p_booking_id uuid default null,
  p_session_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheduled timestamptz := coalesce(p_scheduled_for, pg_catalog.now());
  v_quiet_end timestamptz;
  v_id bigint;
begin
  if p_user is not null and not private.notification_ignores_quiet_hours(p_type) then
    v_quiet_end := private.quiet_hours_end(p_user, v_scheduled);
  end if;
  insert into public.notification_outbox
    (user_id, chat_target, type, dedupe_key, payload, booking_id, session_id, scheduled_for, deliver_after)
  values (
    p_user, p_chat_target, p_type, p_dedupe_key, coalesce(p_payload, '{}'), p_booking_id, p_session_id, v_scheduled,
    case
      when v_quiet_end is null or private.request_before_quiet_end(p_type, p_session_id, v_quiet_end) then v_scheduled
      else v_quiet_end
    end)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.user_settings_requeue_quiet_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox o
  set deliver_after = case when private.request_before_quiet_end(o.type, o.session_id, q.quiet_end)
                           then greatest(o.scheduled_for, pg_catalog.now()) else q.quiet_end end
  from (select o2.id, private.quiet_hours_end(new.user_id, greatest(o2.scheduled_for, pg_catalog.now())) as quiet_end
        from public.notification_outbox o2 where o2.user_id = new.user_id) q
  where q.id = o.id
    and o.user_id = new.user_id
    and o.status = 'pending'
    and o.attempts = 0
    and not private.notification_ignores_quiet_hours(o.type);
  return null;
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
      -- Any other message about a substitute (to the clients, the invited trainer, the owner) only while one of its
      -- sessions is still ahead: «можно отменить без списания» or an invite link is no longer true after the start.
      when r.type = 'delegation' and r.payload ->> 'event' in ('substitute', 'invited', 'accepted', 'declined')
           and exists (select 1 from public.delegations d
                       where d.id = (r.payload ->> 'delegation_id')::uuid and d.kind = 'substitute')
           and not exists (select 1 from public.delegations d join public.sessions ss on ss.id = d.session_id
                           where (d.id = (r.payload ->> 'delegation_id')::uuid
                                  or d.lead_id = (r.payload ->> 'delegation_id')::uuid)
                             and ss.status = 'scheduled' and ss.starts_at > v_now)
        then 'delegation_outdated'
      -- «Это <Имя>?» only while the trainer has not answered it yet (QA 41).
      when r.type = 'managed_client_claim'
           and not exists (select 1 from public.managed_client_claims c
                           where c.id = (r.payload ->> 'claim_id')::uuid and c.status = 'pending')
        then 'claim_outdated'
      -- No «Занятие отменено» about a session the person never heard of (QA 43): its «Новое занятие» was skipped
      -- above as outdated and never went out, so the cancellation would be the first word about it.
      when r.type = 'booking_cancelled_by_trainer' and r.session_id is not null and r.user_id is not null
           and exists (select 1 from private.assigned_messages(r.user_id, r.session_id) a where a.status = 'skipped')
           and not exists (select 1 from private.assigned_messages(r.user_id, r.session_id) a
                           where a.status in ('pending', 'processing', 'sent', 'failed'))
        then 'booking_outdated'
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
       and not (r.type = 'delegation' and r.payload ->> 'event' = 'pending')
       and not private.request_before_quiet_end(r.type, r.session_id, v_quiet_end) then
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


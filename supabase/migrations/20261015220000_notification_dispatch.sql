-- Notification dispatch (ADR 0006, data-model §2.1 "Уведомления, напоминания, календарь", R75, R76): how outbox
-- rows get to Telegram. The table itself is in 20261015120700_notify_tables.sql.
--
--   * Producers (domain RPCs and triggers, later waves) queue rows with private.enqueue_notification, which
--     applies the recipient's quiet hours to deliver_after.
--   * pg_cron runs private.dispatch_notifications every minute. When something is due it calls the web route
--     POST /api/cron/notifications through pg_net, with the URL and secret kept in Supabase Vault.
--   * The route claims a batch with public.claim_outbox, sends each message through the Bot API and records
--     the result with public.record_outbox_result. Both are definer functions only service_role may run (R76).
--
-- Delivery is at least once: a message sent by a run that died before recording it goes out again after its
-- lease expires. Telegram has no idempotency key, so the route records each result right after each send.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Sends after five attempts give up (data-model: retries with exponential backoff, at most 5, then failed).
create function private.outbox_max_attempts()
returns smallint
language sql
immutable
set search_path = ''
as $$
  select 5::smallint
$$;

comment on function private.outbox_max_attempts() is 'Attempts after which an outbox row that keeps failing becomes failed.';
revoke all on function private.outbox_max_attempts() from public;

-- Types that go out at their own time even in quiet hours, without sound (disable_notification). Everything
-- else waits for the quiet hours to end (ADR 0006, PRD 2.9-7). bot_test answers the user's own tap on "turn on
-- messages" (AUTH-7), so holding it until morning would look like a failure.
create function private.notification_ignores_quiet_hours(p_type public.notification_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_type in ('session_reminder', 'bot_test'), false)
$$;

comment on function private.notification_ignores_quiet_hours(public.notification_type) is
  'True for types sent on time in quiet hours, silently: session reminders and the bot test message.';
revoke all on function private.notification_ignores_quiet_hours(public.notification_type) from public;

-- End of the quiet hours that p_at falls into, in the user's time zone; p_at itself when it is outside them,
-- when quiet hours are off (both null) or empty (start = end), or when the user has no settings. An interval
-- like 22:00-08:00 wraps midnight. A local end time skipped by a DST change resolves to the next valid moment.
create function private.quiet_hours_end(p_user uuid, p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(p_at, coalesce((
    select (case
              when s.quiet_hours_start < s.quiet_hours_end then
                case when l.t >= s.quiet_hours_start and l.t < s.quiet_hours_end then l.d + s.quiet_hours_end end
              when l.t >= s.quiet_hours_start then (l.d + 1) + s.quiet_hours_end
              when l.t < s.quiet_hours_end then l.d + s.quiet_hours_end
            end) at time zone s.time_zone
    from public.user_settings s
    cross join lateral (select p_at at time zone s.time_zone as ts) x
    cross join lateral (select x.ts::date as d, x.ts::time as t) l
    where s.user_id = p_user
      and s.quiet_hours_start is not null
      and s.quiet_hours_start <> s.quiet_hours_end), p_at))
$$;

comment on function private.quiet_hours_end(uuid, timestamptz) is
  'The moment the recipient''s quiet hours around p_at end, or p_at when it is outside quiet hours.';
revoke all on function private.quiet_hours_end(uuid, timestamptz) from public;

-- The one way producers queue a message, in the same transaction as their change (transactional outbox).
-- Returns the new row id, or null when a row with this dedupe_key already exists (R75: keys carry the target
-- time, so a moved session gets new keys). Recipients: a user, or a team chat (chat_target), never both.
-- Definer with no grants: only other definer code owned by postgres calls it.
create function private.enqueue_notification(
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
  v_id bigint;
begin
  insert into public.notification_outbox
    (user_id, chat_target, type, dedupe_key, payload, booking_id, session_id, scheduled_for, deliver_after)
  values (
    p_user, p_chat_target, p_type, p_dedupe_key, coalesce(p_payload, '{}'), p_booking_id, p_session_id, v_scheduled,
    case
      when p_user is null or private.notification_ignores_quiet_hours(p_type) then v_scheduled
      else private.quiet_hours_end(p_user, v_scheduled)
    end)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

comment on function private.enqueue_notification(public.notification_type, text, jsonb, uuid, text, timestamptz, uuid, uuid) is
  'Queues a bot message for a user or a team chat, with quiet hours applied to deliver_after. Returns null '
  'when the dedupe_key is already queued.';
revoke all on function private.enqueue_notification(public.notification_type, text, jsonb, uuid, text, timestamptz, uuid, uuid) from public;

-- Claims due rows for one dispatcher run (R76: public, definer, service_role only; private is not exposed).
-- First it returns rows whose lease expired (their run died) to the queue; that attempt counts. Then, for each
-- due row, locked with SKIP LOCKED so overlapping runs never share a row, it checks the recipient at send time
-- (data-model: settings changed after queueing still apply):
--   * skipped: a card without Telegram, an account blocked by an admin, a bot blocked by the user, an account
--     being deleted (except the deletion and export messages), a type the user turned off, a reminder whose
--     booking is no longer confirmed or whose session has started;
--   * deferred: a type that waits for quiet hours, when the recipient's quiet hours started after queueing;
--   * claimed: status processing with a lease, attempts + 1. silent is true for the types that ignore quiet
--     hours when the recipient is in quiet hours now.
-- Team chat rows carry chat_target; the route maps it to a chat id from its own configuration.
create function public.claim_outbox(p_limit integer default 50)
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

comment on function public.claim_outbox(integer) is
  'Dispatcher only (service_role): leases up to p_limit due outbox rows and returns what is needed to send them. '
  'Rows the recipient can no longer get are skipped, rows that now fall into quiet hours are deferred.';
revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;

-- Records what happened to one claimed row. Only rows still in processing change, so a late or repeated call
-- is a no-op that returns the row's current status (null for an unknown id). Outcomes:
--   sent     delivered; p_telegram_message_id is the Bot API message id;
--   blocked  Telegram says the bot cannot write to this user (403, chat not found): skipped, and
--            profiles.bot_blocked_at is set, so later rows are skipped at claim until the user signs in again;
--   retry    a temporary error: back to pending after max(p_retry_after_s, 30 s * 2^(attempts - 1)), or failed
--            once the attempts are used up;
--   release  the run stopped before sending (Telegram rate limit): back to pending after p_retry_after_s, and
--            the attempt is given back;
--   failed   an error that will not go away by itself (a bad message, no team chat configured).
-- p_error is a short code such as "telegram_403"; never a token or a URL.
create function public.record_outbox_result(
  p_id bigint,
  p_outcome text,
  p_telegram_message_id bigint default null,
  p_error text default null,
  p_retry_after_s integer default null
)
returns public.outbox_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_error text := pg_catalog.left(p_error, 500);
  v_wait interval;
begin
  if p_outcome is null or p_outcome not in ('sent', 'blocked', 'retry', 'release', 'failed') then
    raise exception 'invalid outcome' using errcode = '22023', detail = 'outcome must be sent, blocked, retry, release or failed';
  end if;
  if p_retry_after_s is not null and p_retry_after_s not between 0 and 86400 then
    raise exception 'invalid retry_after' using errcode = '22023', detail = 'retry_after is 0 to 86400 seconds';
  end if;

  select * into v_row from public.notification_outbox o where o.id = p_id for update;
  if not found then
    return null;
  end if;
  if v_row.status <> 'processing' then
    return v_row.status;
  end if;

  if p_outcome = 'sent' then
    update public.notification_outbox o
    set status = 'sent', sent_at = v_now, telegram_message_id = p_telegram_message_id, locked_until = null, last_error = null
    where o.id = p_id;
    return 'sent'::public.outbox_status;
  elsif p_outcome = 'blocked' then
    update public.notification_outbox o
    set status = 'skipped', locked_until = null, last_error = coalesce(v_error, 'bot_blocked')
    where o.id = p_id;
    if v_row.user_id is not null then
      update public.profiles p set bot_blocked_at = v_now where p.id = v_row.user_id and p.bot_blocked_at is null;
    end if;
    return 'skipped'::public.outbox_status;
  elsif p_outcome = 'failed' or (p_outcome = 'retry' and v_row.attempts >= private.outbox_max_attempts()) then
    update public.notification_outbox o
    set status = 'failed', locked_until = null, last_error = v_error
    where o.id = p_id;
    return 'failed'::public.outbox_status;
  end if;

  v_wait := case
    when p_outcome = 'release' then pg_catalog.make_interval(secs => coalesce(p_retry_after_s, 0))
    else pg_catalog.make_interval(secs => greatest(
      coalesce(p_retry_after_s, 0), 30 * pg_catalog.power(2, greatest(v_row.attempts - 1, 0))))
  end;
  update public.notification_outbox o
  set status = 'pending',
      locked_until = null,
      last_error = v_error,
      attempts = case when p_outcome = 'release' then greatest(o.attempts - 1, 0) else o.attempts end,
      deliver_after = greatest(o.scheduled_for, v_now + v_wait)
  where o.id = p_id;
  return 'pending'::public.outbox_status;
end $$;

comment on function public.record_outbox_result(bigint, text, bigint, text, integer) is
  'Dispatcher only (service_role): stores the result of sending one claimed outbox row (sent, blocked, retry, '
  'release or failed) and schedules the retry.';
revoke all on function public.record_outbox_result(bigint, text, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.record_outbox_result(bigint, text, bigint, text, integer) to service_role;

-- Leases are checked every minute; this keeps that check off the whole table.
create index notification_outbox_locked_until_idx on public.notification_outbox (locked_until) where status = 'processing';

-- Called by pg_cron every minute. Does nothing when nothing is due (no wasted function call on Vercel) or when
-- the Vault secrets are missing (local databases, previews). Otherwise posts to the web route, which does the
-- work; pg_net sends the request after this transaction commits. Returns the pg_net request id, or null.
create function private.dispatch_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.notification_outbox o where o.status = 'pending' and o.deliver_after <= pg_catalog.now())
     and not exists (select 1 from public.notification_outbox o where o.status = 'processing' and o.locked_until < pg_catalog.now())
  then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000);
end $$;

comment on function private.dispatch_notifications() is
  'pg_cron job body: when outbox rows are due, calls the web dispatcher route with the URL and secret from Vault.';
revoke all on function private.dispatch_notifications() from public;

-- One-time setup per environment, run as postgres in the SQL editor (docs/adr/0006):
--   select private.configure_notification_dispatch('https://<web host>/api/cron/notifications', '<CRON_SECRET>');
-- The same secret goes to the web project's CRON_SECRET. Running it again replaces both values.
create function private.configure_notification_dispatch(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url is null or p_url !~ '^https://[^/?#]+/api/cron/notifications$' then
    raise exception 'invalid url' using errcode = '22023', detail = 'expected https://<host>/api/cron/notifications';
  end if;
  if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]+$' or char_length(p_secret) not between 32 and 256 then
    raise exception 'invalid secret' using errcode = '22023', detail = 'expected 32 to 256 characters [A-Za-z0-9_-]';
  end if;

  select s.id into v_id from vault.secrets s where s.name = 'notifications_dispatch_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'notifications_dispatch_url', 'Web route that sends due notifications');
  else
    perform vault.update_secret(v_id, p_url);
  end if;

  v_id := null;
  select s.id into v_id from vault.secrets s where s.name = 'notifications_cron_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'notifications_cron_secret', 'Bearer secret of the notification route (CRON_SECRET)');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

comment on function private.configure_notification_dispatch(text, text) is
  'Stores the dispatcher route URL and its bearer secret in Vault. Run once per environment as postgres.';
revoke all on function private.configure_notification_dispatch(text, text) from public;

-- Jobs. cron.schedule with a name replaces a job of the same name, so re-running this file is harmless.
select cron.schedule('notifications-dispatch', '* * * * *', 'select private.dispatch_notifications()');
-- Retention (data-model, decision 38): handled rows go after 90 days; failed rows stay for investigation.
select cron.schedule(
  'notifications-retention',
  '17 3 * * *',
  $$delete from public.notification_outbox where status in ('sent', 'skipped', 'cancelled') and created_at < now() - interval '90 days'$$);

-- Comments the earlier migrations got wrong or left open (data-model §2.1 profiles): the bot never touches the
-- database (ADR 0006), so nothing records /start, and only sign-in clears the blocked mark.
comment on column public.profiles.bot_started_at is
  'Not written in wave 1: the bot does not touch the database (ADR 0006). The dispatcher learns that it cannot '
  'write to a user from Telegram''s answer and sets bot_blocked_at.';
comment on column public.profiles.bot_blocked_at is
  'Telegram refused a message (403 or chat not found). The dispatcher skips the user''s messages while it is set; '
  'sign-in clears it, so the next message tries again.';
comment on column public.notification_outbox.last_error is
  'Last error code from Telegram or the dispatcher, or why the row was skipped (no_telegram, bot_blocked, '
  'disabled, ...). Never tokens or URLs with secrets.';

-- Session reminders and calendar feeds (PRD wave-1 §2.7, §2.9-2..5, §3 К7; data-model §2.1 "Уведомления,
-- напоминания, календарь"; ADR 0006, R75, Q62).
--
--   * Reminders live in the notification outbox. private.sync_booking_reminders keeps the pending
--     session_reminder rows of one booking in line with its status, the session time and the pair's offsets;
--     triggers on bookings, sessions and coachings call it, so the booking and schedule RPCs need not know.
--   * Calendar feeds: create_calendar_feed shows a token once and keeps only its sha256; calendar_feed serves
--     the ICS route (service_role only) and stamps last_accessed_at.

-- Reminders -------------------------------------------------------------------------------------------------

-- The pending reminders of a booking are exactly one per offset of its pair whose send time is still ahead,
-- while the booking is confirmed, its session is scheduled and the client can get messages (not a card, not
-- the deleted-client stub). Anything else pending for the booking is cancelled. Keys carry the offset and the
-- session start (R75), so a moved session gets new rows; a key that comes back (a session moved back, a
-- booking confirmed again) revives its cancelled row with the current payload. Sent rows are never touched.
-- The payload names the trainer and the place but never the meeting link (SCHED-21: the app shows it).
create function private.sync_booking_reminders(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  r record;
  v_keys text[] := '{}'::text[];
  v_key text;
  v_offset smallint;
  v_payload jsonb;
begin
  select b.id, b.status, b.client_id, b.coaching_id, b.session_id,
         s.starts_at, s.ends_at, s.status as session_status, s.kind, s.title, s.mode,
         l.name as location_name, l.address as location_address,
         c.client_reminder_offsets as offsets, p.telegram_id, p.managed_by_trainer_id,
         t.first_name as trainer_first_name, t.last_name as trainer_last_name
  into r
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.coachings c on c.id = b.coaching_id
  join public.profiles p on p.id = b.client_id
  join public.profiles t on t.id = b.trainer_id
  left join public.locations l on l.id = s.location_id
  where b.id = p_booking_id;

  if r.id is not null and r.status = 'confirmed' and r.session_status = 'scheduled' and r.starts_at > v_now
     and r.telegram_id is not null and r.managed_by_trainer_id is null then
    v_payload := pg_catalog.jsonb_build_object(
      'booking_id', r.id, 'session_id', r.session_id, 'coaching_id', r.coaching_id,
      'starts_at', r.starts_at, 'ends_at', r.ends_at, 'kind', r.kind, 'title', r.title, 'mode', r.mode,
      'location_name', r.location_name, 'location_address', r.location_address,
      'first_name', r.trainer_first_name, 'last_name', r.trainer_last_name);
    foreach v_offset in array r.offsets loop
      continue when r.starts_at - pg_catalog.make_interval(mins => v_offset) <= v_now;
      v_key := pg_catalog.format('reminder:%s:%s:%s', r.id, v_offset, pg_catalog.floor(extract(epoch from r.starts_at)));
      v_keys := v_keys || v_key;
      -- Reminders ignore quiet hours (they go out silently), so deliver_after is the send time itself.
      insert into public.notification_outbox
        (user_id, type, dedupe_key, payload, booking_id, session_id, scheduled_for, deliver_after)
      values (
        r.client_id, 'session_reminder', v_key, v_payload || pg_catalog.jsonb_build_object('offset_min', v_offset),
        r.id, r.session_id, r.starts_at - pg_catalog.make_interval(mins => v_offset),
        r.starts_at - pg_catalog.make_interval(mins => v_offset))
      on conflict (dedupe_key) do update
        set payload = excluded.payload, status = 'pending', last_error = null, locked_until = null,
            attempts = 0, deliver_after = excluded.deliver_after
        where public.notification_outbox.status in ('pending', 'cancelled');
    end loop;
  end if;

  update public.notification_outbox o
  set status = 'cancelled', last_error = 'reminder_outdated'
  where o.booking_id = p_booking_id and o.type = 'session_reminder' and o.status = 'pending'
    and not (o.dedupe_key = any (v_keys));
end $$;

comment on function private.sync_booking_reminders(uuid) is
  'Keeps the pending session reminders (К7) of one booking in line with its status, session time and the '
  'pair''s client_reminder_offsets: queues the missing ones, cancels the rest (PRD 2.9-4, 2.9-5, NOTIF-3, 4).';
revoke all on function private.sync_booking_reminders(uuid) from public;

-- A booking created, confirmed, cancelled, moved to another session or merged into another person.
create function private.bookings_sync_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_booking_reminders(new.id);
  return null;
end $$;

comment on function private.bookings_sync_reminders() is 'Trigger: re-plans the reminders of a changed booking.';
revoke all on function private.bookings_sync_reminders() from public;

create trigger bookings_sync_reminders
  after insert or update of status, session_id, client_id, coaching_id on public.bookings
  for each row execute function private.bookings_sync_reminders();

-- A session moved, cancelled or given another place: every live booking of it is re-planned.
create function private.sessions_sync_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
begin
  for v_booking in
    select b.id from public.bookings b where b.session_id = new.id and b.status = 'confirmed'
    union
    select o.booking_id from public.notification_outbox o
    where o.session_id = new.id and o.type = 'session_reminder' and o.status = 'pending'
  loop
    perform private.sync_booking_reminders(v_booking);
  end loop;
  return null;
end $$;

comment on function private.sessions_sync_reminders() is 'Trigger: re-plans the reminders of every booking of a changed session.';
revoke all on function private.sessions_sync_reminders() from public;

create trigger sessions_sync_reminders
  after update of starts_at, ends_at, status, location_id, mode, title on public.sessions
  for each row
  when (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at
        or old.status is distinct from new.status or old.location_id is distinct from new.location_id
        or old.mode is distinct from new.mode or old.title is distinct from new.title)
  execute function private.sessions_sync_reminders();

-- The client changed their reminders for this pair: future confirmed bookings get the new set (PRD 2.9-3).
create function private.coachings_sync_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
begin
  for v_booking in
    select b.id from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.coaching_id = new.id and b.status = 'confirmed' and s.starts_at > pg_catalog.now()
  loop
    perform private.sync_booking_reminders(v_booking);
  end loop;
  return null;
end $$;

comment on function private.coachings_sync_reminders() is 'Trigger: re-plans future reminders after the pair''s offsets change.';
revoke all on function private.coachings_sync_reminders() from public;

create trigger coachings_sync_reminders
  after update of client_reminder_offsets on public.coachings
  for each row
  when (old.client_reminder_offsets is distinct from new.client_reminder_offsets)
  execute function private.coachings_sync_reminders();

-- Calendar feeds ----------------------------------------------------------------------------------------------

-- A new feed for the caller's zone: the previous active one is revoked at once (CAL-3) and the token is
-- returned this one time; only its sha256 is stored (Q62, CAL-6). The trainer feed needs a trainer profile.
create function public.create_calendar_feed(p_zone public.app_zone)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token text := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_zone is null then
    raise exception 'zone_invalid' using errcode = 'P0001';
  end if;
  if p_zone = 'trainer' and not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
    raise exception 'not_a_trainer' using errcode = 'P0001';
  end if;
  update public.calendar_feeds f set revoked_at = pg_catalog.now()
  where f.user_id = v_user and f.zone = p_zone and f.revoked_at is null;
  insert into public.calendar_feeds (user_id, zone, token_hash)
  values (v_user, p_zone, extensions.digest(v_token, 'sha256'));
  return v_token;
end $$;

comment on function public.create_calendar_feed(public.app_zone) is
  'Issues the caller''s calendar feed for a zone, revoking the previous one, and returns its token once '
  '(PRD 2.7-1, 2.7-5, Q62). Raises not_a_trainer for the trainer zone without a trainer profile.';
revoke all on function public.create_calendar_feed(public.app_zone) from public, anon;
grant execute on function public.create_calendar_feed(public.app_zone) to authenticated;

-- "Отключить": the active feed of the zone stops serving data.
create function public.revoke_calendar_feed(p_zone public.app_zone)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.calendar_feeds f set revoked_at = pg_catalog.now()
  where f.user_id = v_user and f.zone = p_zone and f.revoked_at is null;
  return found;
end $$;

comment on function public.revoke_calendar_feed(public.app_zone) is
  'Turns off the caller''s active calendar feed of a zone. Returns false when there was none.';
revoke all on function public.revoke_calendar_feed(public.app_zone) from public, anon;
grant execute on function public.revoke_calendar_feed(public.app_zone) to authenticated;

-- What the ICS route needs for one token, or null for an unknown or revoked one (CAL-3). Events from the last
-- 30 days and all future ones (PRD 2.7-4); cancelled ones only while they started at most 7 days ago (2.7-3).
--   * trainer: every session of the trainer; a personal or trial one is named after its client (the trainer's
--     alias first), a group one after its title;
--   * client: the user's bookings that are or were confirmed, with every trainer (CAL-5); requests are left out.
-- No intake, measurements, notes or money (CAL-4). The online link goes to the trainer always and to the client
-- only with a confirmed booking (SCHED-21). Service role only: the route has no user session.
create function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_feed public.calendar_feeds;
  v_settings public.user_settings;
  v_from timestamptz := pg_catalog.now() - interval '30 days';
  v_cancelled_from timestamptz := pg_catalog.now() - interval '7 days';
  v_events jsonb;
begin
  if p_token is null or pg_catalog.char_length(p_token) not between 20 and 100 then
    return null;
  end if;
  select f.* into v_feed from public.calendar_feeds f
  where f.token_hash = extensions.digest(p_token, 'sha256') and f.revoked_at is null;
  if v_feed.id is null then
    return null;
  end if;
  update public.calendar_feeds f set last_accessed_at = pg_catalog.now() where f.id = v_feed.id;
  select s.* into v_settings from public.user_settings s where s.user_id = v_feed.user_id;

  if v_feed.zone = 'trainer' then
    select coalesce(pg_catalog.jsonb_agg(e order by e ->> 'starts_at'), '[]'::jsonb) into v_events
    from (
      select pg_catalog.jsonb_build_object(
        'uid', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'updated_at', s.updated_at,
        'cancelled', s.status = 'cancelled', 'kind', s.kind, 'title', s.title, 'mode', s.mode,
        'location_name', l.name, 'location_address', l.address, 'meeting_url', s.meeting_url,
        'partner', (
          select coalesce(nullif(pg_catalog.btrim(m.client_alias), ''),
                          pg_catalog.btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
          from public.bookings b
          join public.profiles p on p.id = b.client_id
          left join public.coaching_trainer_meta m on m.coaching_id = b.coaching_id
          where b.session_id = s.id and s.kind <> 'group'
            and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
          order by b.created_at
          limit 1),
        'booked', (select pg_catalog.count(*) from public.bookings b
                   where b.session_id = s.id and b.status in ('confirmed', 'attended', 'no_show'))) as e
      from public.sessions s
      left join public.locations l on l.id = s.location_id
      where s.trainer_id = v_feed.user_id and s.ends_at >= v_from
        and (s.status <> 'cancelled' or s.starts_at >= v_cancelled_from)
    ) x;
  else
    select coalesce(pg_catalog.jsonb_agg(e order by e ->> 'starts_at'), '[]'::jsonb) into v_events
    from (
      select pg_catalog.jsonb_build_object(
        'uid', b.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'updated_at', greatest(s.updated_at, b.updated_at),
        'cancelled', s.status = 'cancelled' or b.status in ('cancelled', 'late_cancelled'),
        'kind', s.kind, 'title', s.title, 'mode', s.mode,
        'location_name', l.name, 'location_address', l.address,
        'meeting_url', case when b.status = 'confirmed' and s.status = 'scheduled' then s.meeting_url end,
        'partner', pg_catalog.btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''))) as e
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      join public.profiles t on t.id = b.trainer_id
      left join public.locations l on l.id = s.location_id
      where b.client_id = v_feed.user_id and s.ends_at >= v_from
        and b.confirmed_at is not null
        and b.status in ('confirmed', 'attended', 'no_show', 'cancelled', 'late_cancelled')
        and ((s.status <> 'cancelled' and b.status not in ('cancelled', 'late_cancelled'))
             or s.starts_at >= v_cancelled_from)
    ) x;
  end if;

  return pg_catalog.jsonb_build_object(
    'zone', v_feed.zone,
    'locale', coalesce(v_settings.locale, 'ru'),
    'time_zone', coalesce(v_settings.time_zone, 'Europe/Moscow'),
    'events', v_events);
end $$;

comment on function public.calendar_feed(text) is
  'ICS route only (service_role): the events of the feed with this token, or null for an unknown or revoked '
  'token. Stamps last_accessed_at. No intake, measurements, notes or money (PRD 2.7, CAL-1..5).';
revoke all on function public.calendar_feed(text) from public, anon, authenticated;
grant execute on function public.calendar_feed(text) to service_role;

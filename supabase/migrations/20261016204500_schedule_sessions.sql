-- Trainer schedule, part 2: sessions the trainer assigns to a client and weekly repeats (PRD wave-1 §2.6.2,
-- §2.6.5-5, §2.6.7). Group sessions, client bookings, attendance and the ledger come with their own items.
--
--   * create_session: one personal session for a live pair, or a weekly repeat of it. The booking is confirmed
--     at once (Q20) and the client gets one booking_assigned message for the whole repeat (PRD 2.6.2-5).
--   * session_conflicts: the trainer's sessions overlapping a time, for the "Пересекается с …" warning
--     (2.6.2-6); overlaps are allowed.
--   * update_session / cancel_session: "Только это" or "Это и следующие" for an occurrence of a repeat;
--     a cancellation by the trainer always has a reason and never charges (2.6.5).
--   * Repeats are kept in the trainer's local time and zone and are materialised six months ahead; a daily
--     pg_cron job rolls the horizon (recurrences-roll).
--   * A session takes the time from free slots: open slots under it are removed.

-- The trainer's zone for schedule rules (user_settings, Europe/Moscow by default).
create function private.trainer_zone(p_trainer uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.time_zone from public.user_settings s where s.user_id = p_trainer), 'Europe/Moscow')
$$;

revoke all on function private.trainer_zone(uuid) from public;

-- The trainer's name for the client's notifications, as end_coaching puts it in a payload.
create function private.trainer_name(p_trainer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select pg_catalog.jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name)
                   from public.profiles p where p.id = p_trainer), '{}'::jsonb)
$$;

revoke all on function private.trainer_name(uuid) from public;

-- "MO,WE" in an RRULE as ISO weekdays {1,3}.
create function private.rrule_weekdays(p_rrule text)
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(w.n order by w.n), '{}')
  from (
    select pg_catalog.array_position(array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], d)::smallint as n
    from pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.substring(p_rrule, 'BYDAY=([A-Z,]+)'), ',')) as d
  ) w
$$;

revoke all on function private.rrule_weekdays(text) from public;

-- Free slots under a session go: the time is taken (PRD 2.6.1-3).
create function private.clear_open_slots(p_trainer uuid, p_start timestamptz, p_end timestamptz)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.slots s
  where s.trainer_id = p_trainer and s.status = 'open' and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_start, p_end)
    and not exists (select 1 from public.sessions x where x.slot_id = s.id and x.status <> 'cancelled');
$$;

revoke all on function private.clear_open_slots(uuid, timestamptz, timestamptz) from public;

-- Format and place of a session: in person at one of the trainer's places (or none), online with an https link
-- (or none yet). Raises invalid_location or invalid_link.
create function private.check_session_place(p_trainer uuid, p_mode public.session_mode, p_location_id uuid, p_meeting_url text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_mode = 'offline' then
    if p_meeting_url is not null then
      raise exception 'invalid_link' using errcode = '22023', detail = 'an in-person session has no link';
    end if;
    if p_location_id is not null and not exists (
      select 1 from public.locations l where l.id = p_location_id and l.trainer_id = p_trainer and l.archived_at is null
    ) then
      raise exception 'invalid_location' using errcode = '22023';
    end if;
  else
    if p_location_id is not null then
      raise exception 'invalid_location' using errcode = '22023', detail = 'an online session has no place';
    end if;
    if p_meeting_url is not null and p_meeting_url !~ '^https://\S+$' then
      raise exception 'invalid_link' using errcode = '22023';
    end if;
  end if;
end $$;

revoke all on function private.check_session_place(uuid, public.session_mode, uuid, text) from public;

-- One personal session with its confirmed booking (Q20) and a booking_events row. Returns the session id.
create function private.insert_personal_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode public.session_mode,
  p_location_id uuid,
  p_meeting_url text,
  p_title text,
  p_recurrence_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_session_id uuid;
  v_booking_id uuid;
begin
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  insert into public.sessions
    (trainer_id, kind, title, starts_at, ends_at, location_id, mode, meeting_url, capacity, recurrence_id,
     original_starts_at, created_by)
  values
    (v_pair.trainer_id, 'personal', p_title, p_starts_at, p_ends_at, p_location_id, p_mode, p_meeting_url, 1,
     p_recurrence_id, case when p_recurrence_id is null then null else p_starts_at end, p_actor)
  returning id into v_session_id;

  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, confirmed_at, decided_by)
  values (v_session_id, v_pair.id, v_pair.client_id, v_pair.trainer_id, 'confirmed',
          case when p_recurrence_id is null then 'trainer' else 'recurrence' end::public.booking_source,
          pg_catalog.now(), p_actor)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, 'confirmed', p_actor,
          case when p_actor = v_pair.trainer_id then 'trainer' else 'system' end::public.actor_role, '{}');

  perform private.clear_open_slots(v_pair.trainer_id, p_starts_at, p_ends_at);
  return v_session_id;
end $$;

revoke all on function private.insert_personal_session(uuid, timestamptz, timestamptz, public.session_mode, uuid, text, text, uuid, uuid)
  from public;

-- Creates the occurrences of a weekly repeat up to its end, its count or six months from today in the
-- trainer's zone (PRD 2.6.2-4), skipping times already past. Local times go through local_to_utc (2.6.7-2, -3).
-- Returns the number of sessions created.
create function private.materialize_recurrence(p_recurrence_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rule public.recurrences;
  v_weekdays smallint[];
  v_day date;
  v_last date;
  v_made integer;
  v_created integer := 0;
  v_start timestamptz;
begin
  select r.* into v_rule from public.recurrences r where r.id = p_recurrence_id for update;
  if v_rule.id is null or v_rule.ended_at is not null or v_rule.coaching_id is null
     or not private.is_live_coaching(v_rule.coaching_id) then
    return 0;
  end if;
  v_weekdays := private.rrule_weekdays(v_rule.rrule);
  v_last := (pg_catalog.now() at time zone v_rule.time_zone)::date + 183;
  if v_rule.until_date is not null and v_rule.until_date < v_last then
    v_last := v_rule.until_date;
  end if;
  v_day := greatest(coalesce(v_rule.materialized_until + 1, v_rule.dtstart_local::date), v_rule.dtstart_local::date);
  select pg_catalog.count(*)::integer into v_made from public.sessions s where s.recurrence_id = v_rule.id;

  while v_day <= v_last loop
    exit when v_rule.occurrence_count is not null and v_made >= v_rule.occurrence_count;
    if extract(isodow from v_day)::smallint = any (v_weekdays) then
      v_start := private.local_to_utc(v_day + v_rule.dtstart_local::time, v_rule.time_zone);
      if v_start > pg_catalog.now() and not exists (
        select 1 from public.sessions s where s.recurrence_id = v_rule.id and s.original_starts_at = v_start
      ) then
        perform private.insert_personal_session(
          v_rule.coaching_id, v_start, v_start + pg_catalog.make_interval(mins => v_rule.duration_min), v_rule.mode,
          v_rule.location_id, v_rule.meeting_url, v_rule.title, v_rule.id, v_rule.created_by);
        v_created := v_created + 1;
      end if;
      v_made := v_made + 1;
    end if;
    v_day := v_day + 1;
  end loop;

  update public.recurrences r set materialized_until = v_day - 1 where r.id = v_rule.id;
  return v_created;
end $$;

comment on function private.materialize_recurrence(uuid) is
  'Creates the sessions of a weekly personal repeat up to its end date, its count or six months ahead.';
revoke all on function private.materialize_recurrence(uuid) from public;

-- Daily: every live repeat reaches six months ahead again.
create function private.roll_recurrences()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_total integer := 0;
begin
  for v_id in select r.id from public.recurrences r where r.ended_at is null and r.coaching_id is not null loop
    v_total := v_total + private.materialize_recurrence(v_id);
  end loop;
  return v_total;
end $$;

revoke all on function private.roll_recurrences() from public;
select cron.schedule('recurrences-roll', '20 0 * * *', 'select private.roll_recurrences()');

-- The trainer assigns a personal session to a client of a live pair, once or weekly on p_weekdays (ISO 1–7,
-- the first session's weekday included) until p_until (local date, inclusive) or p_count times. Returns the
-- first session and how many were created. Raises not_a_trainer, not_your_client, in_past, invalid_duration,
-- invalid_location, invalid_link or invalid_repeat.
create function public.create_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_meeting_url text default null,
  p_title text default null,
  p_weekdays smallint[] default null,
  p_until date default null,
  p_count smallint default null
)
returns table (session_id uuid, created integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
  v_pair public.coachings;
  v_zone text;
  v_local timestamp;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_url text := nullif(pg_catalog.btrim(p_meeting_url), '');
  v_recurrence_id uuid;
  v_first uuid;
  v_created integer := 1;
  v_location text;
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.trainer_id <> v_trainer or v_pair.status not in ('trial', 'active') then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  if p_starts_at is null or p_starts_at <= pg_catalog.now() then
    raise exception 'in_past' using errcode = '22023';
  end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  perform private.check_session_place(v_trainer, p_mode, p_location_id, v_url);

  v_zone := private.trainer_zone(v_trainer);
  v_local := p_starts_at at time zone v_zone;

  if p_weekdays is null then
    v_first := private.insert_personal_session(
      v_pair.id, p_starts_at, p_starts_at + pg_catalog.make_interval(mins => p_duration_min), p_mode, p_location_id, v_url,
      v_title, null, v_trainer);
  else
    if pg_catalog.cardinality(p_weekdays) = 0
       or exists (select 1 from pg_catalog.unnest(p_weekdays) d where d not between 1 and 7)
       or not (extract(isodow from v_local)::smallint = any (p_weekdays))
       or (p_until is null) = (p_count is null)
       or p_until < v_local::date or p_until > v_local::date + 366
       or p_count not between 2 and 200 then
      raise exception 'invalid_repeat' using errcode = '22023';
    end if;
    insert into public.recurrences
      (trainer_id, coaching_id, rrule, dtstart_local, time_zone, until_date, occurrence_count, duration_min, kind, title,
       capacity, location_id, mode, meeting_url, created_by)
    values
      (v_trainer, v_pair.id,
       'FREQ=WEEKLY;BYDAY=' || (
         select pg_catalog.string_agg((array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[d], ',' order by d)
         from (select distinct pg_catalog.unnest(p_weekdays) as d) w),
       v_local, v_zone, p_until, p_count, p_duration_min, 'personal', v_title, 1, p_location_id, p_mode, v_url, v_trainer)
    returning id into v_recurrence_id;
    v_created := private.materialize_recurrence(v_recurrence_id);
    select s.id into v_first from public.sessions s where s.recurrence_id = v_recurrence_id order by s.starts_at limit 1;
  end if;

  select l.name into v_location from public.locations l where l.id = p_location_id;
  -- К1, one message for the whole repeat (PRD 2.6.2-5).
  perform private.enqueue_notification(
    'booking_assigned',
    'booking_assigned:' || v_first,
    pg_catalog.jsonb_build_object(
      'session_id', v_first, 'starts_at', p_starts_at, 'mode', p_mode, 'location', v_location,
      'count', coalesce(p_count, v_created), 'until', p_until) || private.trainer_name(v_trainer),
    v_pair.client_id,
    p_session_id => v_first);

  return query select v_first, v_created;
end $$;

comment on function public.create_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, smallint[], date, smallint) is
  'Trainer: a personal session for a live pair, once or as a weekly repeat; bookings are confirmed at once and the '
  'client gets one booking_assigned. Returns the first session and the number created.';
revoke all on function public.create_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, smallint[], date, smallint)
  from public, anon;
grant execute on function public.create_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, smallint[], date, smallint)
  to authenticated;

-- The trainer's live sessions overlapping a time, for the overlap warning (PRD 2.6.2-6). coaching_id is the
-- pair of a personal session's live booking, so the screen can name the client.
create function public.session_conflicts(p_starts_at timestamptz, p_ends_at timestamptz, p_ignore uuid default null)
returns table (session_id uuid, starts_at timestamptz, ends_at timestamptz, kind public.session_kind, title text, coaching_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at, s.kind, s.title,
         (select b.coaching_id from public.bookings b
          where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show')
          order by b.created_at limit 1)
  from public.sessions s
  where s.trainer_id = auth.uid() and s.status <> 'cancelled'
    and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_starts_at, p_ends_at)
    and s.id is distinct from p_ignore
  order by s.starts_at
  limit 10
$$;

revoke all on function public.session_conflicts(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.session_conflicts(timestamptz, timestamptz, uuid) to authenticated;

-- The scheduled future sessions an edit or cancellation covers: the session itself, or with p_following the
-- session and the later ones of its repeat.
create function private.session_scope(p_session public.sessions, p_following boolean)
returns setof public.sessions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.sessions s
  where s.id = p_session.id
     or (p_following and p_session.recurrence_id is not null and s.recurrence_id = p_session.recurrence_id
         and s.status = 'scheduled' and s.starts_at > pg_catalog.now()
         and coalesce(s.original_starts_at, s.starts_at) > coalesce(p_session.original_starts_at, p_session.starts_at))
  order by s.starts_at
$$;

revoke all on function private.session_scope(public.sessions, boolean) from public;

-- A scheduled future session of the caller, locked; raises session_not_found or not_editable.
create function private.own_future_session(p_session_id uuid)
returns public.sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id and s.trainer_id = auth.uid() for update;
  if v_session.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now() then
    raise exception 'not_editable' using errcode = 'P0001';
  end if;
  return v_session;
end $$;

revoke all on function private.own_future_session(uuid) from public;

-- The trainer moves or changes a session (PRD 2.6.5-5): with p_following, the same local time, length, format
-- and place go to the later occurrences of its repeat and to the repeat itself, each on its own day. The
-- bookings stay confirmed and every client gets one session_changed. Returns the number of sessions changed.
-- Raises session_not_found, not_editable, in_past, invalid_duration, invalid_location, invalid_link or
-- following_keeps_date (a repeat moves within its day; another day is a new repeat).
create function public.update_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_meeting_url text default null,
  p_title text default null,
  p_following boolean default false
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_zone text;
  v_time time;
  v_url text := nullif(pg_catalog.btrim(p_meeting_url), '');
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_target public.sessions;
  v_start timestamptz;
  v_changed integer := 0;
  v_client record;
  v_ids uuid[] := '{}'::uuid[];
begin
  v_session := private.own_future_session(p_session_id);
  if p_starts_at is null or p_starts_at <= pg_catalog.now() then
    raise exception 'in_past' using errcode = '22023';
  end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  perform private.check_session_place(v_session.trainer_id, p_mode, p_location_id, v_url);
  v_zone := private.trainer_zone(v_session.trainer_id);
  p_following := coalesce(p_following, false) and v_session.recurrence_id is not null;
  if p_following and (p_starts_at at time zone v_zone)::date <> (v_session.starts_at at time zone v_zone)::date then
    raise exception 'following_keeps_date' using errcode = '22023';
  end if;
  v_time := (p_starts_at at time zone v_zone)::time;

  for v_target in select * from private.session_scope(v_session, p_following) loop
    v_start := case
      when v_target.id = v_session.id then p_starts_at
      else private.local_to_utc((v_target.starts_at at time zone v_zone)::date + v_time, v_zone)
    end;
    v_ids := v_ids || v_target.id;
    -- A slot the session was booked on is left behind: the template may offer that time again.
    if v_target.slot_id is not null and v_start <> v_target.starts_at then
      update public.sessions s set slot_id = null where s.id = v_target.id;
      delete from public.slots sl where sl.id = v_target.slot_id;
    end if;
    update public.sessions s
    set starts_at = v_start,
        ends_at = v_start + pg_catalog.make_interval(mins => p_duration_min),
        mode = p_mode, location_id = p_location_id, meeting_url = v_url, title = v_title,
        is_exception = s.recurrence_id is not null and not p_following,
        manually_adjusted_at = pg_catalog.now()
    where s.id = v_target.id;
    perform private.clear_open_slots(v_target.trainer_id, v_start, v_start + pg_catalog.make_interval(mins => p_duration_min));
    v_changed := v_changed + 1;
  end loop;

  if p_following then
    update public.recurrences r
    set dtstart_local = r.dtstart_local::date + v_time, duration_min = p_duration_min, mode = p_mode,
        location_id = p_location_id, meeting_url = v_url, title = v_title
    where r.id = v_session.recurrence_id;
  end if;

  -- К6 "было → стало", one message per client for the whole change.
  for v_client in
    select b.client_id, pg_catalog.count(*)::integer as sessions
    from public.bookings b
    where b.session_id = any (v_ids) and b.status in ('requested', 'confirmed')
    group by b.client_id
  loop
    perform private.enqueue_notification(
      'session_changed',
      pg_catalog.format('session_changed:%s:%s:%s', v_session.id, v_client.client_id,
                        pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000)),
      pg_catalog.jsonb_build_object(
        'session_id', v_session.id, 'before_starts_at', v_session.starts_at, 'starts_at', p_starts_at,
        'mode', p_mode, 'location', (select l.name from public.locations l where l.id = p_location_id),
        'count', v_client.sessions) || private.trainer_name(v_session.trainer_id),
      v_client.client_id,
      p_session_id => v_session.id);
  end loop;
  return v_changed;
end $$;

comment on function public.update_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, boolean) is
  'Trainer: moves or changes a scheduled future session, or with p_following it and the later occurrences of its '
  'repeat; clients get one session_changed. Returns the number of sessions changed.';
revoke all on function public.update_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.update_session(uuid, timestamptz, smallint, public.session_mode, uuid, text, text, boolean)
  to authenticated;

-- The trainer cancels a session, or with p_following it and the rest of its repeat, which then stops
-- (PRD 2.6.2-5, 2.6.5). Bookings become cancelled by the trainer, never charged; the reason is required (2.6.5-4).
-- Each client gets one booking_cancelled_by_trainer with the dates. Returns the number of sessions cancelled.
-- Raises session_not_found, not_editable or reason_required.
create function public.cancel_session(p_session_id uuid, p_reason text, p_following boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_client record;
begin
  v_session := private.own_future_session(p_session_id);
  if v_reason is null or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  p_following := coalesce(p_following, false) and v_session.recurrence_id is not null;
  select pg_catalog.array_agg(x.id) into v_ids from private.session_scope(v_session, p_following) x;

  -- К5 first, while the bookings are still live: one message per client listing the cancelled dates.
  for v_client in
    select b.client_id, pg_catalog.jsonb_agg(s.starts_at order by s.starts_at) as dates
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.session_id = any (v_ids) and b.status in ('requested', 'confirmed')
    group by b.client_id
  loop
    perform private.enqueue_notification(
      'booking_cancelled_by_trainer',
      pg_catalog.format('booking_cancelled_by_trainer:%s:%s', v_session.id, v_client.client_id),
      pg_catalog.jsonb_build_object('session_id', v_session.id, 'dates', v_client.dates, 'reason', v_reason)
        || private.trainer_name(v_session.trainer_id),
      v_client.client_id,
      p_session_id => v_session.id);
  end loop;

  with live as (
    select b.id, b.status from public.bookings b
    where b.session_id = any (v_ids) and b.status in ('requested', 'confirmed')
    for update of b
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'trainer',
        cancel_reason = v_reason
    from live l
    where b.id = l.id
    returning b.id, l.status as from_status
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  select x.id, x.from_status, 'cancelled', v_user, 'trainer', v_reason, '{}' from cancelled x;

  -- A slot the session was booked on goes with it; the template may offer that time again.
  with freed as (
    update public.sessions s
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = v_reason,
        slot_id = null
    from public.sessions old
    where s.id = any (v_ids) and old.id = s.id
    returning old.slot_id
  )
  delete from public.slots sl using freed f where sl.id = f.slot_id;

  if p_following then
    update public.recurrences r set ended_at = pg_catalog.now() where r.id = v_session.recurrence_id;
  end if;
  return pg_catalog.cardinality(v_ids);
end $$;

comment on function public.cancel_session(uuid, text, boolean) is
  'Trainer: cancels a scheduled future session, or with p_following the rest of its repeat, which stops; bookings '
  'are cancelled by the trainer without a charge and each client gets one message. Returns the number cancelled.';
revoke all on function public.cancel_session(uuid, text, boolean) from public, anon;
grant execute on function public.cancel_session(uuid, text, boolean) to authenticated;

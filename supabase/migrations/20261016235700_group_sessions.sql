-- Group sessions (PRD wave-1 §2.6.3, §2.6.4-1; SCHED-15, SCHED-16; screens.md /trainer/sessions/new,
-- /client/book). A group session has a title and a number of seats; requests and confirmed bookings hold a
-- seat each, and the capacity triggers of 20261015120600_bookings_ledger_tables.sql refuse an extra one
-- (session_full) or a capacity below the seats taken (capacity_below_occupied).
--   * create_group_session: once or as a weekly repeat; open_for_booking lets the trainer's clients book it.
--   * add_group_participant: the trainer puts a client on it, confirmed at once (Q20), К1 to the client.
--   * bookable_group_sessions / group_booking_preview / book_group_session: the client side, with the same
--     auto-confirm rule as a slot (private.booking_auto_confirm, kind group).
--   * A declined, withdrawn or expired request on a group session frees its seat and keeps the session.
-- Cancelling or moving a group session uses cancel_session and update_session, which already tell every
-- participant once.

-- A group session is named by its title (PRD 2.6.3): a change that clears it keeps the old one, so moving a
-- group with update_session without a title does not leave it nameless.
create function private.sessions_keep_group_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'group' and new.title is null then
    new.title := old.title;
  end if;
  return new;
end $$;

revoke all on function private.sessions_keep_group_title() from public;

create trigger sessions_keep_group_title
  before update of title on public.sessions
  for each row execute function private.sessions_keep_group_title();

-- One group session without participants; open slots under it go (PRD 2.6.1-3). Returns the session id.
create function private.insert_group_session(
  p_trainer uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode public.session_mode,
  p_location_id uuid,
  p_meeting_url text,
  p_title text,
  p_capacity smallint,
  p_open boolean,
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
  v_session_id uuid;
begin
  insert into public.sessions
    (trainer_id, kind, title, starts_at, ends_at, location_id, mode, meeting_url, capacity, open_for_booking,
     recurrence_id, original_starts_at, created_by)
  values
    (p_trainer, 'group', p_title, p_starts_at, p_ends_at, p_location_id, p_mode, p_meeting_url, p_capacity, p_open,
     p_recurrence_id, case when p_recurrence_id is null then null else p_starts_at end, p_actor)
  returning id into v_session_id;
  perform private.clear_open_slots(p_trainer, p_starts_at, p_ends_at);
  return v_session_id;
end $$;

revoke all on function private.insert_group_session(uuid, timestamptz, timestamptz, public.session_mode, uuid, text, text, smallint, boolean, uuid, uuid)
  from public;

-- Repeats now come in both kinds: a personal one books its client on every occurrence, a group one makes
-- empty sessions with its seats and self-booking. Otherwise unchanged (20261016204500_schedule_sessions.sql).
create or replace function private.materialize_recurrence(p_recurrence_id uuid)
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
  if v_rule.id is null or v_rule.ended_at is not null then
    return 0;
  end if;
  if v_rule.kind = 'personal' and (v_rule.coaching_id is null or not private.is_live_coaching(v_rule.coaching_id)) then
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
        if v_rule.kind = 'group' then
          perform private.insert_group_session(
            v_rule.trainer_id, v_start, v_start + pg_catalog.make_interval(mins => v_rule.duration_min), v_rule.mode,
            v_rule.location_id, v_rule.meeting_url, v_rule.title, v_rule.capacity, v_rule.open_for_booking, v_rule.id,
            v_rule.created_by);
        else
          perform private.insert_personal_session(
            v_rule.coaching_id, v_start, v_start + pg_catalog.make_interval(mins => v_rule.duration_min), v_rule.mode,
            v_rule.location_id, v_rule.meeting_url, v_rule.title, v_rule.id, v_rule.created_by);
        end if;
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
  'Creates the sessions of a weekly repeat (personal with its booking, or group) up to its end, its count or six '
  'months ahead.';

create or replace function private.roll_recurrences()
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
  for v_id in
    select r.id from public.recurrences r
    where r.ended_at is null and (r.coaching_id is not null or r.kind = 'group')
  loop
    v_total := v_total + private.materialize_recurrence(v_id);
  end loop;
  return v_total;
end $$;

-- The trainer creates a group session (PRD 2.6.3), once or weekly on p_weekdays until p_until or p_count
-- times, like create_session. It starts empty; with p_open_for_booking the trainer's clients see it and book
-- seats. Returns the first session and how many were created. Raises not_a_trainer, in_past,
-- invalid_duration, invalid_title (a group needs a title), invalid_capacity, invalid_location, invalid_link
-- or invalid_repeat.
create function public.create_group_session(
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_capacity smallint,
  p_title text,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_meeting_url text default null,
  p_open_for_booking boolean default true,
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
  v_zone text;
  v_local timestamp;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_url text := nullif(pg_catalog.btrim(p_meeting_url), '');
  v_open boolean := coalesce(p_open_for_booking, true);
  v_recurrence_id uuid;
  v_first uuid;
  v_created integer := 1;
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  if p_starts_at is null or p_starts_at <= pg_catalog.now() then
    raise exception 'in_past' using errcode = '22023';
  end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if p_capacity is null or p_capacity not between 2 and 100 then
    raise exception 'invalid_capacity' using errcode = '22023';
  end if;
  perform private.check_session_place(v_trainer, p_mode, p_location_id, v_url);

  v_zone := private.trainer_zone(v_trainer);
  v_local := p_starts_at at time zone v_zone;

  if p_weekdays is null then
    v_first := private.insert_group_session(
      v_trainer, p_starts_at, p_starts_at + pg_catalog.make_interval(mins => p_duration_min), p_mode, p_location_id,
      v_url, v_title, p_capacity, v_open, null, v_trainer);
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
      (trainer_id, rrule, dtstart_local, time_zone, until_date, occurrence_count, duration_min, kind, title,
       capacity, location_id, mode, meeting_url, open_for_booking, created_by)
    values
      (v_trainer,
       'FREQ=WEEKLY;BYDAY=' || (
         select pg_catalog.string_agg((array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[d], ',' order by d)
         from (select distinct pg_catalog.unnest(p_weekdays) as d) w),
       v_local, v_zone, p_until, p_count, p_duration_min, 'group', v_title, p_capacity, p_location_id, p_mode, v_url,
       v_open, v_trainer)
    returning id into v_recurrence_id;
    v_created := private.materialize_recurrence(v_recurrence_id);
    select s.id into v_first from public.sessions s where s.recurrence_id = v_recurrence_id order by s.starts_at limit 1;
  end if;

  return query select v_first, v_created;
end $$;

comment on function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid, text, boolean, smallint[], date, smallint) is
  'Trainer: a group session with a title and seats, once or as a weekly repeat; with open_for_booking the '
  'trainer''s clients book it themselves. Returns the first session and the number created.';
revoke all on function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid, text, boolean, smallint[], date, smallint)
  from public, anon;
grant execute on function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid, text, boolean, smallint[], date, smallint)
  to authenticated;

-- The trainer puts a client of a live pair on a future group session: the booking is confirmed at once (Q20)
-- and the client gets К1. Returns the booking. Raises session_not_found, not_your_client, already_booked or
-- session_full.
create function public.add_group_participant(p_session_id uuid, p_coaching_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.sessions;
  v_pair public.coachings;
  v_booking_id uuid;
  v_location text;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id;
  if v_session.id is null or v_session.kind <> 'group' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now() or not private.acts_for_trainer(v_session.trainer_id, 'schedule') then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.trainer_id <> v_session.trainer_id or v_pair.status not in ('trial', 'active') then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.session_id = v_session.id and b.coaching_id = v_pair.id
      and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, confirmed_at, decided_by)
  values (v_session.id, v_pair.id, v_pair.client_id, v_pair.trainer_id, 'confirmed', 'trainer', pg_catalog.now(), v_user)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, 'confirmed', v_user, 'trainer', '{}');

  select l.name into v_location from public.locations l where l.id = v_session.location_id;
  perform private.enqueue_notification(
    'booking_assigned',
    pg_catalog.format('booking_assigned:%s', v_booking_id),
    pg_catalog.jsonb_build_object(
      'session_id', v_session.id, 'starts_at', v_session.starts_at, 'mode', v_session.mode, 'location', v_location,
      'count', 1, 'until', null) || private.trainer_name(v_session.trainer_id),
    v_pair.client_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session.id);
  return v_booking_id;
end $$;

comment on function public.add_group_participant(uuid, uuid) is
  'Trainer: books a client of a live pair on a future group session, confirmed at once; the client gets К1.';
revoke all on function public.add_group_participant(uuid, uuid) from public, anon;
grant execute on function public.add_group_participant(uuid, uuid) to authenticated;

-- The open future group sessions of the caller's trainers from p_from to p_until, past each trainer's booking
-- notice, with the seats taken (the client cannot count other people's bookings) and the caller's own live
-- booking on it, if any (PRD 2.6.4-1, screens.md /client/book).
create function public.bookable_group_sessions(p_trainer_id uuid, p_from timestamptz, p_until timestamptz)
returns table (
  session_id   uuid,
  title        text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  mode         public.session_mode,
  location_id  uuid,
  capacity     smallint,
  taken        integer,
  my_booking_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.starts_at, s.ends_at, s.mode, s.location_id, s.capacity,
         (select pg_catalog.count(*)::integer from public.bookings b
          where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show')),
         (select b.id from public.bookings b
          where b.session_id = s.id and b.client_id = (select auth.uid())
            and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
          limit 1)
  from public.sessions s
  join public.trainer_profiles t on t.user_id = s.trainer_id
  where s.trainer_id = p_trainer_id
    and s.trainer_id = any (private.client_trainer_ids(true))
    and s.kind = 'group' and s.open_for_booking and s.status = 'scheduled'
    and s.starts_at >= greatest(p_from, pg_catalog.now() + pg_catalog.make_interval(mins => t.min_booking_notice_minutes))
    and s.starts_at < p_until
  order by s.starts_at
$$;

comment on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) is
  'Client: open group sessions of a trainer of a live pair in a time range, with seats taken and the caller''s booking.';
revoke all on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) to authenticated;

-- A group session the caller may book: open, scheduled, of a trainer of a live pair, past the booking notice,
-- not booked by the caller already. Raises slot_unavailable, too_late or already_booked. Seats are checked by
-- the capacity trigger when the booking is written (session_full).
create function private.bookable_group_session(p_session_id uuid)
returns public.sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_notice integer;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id;
  if v_session.id is null or v_session.kind <> 'group' or not v_session.open_for_booking
     or v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now()
     or not (v_session.trainer_id = any (private.client_trainer_ids(true))) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  select t.min_booking_notice_minutes into v_notice from public.trainer_profiles t where t.user_id = v_session.trainer_id;
  if v_session.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => coalesce(v_notice, 0)) then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.session_id = v_session.id and b.client_id = auth.uid()
      and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  return v_session;
end $$;

revoke all on function private.bookable_group_session(uuid) from public;

-- The confirm sheet for a group session: confirmed or a request, the pass it would use and what is left on it.
create function public.group_booking_preview(p_session_id uuid)
returns table (confirmed boolean, pass_title text, sessions_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_pair public.coachings;
  v_decision record;
begin
  v_session := private.bookable_group_session(p_session_id);
  v_pair := private.own_live_pair(v_session.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'group', v_session.starts_at);
  return query
    select v_decision.confirmed, p.title, pb.available - 1
    from (select 1) one
    left join public.passes p on p.id = v_decision.pass_id
    left join public.pass_balances pb on pb.pass_id = v_decision.pass_id;
end $$;

comment on function public.group_booking_preview(uuid) is
  'Client: whether booking this group session would be confirmed, and the pass it would use with what is left.';
revoke all on function public.group_booking_preview(uuid) from public, anon;
grant execute on function public.group_booking_preview(uuid) to authenticated;

-- The client books a seat on a group session (PRD 2.6.4-1): confirmed when a pass or allowed debt covers it,
-- otherwise a request that holds the seat (2.6.3-2). The trainer gets Т1 or Т2. Raises slot_unavailable,
-- too_late, already_booked or session_full (the last seat went to someone else, SCHED-15).
create function public.book_group_session(p_session_id uuid)
returns table (booking_id uuid, status public.booking_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_session public.sessions;
  v_pair public.coachings;
  v_decision record;
  v_booking_id uuid;
  v_status public.booking_status;
  v_location text;
begin
  v_session := private.bookable_group_session(p_session_id);
  v_pair := private.own_live_pair(v_session.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'group', v_session.starts_at);
  v_status := case when v_decision.confirmed then 'confirmed' else 'requested' end::public.booking_status;

  insert into public.bookings
    (session_id, coaching_id, client_id, trainer_id, status, source, reserved_pass_id, requested_at, confirmed_at)
  values
    (v_session.id, v_pair.id, v_pair.client_id, v_pair.trainer_id, v_status, 'client_session', v_decision.pass_id,
     pg_catalog.now(), case when v_decision.confirmed then pg_catalog.now() end)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, v_status, v_client, 'client',
          case when v_decision.confirmed
            then pg_catalog.jsonb_build_object('auto_confirmed', true, 'pass_id', v_decision.pass_id)
            else '{}'::jsonb end);

  select l.name into v_location from public.locations l where l.id = v_session.location_id;
  perform private.enqueue_notification(
    case when v_decision.confirmed then 'booking_created' else 'booking_requested' end::public.notification_type,
    pg_catalog.format('%s:%s', case when v_decision.confirmed then 'booking_created' else 'booking_requested' end, v_booking_id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking_id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'mode', v_session.mode,
      'location', v_location, 'debt', v_decision.confirmed and v_decision.pass_id is null, 'title', v_session.title)
      || private.person_name(v_pair.client_id),
    v_pair.trainer_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session.id);

  return query select v_booking_id, v_status;
end $$;

comment on function public.book_group_session(uuid) is
  'Client: books a seat on an open group session of a trainer of a live pair; confirmed when a pass or allowed '
  'debt covers it, otherwise a request that holds the seat. Returns the booking and its status.';
revoke all on function public.book_group_session(uuid) from public, anon;
grant execute on function public.book_group_session(uuid) to authenticated;

-- A request that ended without a session frees what it held: on a personal session the session goes and its
-- slot is offered again; on a group session only the seat is freed, which the booking status already does.
create or replace function private.drop_request_session(p_session_id uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_slot public.slots;
begin
  if exists (select 1 from public.sessions s where s.id = p_session_id and s.kind = 'group') then
    return;
  end if;
  update public.sessions s
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = p_actor, cancel_reason = p_reason
  where s.id = p_session_id and s.status = 'scheduled'
  returning s.* into v_session;
  if v_session.slot_id is null then
    return;
  end if;
  select sl.* into v_slot from public.slots sl where sl.id = v_session.slot_id for update;
  if v_slot.id is null or v_slot.status <> 'booked' then
    return;
  end if;
  if v_slot.starts_at > pg_catalog.now()
     and not exists (
       select 1 from public.slots c
       where c.trainer_id = v_slot.trainer_id and c.status = 'closed'
         and tstzrange(c.starts_at, c.ends_at) && tstzrange(v_slot.starts_at, v_slot.ends_at))
     and not exists (
       select 1 from public.sessions x
       where x.trainer_id = v_slot.trainer_id and x.status = 'scheduled' and x.id <> v_session.id
         and tstzrange(x.starts_at, x.ends_at) && tstzrange(v_slot.starts_at, v_slot.ends_at)) then
    update public.slots sl set status = 'open' where sl.id = v_slot.id;
  else
    update public.sessions s set slot_id = null where s.id = v_session.id;
    delete from public.slots sl where sl.id = v_slot.id;
  end if;
end $$;

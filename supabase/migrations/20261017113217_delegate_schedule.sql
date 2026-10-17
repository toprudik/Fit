-- Delegation, the rest of the assistant's schedule (PRD wave-3 §1, model and rules 3–4).
--
-- * A delegate reads the pairs, the client profiles and the sessions it was handed: an assistant for its clients
--   (all or chosen), a substitute for the participants of its session until the session ends. Nothing else: the
--   money tables keep their own policies, and the owner's other pairs stay hidden.
-- * An assistant with the schedule scope creates sessions for the clients it covers, records a past session,
--   changes or cancels their personal sessions; an assistant for all clients also runs the owner's group sessions,
--   slots, week template and closed days. The schedule functions take the owner as p_trainer_id (null: the caller).
--   The rows stay the owner's (trainer_id), the delegate is in created_by and in the booking journal.

-- Pairs the caller reaches as a delegate, with any of p_scopes (null: any scope). Starts from the caller's own
-- delegations, so a trainer without any pays one index lookup.
create function private.delegated_coaching_ids(p_scopes public.delegation_scope[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select c.id
    from public.delegations d
    join public.coachings c on c.trainer_id = d.owner_trainer_id
    where d.delegate_trainer_id = auth.uid() and d.kind = 'assistant' and d.status = 'active'
      and (p_scopes is null or d.scopes && p_scopes)
      and d.starts_at <= pg_catalog.now() and (d.ends_at is null or d.ends_at > pg_catalog.now())
      and (d.all_clients or exists (
        select 1 from public.delegation_clients dc where dc.delegation_id = d.id and dc.coaching_id = c.id))
    union all
    select b.coaching_id
    from public.delegations d
    join public.sessions s on s.id = d.session_id and s.ends_at > pg_catalog.now() and s.status = 'scheduled'
    join public.bookings b on b.session_id = s.id and b.status in ('confirmed', 'attended', 'no_show')
    where d.delegate_trainer_id = auth.uid() and d.kind = 'substitute' and d.status = 'active'
      and (p_scopes is null or d.scopes && p_scopes)
  ) x
  where auth.uid() is not null
$$;

-- Clients of those pairs, for their names.
create function private.delegated_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct c.client_id), '{}')
  from public.coachings c
  where c.id = any (private.delegated_coaching_ids())
$$;

-- Sessions the caller reaches as a delegate: personal sessions of covered clients (schedule or attendance) and the
-- session it substitutes on. Group sessions of an assistant for all clients come through acting_trainer_ids.
create function private.delegated_session_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select s.id
    from public.sessions s
    join public.bookings b on b.session_id = s.id
    where s.kind <> 'group'
      and b.coaching_id = any (private.delegated_coaching_ids('{schedule,attendance}'))
    union all
    select d.session_id
    from public.delegations d
    where d.delegate_trainer_id = auth.uid() and d.kind = 'substitute' and private.substitutes_session(d.session_id)
  ) x
$$;

revoke all on function private.delegated_coaching_ids(public.delegation_scope[]) from public;
revoke all on function private.delegated_client_ids() from public;
revoke all on function private.delegated_session_ids() from public;
grant execute on function private.delegated_coaching_ids(public.delegation_scope[]) to authenticated, service_role;
grant execute on function private.delegated_client_ids() to authenticated, service_role;
grant execute on function private.delegated_session_ids() to authenticated, service_role;

alter policy "coachings: members read" on public.coachings
  using (
    client_id = (select auth.uid())
    or id = any ((select private.trainer_coaching_ids())::uuid[])
    or id = any ((select private.delegated_coaching_ids())::uuid[]));

alter policy "profiles: read self, pair partners, own cards, admins" on public.profiles
  using (
    id = (select auth.uid())
    or managed_by_trainer_id = (select auth.uid())
    or id in (select private.pair_partner_ids())
    or id = any ((select private.delegated_client_ids())::uuid[])
    or ((select private.is_admin()) and managed_by_trainer_id is null and id <> private.deleted_client_id()));

alter policy "sessions: trainer, participants and live clients read" on public.sessions
  using (
    trainer_id = any ((select private.acting_trainer_ids('{schedule}'))::uuid[])
    or id = any ((select private.own_booked_session_ids())::uuid[])
    or id = any ((select private.delegated_session_ids())::uuid[])
    or (open_for_booking and status = 'scheduled' and trainer_id = any ((select private.client_trainer_ids(true))::uuid[])));

-- The trainer whose schedule the caller manages: itself, or an owner it assists for all clients with schedule.
create function private.schedule_trainer(p_trainer_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := coalesce(p_trainer_id, auth.uid());
begin
  if auth.uid() is null or not exists (select 1 from public.trainer_profiles t where t.user_id = auth.uid()) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  if v_trainer <> auth.uid() and not private.assists_trainer(v_trainer, 'schedule') then
    raise exception 'not_your_schedule' using errcode = '42501';
  end if;
  return v_trainer;
end $$;

revoke all on function private.schedule_trainer(uuid) from public;
grant execute on function private.schedule_trainer(uuid) to authenticated, service_role;

-- A future session the caller may change: the owner's, an assistant's for all clients, or a personal session of a
-- client an assistant covers.
create or replace function private.own_future_session(p_session_id uuid)
returns public.sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select s.* into v_session from public.sessions s
  where s.id = p_session_id
    and (s.trainer_id = auth.uid() or private.assists_trainer(s.trainer_id, 'schedule')
         or (s.kind <> 'group' and exists (
               select 1 from public.bookings b
               where b.session_id = s.id and private.delegate_covers(b.coaching_id, 'schedule'))))
  for update;
  if v_session.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now() then
    raise exception 'not_editable' using errcode = 'P0001';
  end if;
  return v_session;
end $$;

-- A pair the caller schedules for: its own, or one an assistant covers with schedule.
create or replace function public.create_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_meeting_url text default null,
  p_title text default null,
  p_weekdays smallint[] default null,
  p_until date default null,
  p_count smallint default null)
returns table (session_id uuid, created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trainer uuid;
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
  if v_actor is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_actor) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.status not in ('trial', 'active')
     or not (v_pair.trainer_id = v_actor or private.delegate_covers(v_pair.id, 'schedule')) then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  v_trainer := v_pair.trainer_id;
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
      v_title, null, v_actor);
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
       v_local, v_zone, p_until, p_count, p_duration_min, 'personal', v_title, 1, p_location_id, p_mode, v_url, v_actor)
    returning id into v_recurrence_id;
    v_created := private.materialize_recurrence(v_recurrence_id);
    select s.id into v_first from public.sessions s where s.recurrence_id = v_recurrence_id order by s.starts_at limit 1;
  end if;

  select l.name into v_location from public.locations l where l.id = p_location_id;
  -- К1, one message for the whole repeat (PRD 2.6.2-5), signed by the owner.
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

create or replace function public.record_past_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_status public.booking_status default 'attended',
  p_title text default null)
returns table (session_id uuid, booking_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trainer uuid;
  v_pair public.coachings;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_ends_at timestamptz;
  v_session uuid;
  v_booking uuid;
  v_charge uuid;
begin
  if v_actor is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_actor) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for no key update;
  if v_pair.id is null or v_pair.status not in ('trial', 'active')
     or not (v_pair.trainer_id = v_actor or private.delegate_covers(v_pair.id, 'schedule')) then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  v_trainer := v_pair.trainer_id;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  v_ends_at := p_starts_at + pg_catalog.make_interval(mins => p_duration_min);
  if p_starts_at is null or v_ends_at > pg_catalog.now() then
    raise exception 'not_past' using errcode = '22023';
  end if;
  if p_starts_at < pg_catalog.now() - interval '366 days' then
    raise exception 'too_old' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  perform private.check_session_place(v_trainer, p_mode, p_location_id, null);

  insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, location_id, mode, capacity, status,
                               completed_at, created_by)
  values (v_trainer, 'personal', v_title, p_starts_at, v_ends_at, p_location_id, p_mode, 1, 'completed',
          pg_catalog.now(), v_actor)
  returning id into v_session;
  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, confirmed_at, decided_by,
                               attendance_marked_at, attendance_marked_by)
  values (v_session, v_pair.id, v_pair.client_id, v_trainer, 'attended', 'trainer', pg_catalog.now(), v_actor,
          pg_catalog.now(), v_actor)
  returning id into v_booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking, null, 'attended', v_actor, 'trainer', '{"recorded_after": true}');
  if p_status = 'no_show' then
    update public.bookings set status = 'no_show' where id = v_booking;
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
    values (v_booking, 'attended', 'no_show', v_actor, 'trainer', '{"recorded_after": true}');
  end if;
  v_charge := private.post_charge(v_booking, p_status::text::public.charge_reason);
  if p_status = 'no_show' then
    perform private.notify_charge(v_charge, 'charge_posted');
  end if;
  return query select v_session, v_booking;
end $$;

-- The trainer-wide schedule functions get the owner as their last argument.
drop function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid, text, boolean,
  smallint[], date, smallint);
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
  p_count smallint default null,
  p_trainer_id uuid default null)
returns table (session_id uuid, created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trainer uuid := private.schedule_trainer(p_trainer_id);
  v_zone text;
  v_local timestamp;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_url text := nullif(pg_catalog.btrim(p_meeting_url), '');
  v_open boolean := coalesce(p_open_for_booking, true);
  v_recurrence_id uuid;
  v_first uuid;
  v_created integer := 1;
begin
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
      v_url, v_title, p_capacity, v_open, null, v_actor);
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
       v_open, v_actor)
    returning id into v_recurrence_id;
    v_created := private.materialize_recurrence(v_recurrence_id);
    select s.id into v_first from public.sessions s where s.recurrence_id = v_recurrence_id order by s.starts_at limit 1;
  end if;

  return query select v_first, v_created;
end $$;

drop function public.save_week_template(jsonb, smallint, smallint);
create function public.save_week_template(
  p_items jsonb,
  p_horizon_weeks smallint default 4,
  p_buffer_min smallint default 0,
  p_trainer_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.schedule_trainer(p_trainer_id);
  v_template_id uuid;
  v_item jsonb;
  v_start time;
  v_end time;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select t.id into v_template_id from public.week_templates t where t.trainer_id = v_trainer
  order by t.is_active desc, t.created_at limit 1;
  if v_template_id is null then
    insert into public.week_templates (trainer_id, name, time_zone)
    values (v_trainer, 'week', (select s.time_zone from public.user_settings s where s.user_id = v_trainer))
    returning id into v_template_id;
  end if;

  perform private.clear_template_slots(v_trainer);
  delete from public.week_template_items i where i.template_id = v_template_id;

  for v_item in select * from pg_catalog.jsonb_array_elements(p_items) loop
    v_start := (v_item ->> 'start_time')::time;
    v_end := (v_item ->> 'end_time')::time;
    -- Overlapping windows on one day would only fight over the same slots.
    if exists (
      select 1 from public.week_template_items i
      where i.template_id = v_template_id and i.iso_weekday = (v_item ->> 'iso_weekday')::smallint
        and i.start_time < v_end and v_start < i.end_time
    ) then
      raise exception 'items_overlap' using errcode = '22023';
    end if;
    insert into public.week_template_items
      (template_id, iso_weekday, start_time, end_time, duration_min, location_id, mode, meeting_url, allow_trial)
    values (
      v_template_id,
      (v_item ->> 'iso_weekday')::smallint,
      v_start,
      v_end,
      (v_item ->> 'duration_min')::smallint,
      nullif(v_item ->> 'location_id', '')::uuid,
      coalesce(v_item ->> 'mode', 'offline')::public.session_mode,
      nullif(pg_catalog.btrim(v_item ->> 'meeting_url'), ''),
      coalesce((v_item ->> 'allow_trial')::boolean, true));
  end loop;

  update public.week_templates t
  set is_active = pg_catalog.jsonb_array_length(p_items) > 0, horizon_weeks = p_horizon_weeks, buffer_min = p_buffer_min,
      generated_until = null
  where t.id = v_template_id;

  return private.generate_slots(v_template_id);
end $$;

drop function public.close_schedule_days(date, date);
create function public.close_schedule_days(p_from date, p_to date, p_trainer_id uuid default null)
returns table (session_id uuid, starts_at timestamptz, title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.schedule_trainer(p_trainer_id);
  v_zone text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'invalid_range' using errcode = '22023', detail = 'one day to three months';
  end if;
  select s.time_zone into v_zone from public.user_settings s where s.user_id = v_trainer;
  v_start := private.local_to_utc(p_from::timestamp, v_zone);
  v_end := private.local_to_utc((p_to + 1)::timestamp, v_zone);
  if v_end <= pg_catalog.now() then
    raise exception 'invalid_range' using errcode = '22023', detail = 'the days are in the past';
  end if;

  delete from public.slots s
  where s.trainer_id = v_trainer and s.status = 'open' and tstzrange(s.starts_at, s.ends_at) && tstzrange(v_start, v_end)
    and not exists (select 1 from public.sessions x where x.slot_id = s.id and x.status <> 'cancelled');
  insert into public.slots (trainer_id, starts_at, ends_at, status) values (v_trainer, v_start, v_end, 'closed');

  return query
    select x.id, x.starts_at, x.title from public.sessions x
    where x.trainer_id = v_trainer and x.status = 'scheduled' and tstzrange(x.starts_at, x.ends_at) && tstzrange(v_start, v_end)
    order by x.starts_at;
end $$;

-- The closed days belong to a trainer: the owner or its assistant for all clients reopens them.
create or replace function public.reopen_schedule(p_slot_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer uuid;
  v_template_id uuid;
begin
  delete from public.slots s
  where s.id = p_slot_id and s.status = 'closed'
    and (s.trainer_id = auth.uid() or private.assists_trainer(s.trainer_id, 'schedule'))
  returning s.trainer_id into v_trainer;
  if v_trainer is null then
    raise exception 'not_closed' using errcode = 'P0001';
  end if;
  select t.id into v_template_id from public.week_templates t where t.trainer_id = v_trainer and t.is_active;
  return case when v_template_id is null then 0 else private.generate_slots(v_template_id) end;
end $$;

drop function public.session_conflicts(timestamptz, timestamptz, uuid);
create function public.session_conflicts(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore uuid default null,
  p_trainer_id uuid default null)
returns table (session_id uuid, starts_at timestamptz, ends_at timestamptz, kind public.session_kind, title text,
               coaching_id uuid)
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
  where s.trainer_id = coalesce(p_trainer_id, auth.uid())
    and (s.trainer_id = auth.uid() or private.assists_trainer(s.trainer_id, 'schedule'))
    and s.status <> 'cancelled'
    and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_starts_at, p_ends_at)
    and s.id is distinct from p_ignore
  order by s.starts_at
  limit 10
$$;

revoke all on function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid, text,
  boolean, smallint[], date, smallint, uuid) from public, anon;
revoke all on function public.save_week_template(jsonb, smallint, smallint, uuid) from public, anon;
revoke all on function public.close_schedule_days(date, date, uuid) from public, anon;
revoke all on function public.session_conflicts(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.create_group_session(timestamptz, smallint, smallint, text, public.session_mode, uuid,
  text, boolean, smallint[], date, smallint, uuid) to authenticated;
grant execute on function public.save_week_template(jsonb, smallint, smallint, uuid) to authenticated;
grant execute on function public.close_schedule_days(date, date, uuid) to authenticated;
grant execute on function public.session_conflicts(timestamptz, timestamptz, uuid, uuid) to authenticated;

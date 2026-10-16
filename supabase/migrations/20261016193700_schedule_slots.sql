-- Trainer schedule, part 1 (PRD wave-1 §2.6.1, §2.6.7; screens.md /trainer/schedule, /template, /slots): local
-- time to UTC with the DST rules, the week template saved as a whole, the slot generator with its rolling
-- window, and closed days. Sessions and repeats come in the next migration.

-- Local time ----------------------------------------------------------------------------------------------

-- The zone's offset from UTC at an instant.
create function private.zone_offset(p_at timestamptz, p_zone text)
returns interval
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone p_zone) - (p_at at time zone 'UTC')
$$;

comment on function private.zone_offset(timestamptz, text) is 'Offset of the zone from UTC at that instant.';
revoke all on function private.zone_offset(timestamptz, text) from public;

-- A local wall time in a zone as an instant, by the rules of PRD §2.6.7-3: a time that does not exist (spring
-- forward) moves to the first time after the gap, an ambiguous one (fall back) takes the first of the two.
-- Postgres alone would pick the later of two and shift a gap time by the gap length.
create function private.local_to_utc(p_local timestamp, p_zone text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_guess timestamptz := p_local at time zone p_zone;
  v_before interval := private.zone_offset(v_guess - interval '1 day', p_zone);
  v_after interval := private.zone_offset(v_guess + interval '1 day', p_zone);
  v_first timestamptz := (p_local - v_before) at time zone 'UTC';
  v_second timestamptz := (p_local - v_after) at time zone 'UTC';
  v_low timestamptz;
  v_high timestamptz;
  v_mid timestamptz;
begin
  if v_before = v_after then
    return v_guess;
  end if;
  -- Of the readings that give back the same wall time, the earliest instant.
  if (v_first at time zone p_zone) = p_local and (v_second at time zone p_zone) = p_local then
    return least(v_first, v_second);
  elsif (v_first at time zone p_zone) = p_local then
    return v_first;
  elsif (v_second at time zone p_zone) = p_local then
    return v_second;
  end if;
  -- A gap: the transition instant lies in (v_second, v_first]; find it to the second.
  v_low := v_second;
  v_high := v_first;
  while v_high - v_low > interval '1 second' loop
    v_mid := v_low + (v_high - v_low) / 2;
    if private.zone_offset(v_mid, p_zone) = v_after then
      v_high := v_mid;
    else
      v_low := v_mid;
    end if;
  end loop;
  return pg_catalog.date_trunc('second', v_high);
end $$;

comment on function private.local_to_utc(timestamp, text) is
  'Local wall time in a zone as an instant: a time in a DST gap moves to the end of the gap, an ambiguous one '
  'takes the earlier instant (PRD 2.6.7-3).';
revoke all on function private.local_to_utc(timestamp, text) from public;

-- Slot generator ------------------------------------------------------------------------------------------

-- Cuts the active template's windows into open slots from today to the horizon (PRD 2.6.1-1, 2). A slot is
-- skipped when it starts in the past or overlaps a closed day, a live session or another slot of the trainer
-- (2.6.1-3, R92). Idempotent: running it again adds only what is missing, so the daily job just rolls the window.
create function private.generate_slots(p_template_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_template public.week_templates%rowtype;
  v_from date;
  v_to date;
  v_day date;
  v_item public.week_template_items%rowtype;
  v_cursor time;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
begin
  select * into v_template from public.week_templates t where t.id = p_template_id and t.is_active;
  if not found then
    return 0;
  end if;
  v_from := (pg_catalog.now() at time zone v_template.time_zone)::date;
  v_to := v_from + v_template.horizon_weeks * 7 - 1;

  v_day := v_from;
  while v_day <= v_to loop
    for v_item in
      select * from public.week_template_items i
      where i.template_id = p_template_id and i.iso_weekday = extract(isodow from v_day)
      order by i.start_time
    loop
      v_cursor := v_item.start_time;
      -- The slot fits the window; the comparison in minutes keeps a window ending at 24:00 impossible to wrap.
      while extract(epoch from (v_item.end_time - v_cursor)) / 60 >= v_item.duration_min loop
        v_start := private.local_to_utc(v_day + v_cursor, v_template.time_zone);
        v_end := v_start + pg_catalog.make_interval(mins => v_item.duration_min);
        if v_start > pg_catalog.now()
          and not exists (
            select 1 from public.slots s
            where s.trainer_id = v_template.trainer_id and tstzrange(s.starts_at, s.ends_at) && tstzrange(v_start, v_end))
          and not exists (
            select 1 from public.sessions x
            where x.trainer_id = v_template.trainer_id and x.status <> 'cancelled'
              and tstzrange(x.starts_at, x.ends_at) && tstzrange(v_start, v_end))
        then
          insert into public.slots (trainer_id, starts_at, ends_at, location_id, mode, allow_trial, template_item_id)
          values (v_template.trainer_id, v_start, v_end, v_item.location_id, v_item.mode, v_item.allow_trial, v_item.id);
          v_count := v_count + 1;
        end if;
        -- Stop before the time of day wraps past midnight.
        exit when v_cursor + pg_catalog.make_interval(mins => v_item.duration_min + v_template.buffer_min) <= v_cursor;
        v_cursor := v_cursor + pg_catalog.make_interval(mins => v_item.duration_min + v_template.buffer_min);
      end loop;
    end loop;
    v_day := v_day + 1;
  end loop;

  update public.week_templates t set generated_until = v_to where t.id = p_template_id;
  return v_count;
end $$;

comment on function private.generate_slots(uuid) is
  'Adds the missing open slots of an active week template from today to its horizon; returns how many.';
revoke all on function private.generate_slots(uuid) from public;

-- Future open slots the template made and nobody booked: the ones a template change replaces (2.6.1-4).
create function private.clear_template_slots(p_trainer_id uuid)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.slots s
    where s.trainer_id = p_trainer_id and s.status = 'open' and s.template_item_id is not null
      and s.starts_at > pg_catalog.now()
      and not exists (select 1 from public.sessions x where x.slot_id = s.id and x.status <> 'cancelled')
    returning 1
  )
  select pg_catalog.count(*)::integer from removed
$$;

comment on function private.clear_template_slots(uuid) is
  'Deletes the trainer''s future open, unbooked slots made by a template; returns how many.';
revoke all on function private.clear_template_slots(uuid) from public;

-- The daily job: every active template rolls its window one day further.
create function private.roll_slots()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in select t.id from public.week_templates t where t.is_active loop
    v_count := v_count + private.generate_slots(v_id);
  end loop;
  return v_count;
end $$;

comment on function private.roll_slots() is 'Job: extends the slots of every active week template to its horizon.';
revoke all on function private.roll_slots() from public;

select cron.schedule('slots-roll', '15 0 * * *', 'select private.roll_slots()');

-- save_week_template --------------------------------------------------------------------------------------

-- The template screen saves the whole week at once (screens.md /trainer/schedule/template): the windows, the
-- horizon and the gap between slots. The trainer has one template in wave 1; it is created on the first save,
-- in the trainer's time zone. Future unbooked slots of the old template go and the new ones are generated, so
-- booked slots and sessions stay as they are (2.6.1-4). An empty week switches the template off.
-- p_items: [{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60,
--            "mode": "offline", "location_id": "...", "meeting_url": null, "allow_trial": true}, ...]
create function public.save_week_template(p_items jsonb, p_horizon_weeks smallint default 4, p_buffer_min smallint default 0)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
  v_template_id uuid;
  v_item jsonb;
  v_start time;
  v_end time;
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
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

comment on function public.save_week_template(jsonb, smallint, smallint) is
  'Trainer: replaces the week template windows, horizon and buffer, then regenerates future unbooked slots. '
  'Returns the number of new slots. Raises not_a_trainer, invalid_items, items_overlap or a check violation.';
revoke all on function public.save_week_template(jsonb, smallint, smallint) from public, anon;
grant execute on function public.save_week_template(jsonb, smallint, smallint) to authenticated;

-- Closed days ---------------------------------------------------------------------------------------------

-- PRD 2.6.1-5: closes whole local days (vacation, illness). A closed marker slot covers the range, open
-- unbooked slots in it go, the generator skips it. Sessions in it stay: the function returns them, so the
-- trainer sees the warning and decides.
create function public.close_schedule_days(p_from date, p_to date)
returns table (session_id uuid, starts_at timestamptz, title text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
  v_zone text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
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

comment on function public.close_schedule_days(date, date) is
  'Trainer: closes local days p_from..p_to (at most 93), removes open slots there and returns the sessions left '
  'in them for the warning. Raises not_a_trainer or invalid_range.';
revoke all on function public.close_schedule_days(date, date) from public, anon;
grant execute on function public.close_schedule_days(date, date) to authenticated;

-- Opens closed time again and lets the template fill it back.
create function public.reopen_schedule(p_slot_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
  v_template_id uuid;
begin
  delete from public.slots s where s.id = p_slot_id and s.trainer_id = v_trainer and s.status = 'closed';
  if not found then
    raise exception 'not_closed' using errcode = 'P0001';
  end if;
  select t.id into v_template_id from public.week_templates t where t.trainer_id = v_trainer and t.is_active;
  return case when v_template_id is null then 0 else private.generate_slots(v_template_id) end;
end $$;

comment on function public.reopen_schedule(uuid) is
  'Trainer: removes a closed marker and regenerates slots from the active template. Raises not_closed.';
revoke all on function public.reopen_schedule(uuid) from public, anon;
grant execute on function public.reopen_schedule(uuid) to authenticated;

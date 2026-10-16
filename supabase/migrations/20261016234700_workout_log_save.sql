-- Workout log writes and reads for the log screens (PRD wave-1 §2.10-4..7, WORK-3..5). Both functions run as
-- the caller, so the workouts policies decide everything: a client writes self logs, the trainer of a live pair
-- writes that pair's logs, only the author edits (2.10-10), and a log is read only by those who may.

-- Saves a whole log in one call: the log, then its exercises and sets in the given order, replacing what the
-- log had. A new log has no "id"; an edit names it. Personal records follow through the triggers on the sets.
-- p_log: {id?, client_id, coaching_id?, booking_id?, template_id?, title?, performed_at, local_date,
--         duration_min?, notes?, exercises: [{exercise_id, notes?, sets: [{reps?, weight_kg?, duration_s?,
--         distance_m?, is_warmup?}]}]}
create function public.save_workout_log(p_log jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_log ->> 'id', '')::uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_le uuid;
  v_ex_pos smallint := 0;
  v_set_pos smallint;
begin
  if pg_catalog.jsonb_typeof(p_log -> 'exercises') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_log -> 'exercises') > 30 then
    raise exception 'a log holds 1 to 30 exercises' using errcode = '22023';
  end if;
  if ((p_log ->> 'performed_at')::timestamptz at time zone 'UTC')::date
       not between (p_log ->> 'local_date')::date - 1 and (p_log ->> 'local_date')::date + 1 then
    raise exception 'local_date does not match performed_at' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.workout_logs (
      client_id, coaching_id, booking_id, template_id, title, performed_at, local_date, duration_min, notes)
    values (
      (p_log ->> 'client_id')::uuid, nullif(p_log ->> 'coaching_id', '')::uuid, nullif(p_log ->> 'booking_id', '')::uuid,
      nullif(p_log ->> 'template_id', '')::uuid, nullif(pg_catalog.btrim(p_log ->> 'title'), ''),
      (p_log ->> 'performed_at')::timestamptz, (p_log ->> 'local_date')::date, (p_log ->> 'duration_min')::smallint,
      nullif(pg_catalog.btrim(p_log ->> 'notes'), ''))
    returning id into v_id;
  else
    update public.workout_logs set
      title = nullif(pg_catalog.btrim(p_log ->> 'title'), ''),
      performed_at = (p_log ->> 'performed_at')::timestamptz,
      local_date = (p_log ->> 'local_date')::date,
      duration_min = (p_log ->> 'duration_min')::smallint,
      notes = nullif(pg_catalog.btrim(p_log ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'no such log, or it is not yours to edit' using errcode = 'P0002';
    end if;
    delete from public.workout_log_exercises where log_id = v_id;
  end if;

  for v_exercise in select e from pg_catalog.jsonb_array_elements(p_log -> 'exercises') e
  loop
    if pg_catalog.jsonb_typeof(v_exercise -> 'sets') is distinct from 'array'
       or pg_catalog.jsonb_array_length(v_exercise -> 'sets') > 30 then
      raise exception 'an exercise holds 0 to 30 sets' using errcode = '22023';
    end if;
    v_ex_pos := v_ex_pos + 1;
    insert into public.workout_log_exercises (log_id, position, exercise_id, notes)
    values (v_id, v_ex_pos, (v_exercise ->> 'exercise_id')::uuid, nullif(pg_catalog.btrim(v_exercise ->> 'notes'), ''))
    returning id into v_le;
    v_set_pos := 0;
    for v_set in select s from pg_catalog.jsonb_array_elements(v_exercise -> 'sets') s
    loop
      v_set_pos := v_set_pos + 1;
      insert into public.workout_sets (log_exercise_id, position, reps, weight_kg, duration_s, distance_m, is_warmup)
      values (v_le, v_set_pos, (v_set ->> 'reps')::smallint, (v_set ->> 'weight_kg')::numeric,
              (v_set ->> 'duration_s')::integer, (v_set ->> 'distance_m')::integer,
              coalesce((v_set ->> 'is_warmup')::boolean, false));
    end loop;
  end loop;
  return v_id;
end $$;

comment on function public.save_workout_log(jsonb) is
  'Creates or replaces a workout log with its exercises and sets in one call, as the caller (RLS applies).';
revoke all on function public.save_workout_log(jsonb) from public;
grant execute on function public.save_workout_log(jsonb) to authenticated;

-- The last result of a client in each exercise (PRD 2.10-5, WORK-3): the sets of the latest log before
-- p_before that has the exercise, among the logs the caller can read.
create function public.last_exercise_results(p_client uuid, p_exercises uuid[], p_before timestamptz default null)
returns table (exercise_id uuid, log_id uuid, performed_at timestamptz, sets jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (e.exercise_id) e.exercise_id, l.id, l.performed_at,
         (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                    'reps', s.reps, 'weight_kg', s.weight_kg, 'duration_s', s.duration_s, 'distance_m', s.distance_m,
                    'is_warmup', s.is_warmup) order by s.position), '[]'::jsonb)
          from public.workout_sets s where s.log_exercise_id = e.id)
  from public.workout_logs l
  join public.workout_log_exercises e on e.log_id = l.id
  where l.client_id = p_client
    and e.exercise_id = any (p_exercises)
    and (p_before is null or l.performed_at < p_before)
  order by e.exercise_id, l.performed_at desc, l.id, e.position
$$;

comment on function public.last_exercise_results(uuid, uuid[], timestamptz) is
  'Sets of the latest readable log of a client per exercise, before a moment: the "last time" hint of the log editor.';
revoke all on function public.last_exercise_results(uuid, uuid[], timestamptz) from public;
grant execute on function public.last_exercise_results(uuid, uuid[], timestamptz) to authenticated;

-- save_workout_log promised 1 to 30 exercises but only checked the upper bound, so an empty log could be saved
-- through the RPC (the editor refuses it, lib/workouts/log.ts). Same body as 20261016234700_workout_log_save.sql
-- with the lower bound added.
CREATE OR REPLACE FUNCTION public.save_workout_log(p_log jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := nullif(p_log ->> 'id', '')::uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_le uuid;
  v_ex_pos smallint := 0;
  v_set_pos smallint;
begin
  if pg_catalog.jsonb_typeof(p_log -> 'exercises') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_log -> 'exercises') not between 1 and 30 then
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
end $function$

;

-- Workout template writes for the template screens (PRD wave-1 §2.10-7, WORK-5). The function runs as the
-- caller, so the workouts policies decide: only a trainer creates a template, only its owner changes it, and an
-- item names only an exercise the owner can see (never another trainer's own exercise).

-- Saves a whole template in one call: the template, then its exercises with their targets in the given order,
-- replacing what it had. A new template has no "id"; an edit names it. Logs filled from it keep their own copy.
-- p_template: {id?, title, notes?, items: [{exercise_id, target_sets?, target_reps?, target_weight_kg?,
--              target_duration_s?, rest_s?, notes?}]}
create function public.save_workout_template(p_template jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_template ->> 'id', '')::uuid;
  v_item jsonb;
  v_pos smallint := 0;
begin
  if pg_catalog.jsonb_typeof(p_template -> 'items') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_template -> 'items') not between 1 and 30 then
    raise exception 'a template holds 1 to 30 exercises' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.workout_templates (owner_id, title, notes)
    values ((select auth.uid()), pg_catalog.btrim(p_template ->> 'title'), nullif(pg_catalog.btrim(p_template ->> 'notes'), ''))
    returning id into v_id;
  else
    update public.workout_templates set
      title = pg_catalog.btrim(p_template ->> 'title'),
      notes = nullif(pg_catalog.btrim(p_template ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'no such template, or it is not yours to edit' using errcode = 'P0002';
    end if;
    delete from public.workout_template_items where template_id = v_id;
  end if;

  for v_item in select i from pg_catalog.jsonb_array_elements(p_template -> 'items') i
  loop
    v_pos := v_pos + 1;
    insert into public.workout_template_items (
      template_id, position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, rest_s, notes)
    values (
      v_id, v_pos, (v_item ->> 'exercise_id')::uuid, (v_item ->> 'target_sets')::smallint,
      (v_item ->> 'target_reps')::smallint, (v_item ->> 'target_weight_kg')::numeric,
      (v_item ->> 'target_duration_s')::integer, (v_item ->> 'rest_s')::smallint,
      nullif(pg_catalog.btrim(v_item ->> 'notes'), ''));
  end loop;
  return v_id;
end $$;

comment on function public.save_workout_template(jsonb) is
  'Creates or replaces a workout template with its exercises and targets in one call, as the caller (RLS applies).';
revoke all on function public.save_workout_template(jsonb) from public;
grant execute on function public.save_workout_template(jsonb) to authenticated;

-- The trainer sets the client's water and steps goals with the nutrition target (wave-2 §4 rules 5 and 7).
-- nutrition_targets already has water_ml and steps_target (the group target fills them); set_nutrition_target
-- now takes them too. Null keeps the defaults: 30 ml per kg of the latest weight and 8000 steps.

drop function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean);

create function public.set_nutrition_target(
  p_coaching_id uuid,
  p_kcal integer,
  p_protein_g integer default null,
  p_fat_g integer default null,
  p_carbs_g integer default null,
  p_confirm_low boolean default false,
  p_water_ml integer default null,
  p_steps_target integer default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_sex public.calc_sex;
  v_today date;
  v_open uuid;
  v_id uuid;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_user is null or v_pair.id is null or v_pair.trainer_id <> v_user or not private.trainer_target_counts(v_pair.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kcal is null or p_kcal < 500 or p_kcal > 10000
     or p_protein_g < 0 or p_protein_g > 1000 or p_fat_g < 0 or p_fat_g > 1000 or p_carbs_g < 0 or p_carbs_g > 2000
     or p_water_ml < 0 or p_water_ml > 10000 or p_steps_target < 0 or p_steps_target > 100000 then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  select b.calc_sex into v_sex from public.body_profiles b where b.user_id = v_pair.client_id;
  if p_kcal < private.min_kcal(v_sex) and not coalesce(p_confirm_low, false) then
    raise exception 'low_kcal_unconfirmed' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nutrition_target:' || v_pair.client_id::text, 0));
  v_today := private.client_today(v_pair.client_id);
  select t.id into v_open from public.nutrition_targets t
  where t.coaching_id = v_pair.id and t.source = 'trainer' and t.effective_to is null;
  if v_open is not null then
    perform private.close_target(v_open, v_today);
  end if;
  insert into public.nutrition_targets
    (source, client_id, coaching_id, kcal, protein_g, fat_g, carbs_g, water_ml, steps_target, effective_from,
     low_kcal_confirmed_at, set_by)
  values (
    'trainer', v_pair.client_id, v_pair.id, p_kcal, p_protein_g, p_fat_g, p_carbs_g, nullif(p_water_ml, 0),
    nullif(p_steps_target, 0), v_today, case when p_kcal < private.min_kcal(v_sex) then pg_catalog.now() end, v_user)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean, integer, integer) is
  'The trainer of a live pair that shares nutrition sets the client''s target, water and steps goals from the client''s today (wave-2 §2.11, §4).';
revoke all on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean, integer, integer) from public, anon;
grant execute on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean, integer, integer) to authenticated;

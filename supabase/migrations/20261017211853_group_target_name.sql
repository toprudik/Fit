-- The client sees which group a group target comes from (PRD wave-2 §2 rule 15: «Группа „Название“»).
-- my_nutrition_target gains group_name; the rest is the version of 20261017084217_trainer_groups.sql. A new column
-- changes the return type, so the function is dropped and created again with the same grants.

drop function public.my_nutrition_target();

create function public.my_nutrition_target()
returns table (
  id uuid, source public.target_source, coaching_id uuid, trainer_name text,
  kcal smallint, protein_g smallint, fat_g smallint, carbs_g smallint, effective_from date, calc_inputs jsonb,
  group_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.source, coalesce(t.coaching_id, pair.id),
    coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name))),
    t.kcal, t.protein_g, t.fat_g, t.carbs_g, t.effective_from, t.calc_inputs, g.name
  from public.nutrition_targets t
  left join public.groups g on g.id = t.group_id
  left join lateral (
    select c.id from public.coachings c
    where c.trainer_id = g.trainer_id and c.client_id = auth.uid() and c.status in ('trial', 'active')
    limit 1) pair on true
  left join public.coachings c on c.id = t.coaching_id
  left join public.profiles p on p.id = coalesce(c.trainer_id, g.trainer_id)
  where t.id = private.active_nutrition_target(auth.uid(), private.client_today(auth.uid()))
$$;

comment on function public.my_nutrition_target() is
  'The caller''s active nutrition target today with its source, its pair, the trainer''s name and, for a group '
  'template, the group''s name.';
revoke all on function public.my_nutrition_target() from public, anon;
grant execute on function public.my_nutrition_target() to authenticated;

-- Tidier exercise library in Russian (PRD 2.10-1..3): wger has several exercises that read the same once named in
-- Russian («Бег» twice, three «Тяга верхнего блока широким хватом»), and two rows that are not exercises at all
-- (a timer pause and a studio brand). The search now lists one wger exercise per name in the caller's language,
-- preferring the one described in that language, then the oldest; the others stay readable by id, so workouts that
-- use them keep working. The two non-exercises are archived; scripts/wger/build-migration.mjs skips them on refresh.

update public.exercises
set archived_at = now()
where source = 'wger' and wger_id in (1114, 1630) and archived_at is null;

create or replace function public.search_exercises(
  p_query text default null,
  p_locale public.app_locale default 'ru',
  p_category text default null,
  p_own_only boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  category text,
  source public.exercise_source,
  own boolean,
  equipment text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.id, x.name, x.category, x.source, x.own, x.equipment
  from (
    select d.*,
           -- One wger exercise per name: described in p_locale first, then the oldest wger id.
           pg_catalog.row_number() over (
             partition by case when d.source = 'wger' then pg_catalog.lower(d.name) else d.id::text end
             order by d.local_description is null, d.wger_id
           ) as nth
    from (
      select e.id, coalesce(tl.name, ten.name, e.name) as name, e.category, e.source,
             coalesce(e.owner_id = (select auth.uid()), false) as own, e.equipment,
             tl.name as local_name, ten.name as en_name, e.name as base_name,
             tl.description as local_description, e.wger_id
      from public.exercises e
      left join public.exercise_translations tl on tl.exercise_id = e.id and tl.locale = p_locale
      left join public.exercise_translations ten on ten.exercise_id = e.id and ten.locale = 'en'
      where e.archived_at is null
        and (p_category is null or e.category = p_category)
        and (not p_own_only or e.owner_id = (select auth.uid()))
    ) d
  ) x
  -- q: the trimmed query; p: "contains q" as an ILIKE pattern with %, _ and \ taken literally.
  cross join lateral (select nullif(pg_catalog.btrim(p_query), '') as q) q
  cross join lateral (
    select '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(q.q, '\', '\\'), '%', '\%'), '_', '\_')
           || '%' as p
  ) p
  where x.nth = 1
    and (q.q is null or x.local_name ilike p.p or x.en_name ilike p.p or x.base_name ilike p.p)
  order by
    case
      when q.q is null then 0
      when pg_catalog.lower(x.name) like pg_catalog.lower(q.q) || '%' then 0
      when pg_catalog.lower(x.name) like '% ' || pg_catalog.lower(q.q) || '%' then 1
      when x.name ilike p.p then 2
      else 3
    end,
    x.own desc,
    pg_catalog.char_length(x.name),
    x.name,
    x.id
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.search_exercises(text, public.app_locale, text, boolean, integer, integer) is
  'Exercise library search as the caller (RLS applies): name in p_locale, else English; matches RU and EN names; one wger exercise per name.';

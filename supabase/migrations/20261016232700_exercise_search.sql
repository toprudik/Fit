-- Exercise library search (PRD 2.10-1..3, WORK-1, WORK-2): one call finds exercises by any part of their name in
-- Russian or English, in the order a person expects (name starts with the query, then a word does, then the rest),
-- and names each one in the caller's language, else in English (PRD 2.10-3). It runs as the caller, so the
-- exercises policy decides what is found: the wger catalog, the caller's own exercises and those of their trainers.

create function public.search_exercises(
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
    select e.id, coalesce(tl.name, ten.name, e.name) as name, e.category, e.source,
           coalesce(e.owner_id = (select auth.uid()), false) as own, e.equipment,
           tl.name as local_name, ten.name as en_name, e.name as base_name
    from public.exercises e
    left join public.exercise_translations tl on tl.exercise_id = e.id and tl.locale = p_locale
    left join public.exercise_translations ten on ten.exercise_id = e.id and ten.locale = 'en'
    where e.archived_at is null
      and (p_category is null or e.category = p_category)
      and (not p_own_only or e.owner_id = (select auth.uid()))
  ) x
  -- q: the trimmed query; p: "contains q" as an ILIKE pattern with %, _ and \ taken literally.
  cross join lateral (select nullif(pg_catalog.btrim(p_query), '') as q) q
  cross join lateral (
    select '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(q.q, '\', '\\'), '%', '\%'), '_', '\_')
           || '%' as p
  ) p
  where q.q is null or x.local_name ilike p.p or x.en_name ilike p.p or x.base_name ilike p.p
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
  'Exercise library search as the caller (RLS applies): name in p_locale, else English; matches RU and EN names.';
revoke all on function public.search_exercises(text, public.app_locale, text, boolean, integer, integer) from public;
grant execute on function public.search_exercises(text, public.app_locale, text, boolean, integer, integer)
  to authenticated;

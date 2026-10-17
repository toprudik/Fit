-- Trainer analytics «Прогресс» (PRD wave-2 §7, Q31): how the weight and girths of each client changed over a
-- period, only for live pairs whose client shares measurements. A Pro feature like the rest of the analytics.

-- trainer_progress: per pair and measurement kind, the first and the last value logged on the client's local
-- dates [p_from, p_to). A kind with a single measurement in the period has nothing to compare and is left out.
create function public.trainer_progress(p_from date, p_to date)
returns table (coaching_id uuid, kind public.measurement_kind, first_value numeric, last_value numeric, measurements integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.analytics');
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 400 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  return query
  with pairs as (
    select c.id, c.client_id
    from public.coachings c
    where c.trainer_id = v_trainer and c.status in ('trial', 'active')
      and private.can_view(c.client_id, 'measurements')
  ),
  rows as (
    select p.id as coaching_id, m.kind, m.value,
           pg_catalog.row_number() over (partition by p.id, m.kind order by m.measured_at, m.id) as from_start,
           pg_catalog.row_number() over (partition by p.id, m.kind order by m.measured_at desc, m.id desc) as from_end,
           pg_catalog.count(*) over (partition by p.id, m.kind) as total
    from pairs p
    join public.measurements m on m.client_id = p.client_id
    where m.local_date >= p_from and m.local_date < p_to
  )
  select r.coaching_id, r.kind,
         pg_catalog.max(r.value) filter (where r.from_start = 1),
         pg_catalog.max(r.value) filter (where r.from_end = 1),
         pg_catalog.max(r.total)::integer
  from rows r
  where r.total >= 2
  group by r.coaching_id, r.kind;
end $$;

comment on function public.trainer_progress(date, date) is
  'First and last weight and girths per live pair over a period, for clients who share measurements (wave-2 §7).';
revoke all on function public.trainer_progress(date, date) from public, anon;
grant execute on function public.trainer_progress(date, date) to authenticated;

-- Group adherence (PRD wave-2 §6 rule 8): group_analytics also gives the average adherence of its members over
-- the last 30 full days. Only members who share nutrition and had at least one day judged against a target count;
-- under three such clients the average stays null, like attendance and weight.

drop function public.group_analytics(uuid);

create function public.group_analytics(p_group_id uuid)
returns table (members integer, attendance numeric, attendance_clients integer, weight_change_kg numeric, weight_clients integer,
               adherence integer, adherence_clients integer)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (select (private.own_group(p_group_id)).id as id),
  pairs as (
    select c.id, c.client_id
    from public.group_members m join g on g.id = m.group_id
    join public.coachings c on c.id = m.coaching_id and c.status in ('trial', 'active')),
  marks as (
    select b.coaching_id, pg_catalog.count(*) filter (where b.status = 'attended') as attended, pg_catalog.count(*) as marked
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.coaching_id in (select id from pairs) and b.status in ('attended', 'no_show')
      and s.starts_at >= pg_catalog.now() - interval '30 days' and s.starts_at < pg_catalog.now()
    group by b.coaching_id),
  weights as (
    select p.client_id,
      (select w.value from public.measurements w where w.client_id = p.client_id and w.kind = 'weight'
         and w.measured_at >= pg_catalog.now() - interval '30 days' order by w.measured_at desc limit 1)
      - (select w.value from public.measurements w where w.client_id = p.client_id and w.kind = 'weight'
         and w.measured_at >= pg_catalog.now() - interval '30 days' order by w.measured_at limit 1) as change
    from pairs p
    where private.can_view(p.client_id, 'measurements')),
  adherence as (
    select private.adherence_share(a.in_norm, a.counted) as share
    from pairs p
    cross join lateral (select private.client_today(p.client_id) as today) d
    cross join lateral private.adherence_counts(p.client_id, d.today - 30, d.today - 1) a
    where private.can_view(p.client_id, 'nutrition') and a.counted > 0)
  select
    (select pg_catalog.count(*)::integer from pairs),
    case when (select pg_catalog.count(*) from marks) >= 3
      then pg_catalog.round((select pg_catalog.sum(attended)::numeric / pg_catalog.sum(marked) from marks), 3) end,
    (select pg_catalog.count(*)::integer from marks),
    case when (select pg_catalog.count(*) from weights where change is not null) >= 3
      then pg_catalog.round((select pg_catalog.avg(change) from weights where change is not null), 1) end,
    (select pg_catalog.count(*)::integer from weights where change is not null),
    case when (select pg_catalog.count(*) from adherence) >= 3
      then pg_catalog.round((select pg_catalog.avg(share) from adherence))::integer end,
    (select pg_catalog.count(*)::integer from adherence)
$$;
comment on function public.group_analytics(uuid) is
  'Members, attendance over 30 days, average weight change and average adherence of a group (wave-2 §6 rule 8); null under 3 clients.';
revoke all on function public.group_analytics(uuid) from public, anon;
grant execute on function public.group_analytics(uuid) to authenticated;

-- Owner statistics for investors (/admin/stats): the platform as of now, week by week and as weekly sign-up
-- cohorts. Counts and money totals per currency only, never a person's name, contact or amount. Reuses the
-- analytics helpers of 20261017023400_admin_analytics.sql (held sessions, live clients, last activity).
-- Weeks are ISO weeks in UTC, Monday first.

-- A guard of its own: the analytics guard also checks the period, these take a number of weeks.
create function private.assert_owner_metrics(p_weeks integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins see the owner statistics';
  end if;
  if p_weeks is null or p_weeks not between 4 and 52 then
    raise exception 'invalid_weeks' using errcode = '22023';
  end if;
end $$;

comment on function private.assert_owner_metrics(integer) is
  'Owner statistics guard: the caller is an admin and the number of weeks is 4 to 52.';
revoke all on function private.assert_owner_metrics(integer) from public;

-- Confirmed payments minus refunds in [p_from, p_to), per currency in minor units: what passed through trainers.
create function private.owner_turnover(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_object_agg(r.currency, r.total), '{}'::jsonb)
  from (
    select y.currency, sum(case when y.direction = 'in' then y.amount_minor else -y.amount_minor end) as total
    from public.payments y
    where y.status = 'confirmed' and y.paid_at >= p_from and y.paid_at < p_to
    group by y.currency
  ) r
$$;

comment on function private.owner_turnover(timestamptz, timestamptz) is
  'Confirmed payments in the range, refunds subtracted, per currency in minor units.';
revoke all on function private.owner_turnover(timestamptz, timestamptz) from public;

-- admin_owner_summary ------------------------------------------------------------------------------------

create function public.admin_owner_summary()
returns table (
  users                     integer,
  trainers                  integer,
  trainers_verified         integer,
  clients                   integer,
  cards                     integer,
  pairs                     integer,
  dau                       integer,
  wau                       integer,
  mau                       integer,
  trainers_active_7         integer,
  trainers_active_30        integer,
  clients_active_7          integer,
  clients_active_30         integer,
  held_sessions             integer,
  attended                  integer,
  bookings                  integer,
  passes_sold               integer,
  turnover                  jsonb,
  turnover_30               jsonb,
  trainer_invites_created   integer,
  trainer_invites_redeemed  integer,
  trainer_referrals         integer,
  client_referrals          integer,
  client_referrals_qualified integer,
  joins_by_source           jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner_metrics(4);

  return query
  with accounts as (
    select p.id, private.analytics_last_active(p.id) as last_active,
           exists (select 1 from public.trainer_profiles t where t.user_id = p.id) as is_trainer
    from public.profiles p
    where p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()
  ),
  clients as (select id from private.analytics_clients() as id),
  opens as (
    select o.user_id, o.opened_at from public.app_opens o
    where o.opened_at > pg_catalog.now() - interval '30 days'
  )
  select
    (select count(*)::integer from accounts),
    (select count(*)::integer from public.trainer_profiles),
    (select count(*)::integer from public.trainer_profiles t where t.verification_status = 'verified'),
    (select count(*)::integer from clients),
    (select count(*)::integer from public.profiles p where p.managed_by_trainer_id is not null),
    (select count(*)::integer from public.coachings c where c.status in ('trial', 'active')),
    (select count(distinct o.user_id)::integer from opens o where o.opened_at > pg_catalog.now() - interval '1 day'),
    (select count(distinct o.user_id)::integer from opens o where o.opened_at > pg_catalog.now() - interval '7 days'),
    (select count(distinct o.user_id)::integer from opens o),
    (select count(*)::integer from accounts a where a.is_trainer and a.last_active > pg_catalog.now() - interval '7 days'),
    (select count(*)::integer from accounts a where a.is_trainer and a.last_active > pg_catalog.now() - interval '30 days'),
    (select count(*)::integer from accounts a
     where a.id in (select id from clients) and a.last_active > pg_catalog.now() - interval '7 days'),
    (select count(*)::integer from accounts a
     where a.id in (select id from clients) and a.last_active > pg_catalog.now() - interval '30 days'),
    (select count(*)::integer from private.analytics_held_sessions('-infinity', pg_catalog.now())),
    (select count(*)::integer from public.bookings b where b.status = 'attended'),
    (select count(*)::integer from public.bookings b),
    (select count(*)::integer from public.passes ps where ps.status <> 'cancelled'),
    private.owner_turnover('-infinity', pg_catalog.now() + interval '1 day'),
    private.owner_turnover(pg_catalog.now() - interval '30 days', pg_catalog.now() + interval '1 day'),
    (select count(*)::integer from public.trainer_invites i),
    (select count(*)::integer from public.trainer_invites i where i.redeemed_at is not null),
    (select count(*)::integer from public.referrals r where r.kind = 'trainer_to_trainer'),
    (select count(*)::integer from public.referrals r where r.kind = 'client_to_client'),
    (select count(*)::integer from public.referrals r where r.kind = 'client_to_client' and r.status = 'qualified'),
    coalesce((
      select pg_catalog.jsonb_object_agg(s.source, s.n)
      from (select c.source, count(*)::integer as n from public.coachings c group by c.source) s), '{}'::jsonb);
end $$;

comment on function public.admin_owner_summary() is
  'Admin: the platform as of now for the owner''s statistics (/admin/stats). Counts and per-currency totals only.';
revoke all on function public.admin_owner_summary() from public, anon;
grant execute on function public.admin_owner_summary() to authenticated;

-- admin_owner_weekly -------------------------------------------------------------------------------------

create function public.admin_owner_weekly(p_weeks integer default 12)
returns table (
  week_start               date,
  new_users                integer,
  new_trainers             integer,
  new_pairs                integer,
  active_users             integer,
  active_trainers          integer,
  active_clients           integer,
  held_sessions            integer,
  attended                 integer,
  bookings                 integer,
  passes_sold              integer,
  turnover                 jsonb,
  trainer_invites_created  integer,
  trainer_invites_redeemed integer,
  referrals                integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_this_week date := pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'UTC')::date;
begin
  perform private.assert_owner_metrics(p_weeks);

  return query
  with weeks as (
    select w::date as day,
           (w::date)::timestamp at time zone 'UTC' as starts,
           ((w::date) + 7)::timestamp at time zone 'UTC' as ends
    from pg_catalog.generate_series(v_this_week - (p_weeks - 1) * 7, v_this_week, interval '7 days') as w
  )
  select
    w.day,
    (select count(*)::integer from public.profiles p
     where p.created_at >= w.starts and p.created_at < w.ends
       and p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()),
    (select count(*)::integer from public.trainer_profiles t where t.created_at >= w.starts and t.created_at < w.ends),
    (select count(*)::integer from public.coachings c where c.started_at >= w.starts and c.started_at < w.ends),
    (select count(distinct o.user_id)::integer from public.app_opens o where o.opened_at >= w.starts and o.opened_at < w.ends),
    (select count(distinct o.user_id)::integer from public.app_opens o
     where o.opened_at >= w.starts and o.opened_at < w.ends
       and exists (select 1 from public.trainer_profiles t where t.user_id = o.user_id)),
    (select count(distinct o.user_id)::integer from public.app_opens o
     where o.opened_at >= w.starts and o.opened_at < w.ends
       and exists (select 1 from public.coachings c where c.client_id = o.user_id)),
    (select count(*)::integer from private.analytics_held_sessions(w.starts, w.ends)),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.status = 'attended' and s.starts_at >= w.starts and s.starts_at < w.ends),
    (select count(*)::integer from public.bookings b where b.created_at >= w.starts and b.created_at < w.ends),
    (select count(*)::integer from public.passes ps
     where ps.status <> 'cancelled' and ps.created_at >= w.starts and ps.created_at < w.ends),
    private.owner_turnover(w.starts, w.ends),
    (select count(*)::integer from public.trainer_invites i where i.created_at >= w.starts and i.created_at < w.ends),
    (select count(*)::integer from public.trainer_invites i where i.redeemed_at >= w.starts and i.redeemed_at < w.ends),
    (select count(*)::integer from public.referrals r where r.created_at >= w.starts and r.created_at < w.ends)
  from weeks w
  order by w.day;
end $$;

comment on function public.admin_owner_weekly(integer) is
  'Admin: the last p_weeks ISO weeks (UTC, the current one included) for the owner''s statistics. Counts only.';
revoke all on function public.admin_owner_weekly(integer) from public, anon;
grant execute on function public.admin_owner_weekly(integer) to authenticated;

-- admin_owner_cohorts ------------------------------------------------------------------------------------

-- For each sign-up week, its size and how many of those accounts opened the app in week 0, 1, 2, ... after it,
-- up to the current week. Week 0 is the sign-up week itself.
create function public.admin_owner_cohorts(p_weeks integer default 8)
returns table (cohort_week date, size integer, retained integer[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_this_week date := pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'UTC')::date;
begin
  perform private.assert_owner_metrics(p_weeks);

  return query
  with members as (
    select p.id, pg_catalog.date_trunc('week', p.created_at at time zone 'UTC')::date as cohort
    from public.profiles p
    where p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()
      and p.created_at >= (v_this_week - (p_weeks - 1) * 7)::timestamp at time zone 'UTC'
  ),
  cohorts as (
    select w::date as cohort from pg_catalog.generate_series(v_this_week - (p_weeks - 1) * 7, v_this_week, interval '7 days') w
  )
  select
    c.cohort,
    (select count(*)::integer from members m where m.cohort = c.cohort),
    array(
      select (
        select count(distinct o.user_id)::integer
        from public.app_opens o
        join members m on m.id = o.user_id and m.cohort = c.cohort
        where o.opened_at >= (c.cohort + k * 7)::timestamp at time zone 'UTC'
          and o.opened_at < (c.cohort + k * 7 + 7)::timestamp at time zone 'UTC'
      )
      from pg_catalog.generate_series(0, (v_this_week - c.cohort) / 7) k
      order by k
    )
  from cohorts c
  order by c.cohort;
end $$;

comment on function public.admin_owner_cohorts(integer) is
  'Admin: weekly sign-up cohorts of the last p_weeks weeks with the accounts that opened the app in each later week.';
revoke all on function public.admin_owner_cohorts(integer) from public, anon;
grant execute on function public.admin_owner_cohorts(integer) to authenticated;

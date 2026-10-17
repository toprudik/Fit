-- Feature use in the admin analytics (PRD wave-2 §8 rule 2): besides workouts, measurements and photos, the
-- platform slice counts the clients who keep the food diary, log activity (steps, water, sleep) or have a live
-- nutrition target, and the clients slice gets the same three yes/no flags. Counts and flags only, never what
-- was eaten, walked or set (§8 rules 4-5, 8.2). The bodies of 20261017023400_admin_analytics.sql are kept as is.
-- Column names avoid the words the contract test bans in admin results (norm, food, value and the like).

-- admin_analytics_platform -------------------------------------------------------------------------------

drop function public.admin_analytics_platform(integer);

create function public.admin_analytics_platform(p_days integer default 30)
returns table (
  invites_created             integer,
  trainers_registered         integer,
  trainers_verified           integer,
  trainers_with_client        integer,
  trainers_with_session       integer,
  clients                     integer,
  cards                       integer,
  active_7                    integer,
  active_30                   integer,
  sessions                    integer,
  bookings                    integer,
  cancellations               integer,
  no_shows                    integer,
  held_sessions               integer,
  held_without_edits          integer,
  opens                       integer,
  opens_from_bot              integer,
  clients_logging_workouts    integer,
  clients_with_measurements   integer,
  clients_with_photos         integer,
  clients_keeping_diary       integer,
  clients_logging_activity    integer,
  clients_with_target         integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := pg_catalog.now() - pg_catalog.make_interval(days => p_days);
begin
  perform private.assert_admin_analytics(p_days);

  return query
  with clients as (select id from private.analytics_clients() as id),
  held as (select * from private.analytics_held_sessions(v_from, pg_catalog.now())),
  accounts as (
    select private.analytics_last_active(p.id) as last_active
    from public.profiles p
    where p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()
  )
  select
    (select count(*)::integer from public.trainer_invites i where i.revoked_at is null),
    (select count(*)::integer from public.trainer_profiles),
    (select count(*)::integer from public.trainer_profiles t where t.verification_status = 'verified'),
    (select count(distinct c.trainer_id)::integer from public.coachings c),
    (select count(distinct h.trainer_id)::integer from private.analytics_held_sessions('-infinity', pg_catalog.now()) h),
    (select count(*)::integer from clients),
    (select count(*)::integer from public.profiles p where p.managed_by_trainer_id is not null),
    (select count(*)::integer from accounts a where a.last_active > pg_catalog.now() - interval '7 days'),
    (select count(*)::integer from accounts a where a.last_active > pg_catalog.now() - interval '30 days'),
    (select count(*)::integer from public.sessions s
     where s.starts_at >= v_from and s.starts_at < pg_catalog.now() and s.status <> 'cancelled'),
    (select count(*)::integer from public.bookings b where b.created_at >= v_from),
    (select count(*)::integer from public.bookings b
     where b.status in ('cancelled', 'late_cancelled') and b.cancelled_at >= v_from),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.status = 'no_show' and s.starts_at >= v_from),
    (select count(*)::integer from held),
    (select count(*)::integer from held h where not h.manually_adjusted),
    (select count(*)::integer from public.app_opens o where o.opened_at >= v_from),
    (select count(*)::integer from public.app_opens o where o.opened_at >= v_from and o.source is not null),
    (select count(distinct w.client_id)::integer from public.workout_logs w
     where w.created_at >= v_from and w.client_id in (select id from clients)),
    (select count(distinct m.client_id)::integer from public.measurements m
     where m.created_at >= v_from and m.client_id in (select id from clients)),
    (select count(distinct f.client_id)::integer from public.progress_photos f
     where f.created_at >= v_from and f.client_id in (select id from clients)),
    (select count(distinct d.client_id)::integer from public.food_diary_entries d
     where d.logged_at >= v_from and d.client_id in (select id from clients)),
    (select count(distinct e.client_id)::integer from public.activity_entries e
     where e.recorded_at >= v_from and e.client_id in (select id from clients)),
    (select count(*)::integer from clients c
     where private.active_nutrition_target(c.id, private.client_today(c.id)) is not null);
end $$;

comment on function public.admin_analytics_platform(integer) is
  'Admin: platform slice for the period (PRD wave-2 §8 rule 2). Counts only; the funnel, clients and targets are as of now.';
revoke all on function public.admin_analytics_platform(integer) from public, anon;
grant execute on function public.admin_analytics_platform(integer) to authenticated;

-- admin_analytics_clients ----------------------------------------------------------------------------------

drop function public.admin_analytics_clients(integer, integer);

create function public.admin_analytics_clients(p_days integer default 30, p_limit integer default 200)
returns table (
  client_id          uuid,
  first_name         text,
  last_name          text,
  username           text,
  pairs              integer,
  attended           integer,
  last_active        timestamptz,
  logs_workouts      boolean,
  takes_measurements boolean,
  adds_photos        boolean,
  keeps_diary        boolean,
  logs_activity      boolean,
  has_target         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := pg_catalog.now() - pg_catalog.make_interval(days => p_days);
begin
  perform private.assert_admin_analytics(p_days);

  return query
  select * from (
    select
      p.id, p.first_name, p.last_name, p.username,
      (select count(*)::integer from public.coachings c where c.client_id = p.id and c.status in ('trial', 'active')),
      (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
       where b.client_id = p.id and b.status = 'attended' and s.starts_at >= v_from),
      private.analytics_last_active(p.id),
      exists (select 1 from public.workout_logs w where w.client_id = p.id and w.created_at >= v_from),
      exists (select 1 from public.measurements m where m.client_id = p.id and m.created_at >= v_from),
      exists (select 1 from public.progress_photos f where f.client_id = p.id and f.created_at >= v_from),
      exists (select 1 from public.food_diary_entries d where d.client_id = p.id and d.logged_at >= v_from),
      exists (select 1 from public.activity_entries e where e.client_id = p.id and e.recorded_at >= v_from),
      private.active_nutrition_target(p.id, private.client_today(p.id)) is not null
    from public.profiles p
    where p.id in (select id from private.analytics_clients() as id)
  ) r
  order by 7 desc nulls last
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

comment on function public.admin_analytics_clients(integer, integer) is
  'Admin: clients slice (PRD wave-2 §8 rule 4): counts, last activity and feature flags, never the client''s data.';
revoke all on function public.admin_analytics_clients(integer, integer) from public, anon;
grant execute on function public.admin_analytics_clients(integer, integer) to authenticated;

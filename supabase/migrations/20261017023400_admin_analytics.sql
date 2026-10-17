-- Extended admin analytics (PRD wave-2 §8, Q41; screens.md «Аналитика» /admin/analytics):
--   * app_opens: every opening of the app, with the bot button it came from (?source=<notification type>), the
--     only new fact the metrics need; the app records it through record_app_open.
--   * admin_analytics_platform: the trainer funnel, clients, active accounts, sessions, bookings, cancellations
--     and no-shows, sessions without manual edits, opens from bot buttons, feature use (shares, never values).
--   * admin_analytics_trainers / admin_analytics_trainer: one row per trainer; opening one trainer is written to
--     the audit log (§8 rule 1, 8.3).
--   * admin_analytics_clients: activity metadata per client, booleans for features, nothing of the client's
--     data: no food, norm, measurements, photos, activity, intake or notes (§8 rules 4-5, 8.2).
--   * admin_beta_metrics: the three Q26 metrics over the last 14 days (§8 rule 6, 8.4).
-- At beta scale (5 trainers) the functions count live; data-model §5.4 keeps the nightly materialized views for
-- when the platform outgrows that. Every function is a definer that refuses anyone without the admin role.

-- app_opens ----------------------------------------------------------------------------------------------

create table public.app_opens (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  source    public.notification_type,                 -- the bot message whose button opened the app; null = directly
  opened_at timestamptz not null default now()
);

comment on table public.app_opens is
  'One opening of the app by a signed-in user (beta metric «открытия из напоминаний», Q26). Written only by record_app_open.';
comment on column public.app_opens.source is 'Type of the bot message whose button opened the app (?source=); null when opened directly.';

create index app_opens_user_id_opened_at_idx on public.app_opens (user_id, opened_at desc);
create index app_opens_opened_at_idx on public.app_opens (opened_at);

alter table public.app_opens enable row level security;
revoke all on table public.app_opens from anon, authenticated;
revoke all on sequence public.app_opens_id_seq from anon, authenticated;

-- record_app_open: the app calls it once when a tab loads. A repeat with the same source within 30 minutes is
-- the same visit (a reload, a second tab) and is not counted again. An unknown source counts as a direct open.
create function public.record_app_open(p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_source public.notification_type;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source is not null and p_source = any (enum_range(null::public.notification_type)::text[]) then
    v_source := p_source::public.notification_type;
  end if;

  insert into public.app_opens (user_id, source)
  select v_user, v_source
  where not exists (
    select 1 from public.app_opens o
    where o.user_id = v_user and o.source is not distinct from v_source
      and o.opened_at > pg_catalog.now() - interval '30 minutes'
  );
end $$;

comment on function public.record_app_open(text) is
  'Records that the signed-in user opened the app, from a bot button (?source=) or directly; repeats within 30 minutes are one visit.';
revoke all on function public.record_app_open(text) from public, anon;
grant execute on function public.record_app_open(text) to authenticated;

-- Helpers ------------------------------------------------------------------------------------------------

create function private.assert_admin_analytics(p_days integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins see the analytics';
  end if;
  if p_days is null or p_days not in (7, 14, 30, 90) then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
end $$;

comment on function private.assert_admin_analytics(integer) is
  'Admin analytics guard: the caller is an admin and the period is 7, 14, 30 or 90 days.';
revoke all on function private.assert_admin_analytics(integer) from public;

-- A held session: it has ended, was not cancelled, and someone was confirmed on it or attended it.
create function private.analytics_held_sessions(p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, trainer_id uuid, starts_at timestamptz, manually_adjusted boolean)
language sql
stable
set search_path = ''
as $$
  select s.id, s.trainer_id, s.starts_at, s.manually_adjusted_at is not null
  from public.sessions s
  where s.starts_at >= p_from and s.starts_at < p_to and s.ends_at <= pg_catalog.now()
    and s.status <> 'cancelled'
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.status in ('confirmed', 'attended'))
$$;

comment on function private.analytics_held_sessions(timestamptz, timestamptz) is
  'Sessions held in the window: ended, not cancelled, with a confirmed or attended booking (Q26 definitions).';
revoke all on function private.analytics_held_sessions(timestamptz, timestamptz) from public;

-- Last activity of an account: the later of its last sign-in and its last recorded opening.
create function private.analytics_last_active(p_user_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    (select p.last_seen_at from public.profiles p where p.id = p_user_id),
    (select max(o.opened_at) from public.app_opens o where o.user_id = p_user_id)
  )
$$;

comment on function private.analytics_last_active(uuid) is 'The later of an account''s last sign-in and its last recorded app opening.';
revoke all on function private.analytics_last_active(uuid) from public;

-- Real client accounts with a live pair: not a trainer's card and not the deleted-client stub.
create function private.analytics_clients()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select distinct c.client_id
  from public.coachings c
  where c.status in ('trial', 'active') and private.is_admin_visible_account(c.client_id)
$$;

comment on function private.analytics_clients() is 'Accounts (not cards) that are the client of at least one live pair.';
revoke all on function private.analytics_clients() from public;

-- admin_analytics_platform ---------------------------------------------------------------------------------

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
  clients_with_photos         integer
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
     where f.created_at >= v_from and f.client_id in (select id from clients));
end $$;

comment on function public.admin_analytics_platform(integer) is
  'Admin: platform slice for the period (PRD wave-2 §8 rule 2). Counts only; the funnel and clients are all-time.';
revoke all on function public.admin_analytics_platform(integer) from public, anon;
grant execute on function public.admin_analytics_platform(integer) to authenticated;

-- admin_analytics_trainers ---------------------------------------------------------------------------------

create function private.analytics_trainers(p_days integer, p_trainer_id uuid)
returns table (
  trainer_id          uuid,
  first_name          text,
  last_name           text,
  username            text,
  verification_status public.verification_status,
  clients             integer,
  held_sessions       integer,
  attended            integer,
  no_shows            integer,
  earned              jsonb,
  received            jsonb,
  ending_passes       integer,
  last_active         timestamptz,
  opens               integer,
  uses_passes         boolean,
  uses_repeats        boolean,
  uses_groups         boolean,
  uses_workout_templates boolean
)
language sql
stable
set search_path = ''
as $$
  select
    t.user_id, p.first_name, p.last_name, p.username, t.verification_status,
    (select count(*)::integer from public.coachings c where c.trainer_id = t.user_id and c.status in ('trial', 'active')),
    (select count(*)::integer from private.analytics_held_sessions(pg_catalog.now() - pg_catalog.make_interval(days => p_days),
       pg_catalog.now()) h where h.trainer_id = t.user_id),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.trainer_id = t.user_id and b.status = 'attended'
       and s.starts_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.trainer_id = t.user_id and b.status = 'no_show'
       and s.starts_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    -- Earned: the money value of sessions charged in the period, net of waivers (per currency, minor units).
    coalesce((
      select pg_catalog.jsonb_object_agg(e.currency, e.total)
      from (
        select l.currency, sum(l.amount_minor) as total
        from public.ledger_entries l
        where l.trainer_id = t.user_id and l.currency is not null
          and l.entry_type in ('charge', 'waiver', 'settlement', 'settlement_reversal')
          and l.occurred_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
        group by l.currency
        having sum(l.amount_minor) <> 0
      ) e), '{}'::jsonb),
    -- Received: confirmed payments in the period, refunds subtracted.
    coalesce((
      select pg_catalog.jsonb_object_agg(r.currency, r.total)
      from (
        select y.currency, sum(case when y.direction = 'in' then y.amount_minor else -y.amount_minor end) as total
        from public.payments y
        where y.trainer_id = t.user_id and y.status = 'confirmed'
          and y.paid_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
        group by y.currency
      ) r), '{}'::jsonb),
    (select count(*)::integer from public.passes ps
     where ps.trainer_id = t.user_id and ps.status = 'active'
       and ps.expires_at > pg_catalog.now() and ps.expires_at <= pg_catalog.now() + interval '14 days'),
    private.analytics_last_active(t.user_id),
    (select count(*)::integer from public.app_opens o
     where o.user_id = t.user_id and o.opened_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    exists (select 1 from public.passes ps where ps.trainer_id = t.user_id),
    exists (select 1 from public.recurrences r where r.trainer_id = t.user_id),
    exists (select 1 from public.sessions s where s.trainer_id = t.user_id and s.kind = 'group'),
    exists (select 1 from public.workout_templates w where w.owner_id = t.user_id)
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  where p_trainer_id is null or t.user_id = p_trainer_id
$$;

comment on function private.analytics_trainers(integer, uuid) is
  'One analytics row per trainer (PRD wave-2 §8 rule 3); all trainers when p_trainer_id is null.';
revoke all on function private.analytics_trainers(integer, uuid) from public;

create function public.admin_analytics_trainers(p_days integer default 30)
returns table (
  trainer_id          uuid,
  first_name          text,
  last_name           text,
  username            text,
  verification_status public.verification_status,
  clients             integer,
  held_sessions       integer,
  attended            integer,
  no_shows            integer,
  earned              jsonb,
  received            jsonb,
  ending_passes       integer,
  last_active         timestamptz,
  opens               integer,
  uses_passes         boolean,
  uses_repeats        boolean,
  uses_groups         boolean,
  uses_workout_templates boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_analytics(p_days);
  return query select * from private.analytics_trainers(p_days, null) a order by a.held_sessions desc, a.clients desc;
end $$;

comment on function public.admin_analytics_trainers(integer) is 'Admin: trainers slice for the period (PRD wave-2 §8 rule 3).';
revoke all on function public.admin_analytics_trainers(integer) from public, anon;
grant execute on function public.admin_analytics_trainers(integer) to authenticated;

-- admin_analytics_trainer: one trainer, and the opening is written to the audit log (§8 rule 1, 8.3). Weeks
-- holds held sessions per week for the last 8 weeks, oldest first.
create function public.admin_analytics_trainer(p_trainer_id uuid, p_days integer default 30)
returns table (
  trainer_id          uuid,
  first_name          text,
  last_name           text,
  username            text,
  verification_status public.verification_status,
  clients             integer,
  held_sessions       integer,
  attended            integer,
  no_shows            integer,
  earned              jsonb,
  received            jsonb,
  ending_passes       integer,
  last_active         timestamptz,
  opens               integer,
  uses_passes         boolean,
  uses_repeats        boolean,
  uses_groups         boolean,
  uses_workout_templates boolean,
  weeks               integer[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_analytics(p_days);
  if not exists (select 1 from public.trainer_profiles t where t.user_id = p_trainer_id) then
    raise exception 'trainer_not_found' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'analytics.view_trainer', 'trainer', p_trainer_id, pg_catalog.jsonb_build_object('days', p_days));

  return query
  select a.*, array(
    select (select count(*)::integer from private.analytics_held_sessions(
              pg_catalog.now() - pg_catalog.make_interval(weeks => w), pg_catalog.now() - pg_catalog.make_interval(weeks => w - 1)) h
            where h.trainer_id = p_trainer_id)
    from pg_catalog.generate_series(8, 1, -1) w
  )
  from private.analytics_trainers(p_days, p_trainer_id) a;
end $$;

comment on function public.admin_analytics_trainer(uuid, integer) is
  'Admin: one trainer''s analytics with held sessions per week for 8 weeks; each call is written to admin_audit_log.';
revoke all on function public.admin_analytics_trainer(uuid, integer) from public, anon;
grant execute on function public.admin_analytics_trainer(uuid, integer) to authenticated;

-- admin_analytics_clients ----------------------------------------------------------------------------------

create function public.admin_analytics_clients(p_days integer default 30, p_limit integer default 200)
returns table (
  client_id         uuid,
  first_name        text,
  last_name         text,
  username          text,
  pairs             integer,
  attended          integer,
  last_active       timestamptz,
  logs_workouts     boolean,
  takes_measurements boolean,
  adds_photos       boolean
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
      exists (select 1 from public.progress_photos f where f.client_id = p.id and f.created_at >= v_from)
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

-- admin_beta_metrics -----------------------------------------------------------------------------------------

-- The Q26 metrics over the last 14 days (§8 rule 6, 8.4; definitions in PRD wave-1 §1):
--   * trainers on schedule: verified trainers with a held session in each of the last two weeks;
--   * held sessions without manual edits (target 80%);
--   * opens from bot buttons, against the 14 days before (target: growth).
create function public.admin_beta_metrics()
returns table (
  trainers_total       integer,
  trainers_on_schedule integer,
  held_sessions        integer,
  held_without_edits   integer,
  opens                integer,
  opens_from_bot       integer,
  opens_from_bot_prev  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_analytics(14);

  return query
  with held as (select * from private.analytics_held_sessions(pg_catalog.now() - interval '14 days', pg_catalog.now()))
  select
    (select count(*)::integer from public.trainer_profiles t where t.verification_status = 'verified'),
    (select count(*)::integer from public.trainer_profiles t
     where t.verification_status = 'verified'
       and exists (select 1 from held h where h.trainer_id = t.user_id and h.starts_at < pg_catalog.now() - interval '7 days')
       and exists (select 1 from held h where h.trainer_id = t.user_id and h.starts_at >= pg_catalog.now() - interval '7 days')),
    (select count(*)::integer from held),
    (select count(*)::integer from held h where not h.manually_adjusted),
    (select count(*)::integer from public.app_opens o where o.opened_at >= pg_catalog.now() - interval '14 days'),
    (select count(*)::integer from public.app_opens o
     where o.opened_at >= pg_catalog.now() - interval '14 days' and o.source is not null),
    (select count(*)::integer from public.app_opens o
     where o.opened_at >= pg_catalog.now() - interval '28 days' and o.opened_at < pg_catalog.now() - interval '14 days'
       and o.source is not null);
end $$;

comment on function public.admin_beta_metrics() is 'Admin: the three Q26 beta metrics over the last 14 days (PRD wave-2 §8.4).';
revoke all on function public.admin_beta_metrics() from public, anon;
grant execute on function public.admin_beta_metrics() to authenticated;

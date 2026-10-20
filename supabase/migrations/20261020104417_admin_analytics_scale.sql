-- Admin analytics that scales with the number of trainers. private.analytics_trainers counted held sessions,
-- attended bookings and no-shows in a subquery per trainer; the held sessions came from a function scan of the whole
-- window and bookings have no index by trainer for those statuses, so each trainer scanned all of them again.
-- /admin/analytics hit the statement timeout (57014) with ~4 800 trainers: 52 s locally with 20 sessions each, now
-- 0.9 s. The three counts are now taken once for all trainers and joined. Everything else is the body of
-- 20261017222540_admin_ending_passes.sql; supabase/tests/980_admin_analytics_scale.test.sql compares the two.

create or replace function private.analytics_trainers(p_days integer, p_trainer_id uuid)
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
  -- Held sessions and attendance marks counted once for all trainers, then joined: counting them in a subquery
  -- per trainer scanned every session and booking of the platform for each trainer.
  with held as (
    select h.trainer_id, pg_catalog.count(*)::integer as held
    from private.analytics_held_sessions(pg_catalog.now() - pg_catalog.make_interval(days => p_days), pg_catalog.now()) h
    where p_trainer_id is null or h.trainer_id = p_trainer_id
    group by h.trainer_id
  ), marks as (
    select b.trainer_id,
           (pg_catalog.count(*) filter (where b.status = 'attended'))::integer as attended,
           (pg_catalog.count(*) filter (where b.status = 'no_show'))::integer as no_shows
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.status in ('attended', 'no_show')
      and s.starts_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
      and (p_trainer_id is null or b.trainer_id = p_trainer_id)
    group by b.trainer_id
  )
  select
    t.user_id, p.first_name, p.last_name, p.username, t.verification_status,
    (select count(*)::integer from public.coachings c where c.trainer_id = t.user_id and c.status in ('trial', 'active')),
    coalesce(h.held, 0),
    coalesce(m.attended, 0),
    coalesce(m.no_shows, 0),
    coalesce((
      select pg_catalog.jsonb_object_agg(e.currency, e.earned_minor)
      from private.trainer_earned(t.user_id, pg_catalog.now() - pg_catalog.make_interval(days => p_days), 'infinity') e
      where e.earned_minor <> 0), '{}'::jsonb),
    coalesce((
      select pg_catalog.jsonb_object_agg(r.currency, r.received_minor)
      from private.trainer_received(t.user_id, pg_catalog.now() - pg_catalog.make_interval(days => p_days), 'infinity') r),
      '{}'::jsonb),
    -- Ending passes by the §7 rule: 2 sessions or fewer, or 7 days or fewer with freezes counted.
    (select count(*)::integer from private.trainer_ending_passes(t.user_id)),
    private.analytics_last_active(t.user_id),
    (select count(*)::integer from public.app_opens o
     where o.user_id = t.user_id and o.opened_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    exists (select 1 from public.passes ps where ps.trainer_id = t.user_id),
    exists (select 1 from public.recurrences r where r.trainer_id = t.user_id),
    exists (select 1 from public.sessions s where s.trainer_id = t.user_id and s.kind = 'group'),
    exists (select 1 from public.workout_templates w where w.owner_id = t.user_id)
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  left join held h on h.trainer_id = t.user_id
  left join marks m on m.trainer_id = t.user_id
  where p_trainer_id is null or t.user_id = p_trainer_id
$$;

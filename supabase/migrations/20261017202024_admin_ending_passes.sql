-- Ending passes in the admin analytics (PRD wave-2 §8 rule 3, plan §8.3): the trainers slice counted active
-- passes expiring within 14 days; now it counts them by the same rule as the trainer's own analytics (§7):
-- live passes of live pairs with 2 sessions or fewer left or 7 days or fewer to the expiry, freezes counted
-- (private.trainer_ending_passes). The rest of private.analytics_trainers, as last defined in
-- 20261017034217_trainer_analytics.sql, is unchanged; admin_analytics_trainers and admin_analytics_trainer read
-- it, so both follow.

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
  where p_trainer_id is null or t.user_id = p_trainer_id
$$;

comment on function private.analytics_trainers(integer, uuid) is
  'One analytics row per trainer (PRD wave-2 §8 rule 3); all trainers when p_trainer_id is null. Ending passes by the §7 rule.';
revoke all on function private.analytics_trainers(integer, uuid) from public;

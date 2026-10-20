-- Admin analytics of migration 20261020125417_admin_analytics_scale.sql: private.analytics_trainers answers what its
-- previous body (20261017222540_admin_ending_passes.sql, copied below as tests.old_analytics_trainers) answered, for
-- held and not held sessions, attendance marks inside and outside the window, a trainer with nothing and one trainer
-- asked for by id.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer(t) from unnest(array['trainer_a', 'trainer_b', 'trainer_c']) t;
select tests.create_user(c) from unnest(array['client_d', 'client_e', 'client_f']) c;
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_b', 'client_f');

-- a: held with a confirmed booking 2 days ago, attended 3 days ago, a no-show 20 days ago, attended 40 days ago,
-- a cancelled session, one without bookings and one tomorrow. b: attended yesterday, a no-show 5 days ago.
select tests.create_booking(tests.create_session('trainer_a', now() - interval '2 days'), 'trainer_a', 'client_d');
select tests.create_booking(tests.create_session('trainer_a', now() - interval '3 days'), 'trainer_a', 'client_e', 'attended');
select tests.create_booking(tests.create_session('trainer_a', now() - interval '20 days'), 'trainer_a', 'client_d') as ns_a \gset
update public.bookings set status = 'no_show', attendance_marked_at = now() where id = :'ns_a';
select tests.create_booking(tests.create_session('trainer_a', now() - interval '40 days'), 'trainer_a', 'client_e', 'attended');
select tests.create_booking(tests.create_session('trainer_a', now() + interval '1 day'), 'trainer_a', 'client_d');
select tests.create_session('trainer_a', now() - interval '4 days');
select tests.create_session('trainer_a', now() - interval '6 days') as cancelled \gset
select tests.create_booking(:'cancelled', 'trainer_a', 'client_e');
update public.sessions set status = 'cancelled', cancelled_at = now() where id = :'cancelled';
select tests.create_booking(tests.create_session('trainer_b', now() - interval '1 day'), 'trainer_b', 'client_f', 'attended');
select tests.create_booking(tests.create_session('trainer_b', now() - interval '5 days'), 'trainer_b', 'client_f') as ns_b \gset
update public.bookings set status = 'no_show', attendance_marked_at = now() where id = :'ns_b';

-- The body before 20261020125417.
create function tests.old_analytics_trainers(p_days integer, p_trainer_id uuid)
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

-- Rows of the new body not in the old one and the other way round.
create function tests.differences(p_days integer, p_trainer uuid) returns setof text language sql set search_path = '' as $$
  (select a.trainer_id::text from private.analytics_trainers(p_days, p_trainer) a
   except all select o.trainer_id::text from tests.old_analytics_trainers(p_days, p_trainer) o)
  union all
  (select (n.*)::text from private.analytics_trainers(p_days, p_trainer) n
   except all select (o.*)::text from tests.old_analytics_trainers(p_days, p_trainer) o)
  union all
  (select (o.*)::text from tests.old_analytics_trainers(p_days, p_trainer) o
   except all select (n.*)::text from private.analytics_trainers(p_days, p_trainer) n)
$$;

select is_empty($$ select tests.differences(7, null) $$, 'every trainer over 7 days answers as before');
select is_empty($$ select tests.differences(30, null) $$, 'every trainer over 30 days answers as before');
select is_empty($$ select tests.differences(90, tests.user_id('trainer_a')) $$, 'one trainer by id answers as before');
-- The fixtures reach every count, so "as before" is not "all zero".
select is(
  (select array[a.held_sessions, a.attended, a.no_shows] from private.analytics_trainers(30, null) a
   where a.trainer_id = tests.user_id('trainer_a')),
  array[2, 1, 1], 'a: two held sessions (a no-show alone does not hold one), one attended, one no-show in 30 days');
select is(
  (select array[a.held_sessions, a.attended, a.no_shows] from private.analytics_trainers(30, null) a
   where a.trainer_id = tests.user_id('trainer_c')),
  array[0, 0, 0], 'c has nothing and still has a row');

select * from finish();
rollback;

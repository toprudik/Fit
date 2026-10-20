-- Trainer milestones (marketing 14, viral §2.3): the first 5 clients in DaFit, 100 and 500 held sessions,
-- 4 weeks in a row with marks, the first client who came by a trial link. The same quiet Da-mark as the pair
-- milestones, no points. Each one sends the trainer a bot message they can switch off ("Мои вехи").

alter type public.notification_type add value 'trainer_milestone';

create type public.trainer_milestone_kind as enum ('clients_5', 'sessions_100', 'sessions_500', 'weeks_4', 'first_trial_client');

create table public.trainer_milestones (
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  kind        public.trainer_milestone_kind not null,
  achieved_at timestamptz not null default now(),
  primary key (trainer_id, kind)
);

comment on table public.trainer_milestones is
  'Milestones a trainer reached (marketing 14). Written only by triggers; kept when the counts later drop.';

alter table public.trainer_milestones enable row level security;
revoke all on table public.trainer_milestones from anon, authenticated;

create policy "trainer_milestones: trainer reads own"
  on public.trainer_milestones for select
  to authenticated
  using (trainer_id = (select auth.uid()));

grant select on table public.trainer_milestones to authenticated;

-- Records one milestone and, the first time only, queues the bot message (the trainer may switch the type off).
create function private.grant_trainer_milestone(p_trainer uuid, p_kind public.trainer_milestone_kind, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trainer_milestones (trainer_id, kind, achieved_at)
  values (p_trainer, p_kind, coalesce(p_at, pg_catalog.now()))
  on conflict (trainer_id, kind) do nothing;
  if found then
    perform private.enqueue_notification(
      'trainer_milestone', 'trainer_milestone:' || p_trainer::text || ':' || p_kind::text,
      pg_catalog.jsonb_build_object('milestone', p_kind), p_trainer);
  end if;
end $$;

comment on function private.grant_trainer_milestone(uuid, public.trainer_milestone_kind, timestamptz) is
  'Records a trainer milestone once and queues its trainer_milestone message.';
revoke all on function private.grant_trainer_milestone(uuid, public.trainer_milestone_kind, timestamptz) from public;

-- 100 and 500 held sessions, counted the way "Статистика" in the admin panel and "Мой месяц" count them (Q26,
-- private.analytics_held_sessions): ended, not cancelled, with a confirmed or attended booking; a group is one
-- session whatever its size. The same predicate, narrowed to one trainer so a trigger does not scan every session.
create function private.record_trainer_session_milestones(p_trainer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held integer;
begin
  if exists (select 1 from public.trainer_milestones m where m.trainer_id = p_trainer and m.kind = 'sessions_500') then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trainer_milestones:' || p_trainer::text, 0));
  select count(*) into v_held
  from public.sessions s
  where s.trainer_id = p_trainer and s.ends_at <= pg_catalog.now() and s.status <> 'cancelled'
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.status in ('confirmed', 'attended'));
  if v_held >= 100 then
    perform private.grant_trainer_milestone(p_trainer, 'sessions_100', null);
  end if;
  if v_held >= 500 then
    perform private.grant_trainer_milestone(p_trainer, 'sessions_500', null);
  end if;
end $$;

comment on function private.record_trainer_session_milestones(uuid) is
  'Records the 100 and 500 held-session milestones of a trainer (held as in private.analytics_held_sessions).';
revoke all on function private.record_trainer_session_milestones(uuid) from public;

-- A session counts once it has ended: complete_sessions moves it to completed after its end, and a booking
-- confirmed or marked after the end counts too.
create function private.sessions_record_trainer_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.ends_at <= pg_catalog.now() then
    perform private.record_trainer_session_milestones(new.trainer_id);
  end if;
  return null;
end $$;

comment on function private.sessions_record_trainer_milestones() is
  'Trigger: when an ended session is completed, records the 100 and 500 held-session milestones of its trainer.';
revoke all on function private.sessions_record_trainer_milestones() from public;

create trigger sessions_record_trainer_milestones
  after update of status on public.sessions
  for each row execute function private.sessions_record_trainer_milestones();

create function private.bookings_record_trainer_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('confirmed', 'attended')
     or (tg_op = 'UPDATE' and old.status in ('confirmed', 'attended')) then
    return null;
  end if;
  if exists (select 1 from public.sessions s
             where s.id = new.session_id and s.ends_at <= pg_catalog.now() and s.status <> 'cancelled') then
    perform private.record_trainer_session_milestones(new.trainer_id);
  end if;
  return null;
end $$;

comment on function private.bookings_record_trainer_sessions() is
  'Trigger: a booking confirmed or attended on an ended session may make it held; records the session milestones.';
revoke all on function private.bookings_record_trainer_sessions() from public;

create trigger bookings_record_trainer_sessions
  after insert or update of status on public.bookings
  for each row execute function private.bookings_record_trainer_sessions();

-- The first 5 clients: 5 active pairs at once (cards included). The first trial client: a pair from a trial
-- link that became active, after an attended trial or a pass.
create function private.coachings_record_trainer_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trainer_milestones:' || new.trainer_id::text, 0));
  select count(*) into v_active from public.coachings c where c.trainer_id = new.trainer_id and c.status = 'active';
  if v_active >= 5 then
    perform private.grant_trainer_milestone(new.trainer_id, 'clients_5', null);
  end if;
  if new.source = 'trial_link' then
    perform private.grant_trainer_milestone(new.trainer_id, 'first_trial_client', null);
  end if;
  return null;
end $$;

comment on function private.coachings_record_trainer_milestones() is
  'Trigger: when a pair becomes active, records the 5-clients and first-trial-client milestones of its trainer.';
revoke all on function private.coachings_record_trainer_milestones() from public;

create trigger coachings_record_trainer_milestones
  after insert or update of status on public.coachings
  for each row execute function private.coachings_record_trainer_milestones();

-- 4 weeks in a row with marks: four consecutive weeks (Monday to Sunday in the trainer's time zone), each with
-- at least one booking whose attendance a person marked. Automatic marks after a session ends do not count:
-- the milestone is about using DaFit, not about the calendar running.
create function private.bookings_record_trainer_weeks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz        text;
  v_week      date;
  v_streak    boolean;
begin
  if new.attendance_marked_by is null
     or (tg_op = 'UPDATE' and old.attendance_marked_by is not distinct from new.attendance_marked_by) then
    return null;
  end if;
  if exists (select 1 from public.trainer_milestones m where m.trainer_id = new.trainer_id and m.kind = 'weeks_4') then
    return null;
  end if;
  select p.time_zone into v_tz from public.profiles p where p.id = new.trainer_id;
  select (pg_catalog.date_trunc('week', s.starts_at at time zone coalesce(v_tz, 'Europe/Moscow')))::date into v_week
  from public.sessions s where s.id = new.session_id;
  if v_week is null then
    return null;
  end if;

  -- Any run of 4 weeks that contains this booking's week.
  with marked as (
    select distinct (pg_catalog.date_trunc('week', s.starts_at at time zone coalesce(v_tz, 'Europe/Moscow')))::date as week
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.trainer_id = new.trainer_id
      and b.attendance_marked_by is not null
      and s.status <> 'cancelled'
      and s.starts_at >= ((v_week - 21)::timestamp at time zone coalesce(v_tz, 'Europe/Moscow'))
      and s.starts_at < ((v_week + 28)::timestamp at time zone coalesce(v_tz, 'Europe/Moscow'))
  )
  select exists (
    select 1
    from pg_catalog.generate_series(0, 3) as shift
    where (select count(*) from marked m
           where m.week >= v_week - shift * 7 and m.week < v_week - shift * 7 + 28) = 4
  ) into v_streak;

  if v_streak then
    perform private.grant_trainer_milestone(new.trainer_id, 'weeks_4', null);
  end if;
  return null;
end $$;

comment on function private.bookings_record_trainer_weeks() is
  'Trigger: when a person marks attendance, records the 4-weeks-in-a-row milestone once the trainer has marks in 4 consecutive weeks.';
revoke all on function private.bookings_record_trainer_weeks() from public;

create trigger bookings_record_trainer_weeks
  after insert or update of attendance_marked_by on public.bookings
  for each row execute function private.bookings_record_trainer_weeks();

-- Trainers who are past a threshold already get it now, without a message: the bot does not congratulate on
-- something months old.
insert into public.trainer_milestones (trainer_id, kind)
select s.trainer_id, t.kind
from (select h.trainer_id, count(*) as done from private.analytics_held_sessions('-infinity', 'infinity') h group by h.trainer_id) s
cross join (values (100, 'sessions_100'::public.trainer_milestone_kind), (500, 'sessions_500')) as t (threshold, kind)
where s.done >= t.threshold
on conflict do nothing;

insert into public.trainer_milestones (trainer_id, kind)
select c.trainer_id, 'clients_5'
from public.coachings c
where c.status = 'active'
group by c.trainer_id
having count(*) >= 5
on conflict do nothing;

insert into public.trainer_milestones (trainer_id, kind)
select distinct c.trainer_id, 'first_trial_client'::public.trainer_milestone_kind
from public.coachings c
where c.status = 'active' and c.source = 'trial_link'
on conflict do nothing;

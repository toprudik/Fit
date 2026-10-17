-- Gamification, part 1 (PRD wave-3 §2.1–2.2): streaks and badges.
--
-- Streaks are not stored: they are worked out on read from the client's sessions, logs, food diary and steps, so
-- a late log, an unmarked session or a trainer's cancellation is always reflected. Badges are stored once
-- awarded: the triggers below re-check a client's counts whenever something that feeds a badge changes, award
-- the badges reached and queue a bot message (type "badge", optional). A session badge is taken back when its
-- attended session is unmarked (§2.2-6); the others stay.

-- ---------------------------------------------------------------------------------------------------------
-- Tables

-- The fixed catalogue (§2.2-5). Titles and descriptions live in the app's dictionaries by code.
create table public.badges (
  code      text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  family    text not null check (family in ('sessions', 'workout_streak', 'diary', 'records', 'homework', 'challenge')),
  threshold integer not null check (threshold > 0),
  position  smallint not null unique
);

comment on table public.badges is
  'Badge catalogue (wave-3 §2.2): a family and the count that earns it. Titles are in the app dictionaries.';

insert into public.badges (code, family, threshold, position) values
  ('sessions_1', 'sessions', 1, 1),
  ('sessions_10', 'sessions', 10, 2),
  ('sessions_25', 'sessions', 25, 3),
  ('sessions_50', 'sessions', 50, 4),
  ('sessions_100', 'sessions', 100, 5),
  ('workout_streak_4', 'workout_streak', 4, 6),
  ('workout_streak_12', 'workout_streak', 12, 7),
  ('workout_streak_26', 'workout_streak', 26, 8),
  ('workout_streak_52', 'workout_streak', 52, 9),
  ('diary_7', 'diary', 7, 10),
  ('diary_30', 'diary', 30, 11),
  ('diary_100', 'diary', 100, 12),
  ('records_1', 'records', 1, 13),
  ('records_10', 'records', 10, 14),
  ('homework_10', 'homework', 10, 15);

alter table public.badges enable row level security;
revoke all on table public.badges from anon, authenticated;

create policy "badges: everyone signed in reads"
  on public.badges for select
  to authenticated
  using (true);

grant select on table public.badges to authenticated;

create table public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_code text not null references public.badges (code),
  awarded_at timestamptz not null default now(),
  seen_at    timestamptz,
  primary key (user_id, badge_code)
);

comment on table public.user_badges is
  'Badges a user earned (wave-3 §2.2). Written only by private.award_badges; seen_at is set when the client has '
  'seen the celebration.';

create index user_badges_badge_code_idx on public.user_badges (badge_code);

alter table public.user_badges enable row level security;
revoke all on table public.user_badges from anon, authenticated;

-- The client and every trainer of a live pair (§2.2-8).
create policy "user_badges: owner and trainers read"
  on public.user_badges for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_trainer_of(user_id));

grant select on table public.user_badges to authenticated;

-- The weekly workouts goal of the "Тренировки" streak (§2.1-1): 2 until the client or a trainer sets it.
create table public.workout_week_goals (
  client_id  uuid primary key references public.profiles (id) on delete cascade,
  per_week   smallint not null check (per_week between 1 and 14),
  set_by     uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.workout_week_goals is
  'How many workouts a week keep the client''s "Тренировки" streak (wave-3 §2.1); no row means 2.';

create index workout_week_goals_set_by_idx on public.workout_week_goals (set_by);

alter table public.workout_week_goals enable row level security;
revoke all on table public.workout_week_goals from anon, authenticated;

create policy "workout_week_goals: client and trainers read"
  on public.workout_week_goals for select
  to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

grant select on table public.workout_week_goals to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Streaks

-- Workouts of a client's week (Monday to Sunday by their own day): attended sessions plus logs not tied to a
-- session (own workouts, homework logged as a workout).
create function private.week_workouts(p_user uuid, p_monday date, p_tz text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)::integer
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.client_id = p_user and b.status = 'attended'
      and (s.starts_at at time zone p_tz)::date between p_monday and p_monday + 6
  ) + (
    select count(*)::integer
    from public.workout_logs l
    where l.client_id = p_user and l.booking_id is null and l.local_date between p_monday and p_monday + 6
  )
$$;

comment on function private.week_workouts(uuid, date, text) is
  'Workouts of a client''s week: attended sessions and logs not tied to a session.';
revoke all on function private.week_workouts(uuid, date, text) from public;

create function private.workout_week_goal(p_user uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select g.per_week from public.workout_week_goals g where g.client_id = p_user), 2::smallint)
$$;

comment on function private.workout_week_goal(uuid) is 'The client''s weekly workouts goal, 2 when none is set.';
revoke all on function private.workout_week_goal(uuid) from public;

-- The "Тренировки" streak in weeks, followed up to two years back. The current week counts once its goal is met
-- and never breaks the streak while it lasts. Back from there each week that met the goal adds one; a week in
-- which the trainer cancelled a session of the client or a pass of theirs was frozen is skipped (§2.1-3); the
-- first missed week of each calendar month is covered by that month's freeze, the next miss ends the streak.
create function private.workout_streak(p_user uuid, p_today date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz      text := coalesce((select s.time_zone from public.user_settings s where s.user_id = p_user), 'Europe/Moscow');
  v_goal    smallint := private.workout_week_goal(p_user);
  v_monday  date := p_today - (extract(isodow from p_today)::integer - 1);
  v_from    date := v_monday - 7 * 105;
  v_met     date[];
  v_excused date[];
  v_count   integer := 0;
  v_frozen  date[] := '{}'::date[];
  v_month   date;
begin
  select coalesce(pg_catalog.array_agg(w.monday), '{}') into v_met
  from (
    select x.day - (extract(isodow from x.day)::integer - 1) as monday
    from (
      select (s.starts_at at time zone v_tz)::date as day
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      where b.client_id = p_user and b.status = 'attended' and s.starts_at >= v_from::timestamp at time zone v_tz
      union all
      select l.local_date
      from public.workout_logs l
      where l.client_id = p_user and l.booking_id is null and l.local_date >= v_from
    ) x
    group by 1
    having count(*) >= v_goal
  ) w;

  select coalesce(pg_catalog.array_agg(distinct e.monday), '{}') into v_excused
  from (
    select d - (extract(isodow from d)::integer - 1) as monday
    from (
      select (s.starts_at at time zone v_tz)::date as d
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      where b.client_id = p_user and (s.status = 'cancelled' or b.cancelled_by_role = 'trainer')
        and s.starts_at >= v_from::timestamp at time zone v_tz
      union all
      select g::date
      from public.pass_freezes f
      join public.passes p on p.id = f.pass_id
      cross join lateral pg_catalog.generate_series(
        greatest(lower(f.period), v_from)::timestamp, (upper(f.period) - 1)::timestamp, interval '1 day') g
      where p.client_id = p_user and upper(f.period) > v_from
    ) days
  ) e;

  if v_monday = any (v_met) then
    v_count := 1;
  end if;
  for i in 1..104 loop
    v_monday := v_monday - 7;
    if v_monday = any (v_met) then
      v_count := v_count + 1;
    elsif not v_monday = any (v_excused) then
      v_month := v_monday - (extract(day from v_monday)::integer - 1);
      exit when v_month = any (v_frozen);
      v_frozen := v_frozen || v_month;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.workout_streak(uuid, date) is
  'The client''s "Тренировки" streak in weeks as of p_today (wave-3 §2.1), with excused weeks and a monthly freeze.';
revoke all on function private.workout_streak(uuid, date) from public;

-- A daily streak over the days that qualify: today counts once it qualifies and never breaks the streak; the
-- first missed day of each calendar month is covered by the freeze, the next one ends it.
create function private.day_streak(p_days date[], p_today date)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day    date := p_today;
  v_count  integer := 0;
  v_frozen date[] := '{}'::date[];
  v_month  date;
begin
  if p_today = any (p_days) then
    v_count := 1;
  end if;
  for i in 1..400 loop
    v_day := v_day - 1;
    if v_day = any (p_days) then
      v_count := v_count + 1;
    else
      v_month := v_day - (extract(day from v_day)::integer - 1);
      exit when v_month = any (v_frozen);
      v_frozen := v_frozen || v_month;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.day_streak(date[], date) is
  'Length of a daily streak over the qualifying days, as of p_today, with one freeze per calendar month.';
revoke all on function private.day_streak(date[], date) from public;

-- Days of the last 400 with at least one food diary entry ("Дневник питания").
create function private.diary_days(p_user uuid, p_today date)
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct e.local_date), '{}')
  from public.food_diary_entries e
  where e.client_id = p_user and e.local_date between p_today - 401 and p_today
$$;

comment on function private.diary_days(uuid, date) is 'Days of the last 400 with a food diary entry.';
revoke all on function private.diary_days(uuid, date) from public;

-- Days of the last 400 the steps goal was reached ("Шаги"): the manual steps of the day, else the iOS ones,
-- against the trainer's target of that day, else 8000.
create function private.steps_goal_days(p_user uuid, p_today date)
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(d.local_date), '{}')
  from (
    select distinct on (e.local_date) e.local_date, e.value
    from public.activity_entries e
    where e.client_id = p_user and e.metric = 'steps' and e.local_date between p_today - 401 and p_today
    order by e.local_date, e.source = 'manual' desc
  ) d
  where d.value >= coalesce(
    nullif((select t.steps_target from public.nutrition_targets t
            where t.id = private.active_nutrition_target(p_user, d.local_date)), 0),
    8000)
$$;

comment on function private.steps_goal_days(uuid, date) is 'Days of the last 400 on which the client reached the steps goal.';
revoke all on function private.steps_goal_days(uuid, date) from public;

-- The client's streaks for the screens: weeks of workouts with this week's progress, diary days, steps days.
create function private.streaks_of(p_user uuid)
returns table (workouts integer, week_goal smallint, week_done integer, diary integer, steps integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.user_today(p_user);
  v_tz    text := coalesce((select s.time_zone from public.user_settings s where s.user_id = p_user), 'Europe/Moscow');
begin
  return query select
    private.workout_streak(p_user, v_today),
    private.workout_week_goal(p_user),
    private.week_workouts(p_user, v_today - (extract(isodow from v_today)::integer - 1), v_tz),
    private.day_streak(private.diary_days(p_user, v_today), v_today),
    private.day_streak(private.steps_goal_days(p_user, v_today), v_today);
end $$;

comment on function private.streaks_of(uuid) is 'All streaks of a client as of their today.';
revoke all on function private.streaks_of(uuid) from public;

-- The signed-in client's streaks.
create function public.my_streaks()
returns table (workouts integer, week_goal smallint, week_done integer, diary integer, steps integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.streaks_of((select auth.uid())) where (select auth.uid()) is not null
$$;

comment on function public.my_streaks() is 'Client: own streaks (wave-3 §2.1).';
revoke all on function public.my_streaks() from public, anon;
grant execute on function public.my_streaks() to authenticated;

-- A client's streaks for the trainer of a live pair (§2.1-4): the diary streak only with the nutrition share and
-- the steps streak only with the steps share (null otherwise). No row outside the pair.
create function public.pair_streaks(p_coaching uuid)
returns table (workouts integer, week_goal smallint, week_done integer, diary integer, steps integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_shares public.data_shares;
begin
  select c.client_id into v_client
  from public.coachings c
  where c.id = p_coaching and c.trainer_id = (select auth.uid()) and c.status in ('trial', 'active');
  if v_client is null then
    return;
  end if;
  select * into v_shares from public.data_shares d where d.coaching_id = p_coaching;
  return query
  select s.workouts, s.week_goal, s.week_done,
         case when coalesce(v_shares.nutrition, false) then s.diary end,
         case when coalesce(v_shares.steps, false) then s.steps end
  from private.streaks_of(v_client) s;
end $$;

comment on function public.pair_streaks(uuid) is
  'Trainer: the streaks of the client of a live pair; diary and steps only with their shares.';
revoke all on function public.pair_streaks(uuid) from public, anon;
grant execute on function public.pair_streaks(uuid) to authenticated;

-- The weekly workouts goal, set by the client or a trainer of a live pair. Errors (message): bad_goal,
-- not_allowed.
create function public.set_workout_week_goal(p_client uuid, p_per_week smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or (p_client is distinct from v_user and not private.is_trainer_of(p_client)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_per_week is null or p_per_week not between 1 and 14 then
    raise exception 'bad_goal' using errcode = 'P0001';
  end if;
  insert into public.workout_week_goals (client_id, per_week, set_by)
  values (p_client, p_per_week, v_user)
  on conflict (client_id) do update
    set per_week = excluded.per_week, set_by = excluded.set_by, updated_at = pg_catalog.now();
  perform private.award_badges(p_client);
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Badges

-- Awards every badge the client has reached and queues a bot message for each new one; takes back session
-- badges above the attended count (an unmarked session). Called by the triggers below.
create function private.award_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sessions integer;
  v_counts   jsonb;
  v_code     text;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return;
  end if;
  -- Serializes parallel awards of one client, so a badge and its message are queued once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('badges:' || p_user::text, 0));

  select count(*) into v_sessions from public.bookings b where b.client_id = p_user and b.status = 'attended';
  v_counts := pg_catalog.jsonb_build_object(
    'sessions', v_sessions,
    'workout_streak', private.workout_streak(p_user, private.user_today(p_user)),
    'diary', (select count(distinct e.local_date) from public.food_diary_entries e where e.client_id = p_user),
    'records', (select count(*) from public.personal_records r where r.client_id = p_user),
    'homework', (
      select count(*)
      from public.homework_occurrences o
      join public.homework h on h.id = o.homework_id
      join public.coachings c on c.id = h.coaching_id
      where c.client_id = p_user and o.done_at is not null));

  delete from public.user_badges u
  using public.badges b
  where u.user_id = p_user and b.code = u.badge_code and b.family = 'sessions' and b.threshold > v_sessions;

  for v_code in
    insert into public.user_badges (user_id, badge_code)
    select p_user, b.code
    from public.badges b
    where b.threshold <= coalesce((v_counts ->> b.family)::integer, 0)
    on conflict (user_id, badge_code) do nothing
    returning badge_code
  loop
    perform private.enqueue_notification(
      'badge', 'badge:' || p_user::text || ':' || v_code,
      pg_catalog.jsonb_build_object('badge', v_code), p_user);
  end loop;
end $$;

comment on function private.award_badges(uuid) is
  'Awards the badges the client has reached (wave-3 §2.2), queues a "badge" message for each new one and takes '
  'back session badges above the attended count.';
revoke all on function private.award_badges(uuid) from public;

comment on function public.set_workout_week_goal(uuid, smallint) is
  'Client or trainer of a live pair: sets the client''s weekly workouts goal (1–14).';
revoke all on function public.set_workout_week_goal(uuid, smallint) from public, anon;
grant execute on function public.set_workout_week_goal(uuid, smallint) to authenticated;

-- The client saw the celebration of their new badges.
create function public.mark_badges_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_badges u set seen_at = pg_catalog.now()
  where u.user_id = (select auth.uid()) and u.seen_at is null
$$;

comment on function public.mark_badges_seen() is 'Client: marks own new badges as seen.';
revoke all on function public.mark_badges_seen() from public, anon;
grant execute on function public.mark_badges_seen() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Triggers: whatever feeds a badge re-checks the client's badges.

create function private.award_badges_on_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'attended' then
      perform private.award_badges(old.client_id);
    end if;
  elsif new.status = 'attended' or (tg_op = 'UPDATE' and old.status = 'attended') then
    perform private.award_badges(new.client_id);
  end if;
  return null;
end $$;

comment on function private.award_badges_on_booking() is 'Trigger: a booking became or stopped being attended.';
revoke all on function private.award_badges_on_booking() from public;

create trigger bookings_award_badges
  after insert or update of status or delete on public.bookings
  for each row execute function private.award_badges_on_booking();

create function private.award_badges_on_client_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.award_badges(new.client_id);
  return null;
end $$;

comment on function private.award_badges_on_client_row() is
  'Trigger: a new workout log, food diary entry or personal record of a client.';
revoke all on function private.award_badges_on_client_row() from public;

create trigger workout_logs_award_badges
  after insert on public.workout_logs
  for each row execute function private.award_badges_on_client_row();

create trigger food_diary_entries_award_badges
  after insert on public.food_diary_entries
  for each row execute function private.award_badges_on_client_row();

create trigger personal_records_award_badges
  after insert on public.personal_records
  for each row execute function private.award_badges_on_client_row();

create function private.award_badges_on_homework()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_at is not null and old.done_at is null then
    perform private.award_badges(
      (select c.client_id from public.homework h join public.coachings c on c.id = h.coaching_id where h.id = new.homework_id));
  end if;
  return null;
end $$;

comment on function private.award_badges_on_homework() is 'Trigger: a homework deadline was marked done.';
revoke all on function private.award_badges_on_homework() from public;

create trigger homework_occurrences_award_badges
  after update of done_at on public.homework_occurrences
  for each row execute function private.award_badges_on_homework();

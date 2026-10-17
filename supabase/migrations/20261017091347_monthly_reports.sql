-- Monthly report (PRD wave-3 §4, data-model "monthly_reports"): the client's month in numbers, the morning
-- message on the 1st, and story cards a client shares by a link.
--
-- * The report is built on the fly from the client's own rows; nothing is cached. It is private: only the client
--   reads it (§4-3), so it goes through a definer function for auth.uid() and never takes a user id.
-- * Months are the client's months, in their time zone. Only a finished month has a report, and a month without
--   activity has none (§4-2).
-- * A story card freezes what it shows at creation (§4-4): the image route reads it by its random id without an
--   account, and gets the card's numbers only, never the report. Body numbers go on a card only when the client
--   confirms it (§4-5). Cards expire after 30 days.

alter type public.notification_type add value 'monthly_report';

create table public.story_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  kind       text not null check (kind in ('sessions', 'trainer', 'records', 'weight')),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

comment on table public.story_cards is
  'A story card of a monthly report (wave-3 §4-4): the numbers it shows, frozen at creation; read by id through public.story_card().';
comment on column public.story_cards.data is 'Only what the card prints, e.g. {"count": 12} or a trainer''s name with the count.';

create index story_cards_user_id_idx on public.story_cards (user_id);

alter table public.story_cards enable row level security;
revoke all on table public.story_cards from anon, authenticated;

create policy "story_cards: owner reads"
  on public.story_cards for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.story_cards to authenticated;

-- =========================================================================================================
-- The report

-- The report of a client's month (p_month = its 1st day), or null when the month has no activity. Sections
-- without data are left out. Weight and girths: the first and the last value of the month for each kind with two
-- or more. Nutrition: a day is on target when its calories are within ±10% of the target in force (wave-2 §5).
-- Steps of a day: the manual value, else the iOS one (wave-2 §4.3).
create function private.monthly_report(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz       text;
  v_locale   public.app_locale;
  v_from     timestamptz;
  v_to       timestamptz;
  v_last     date := (p_month + interval '1 month')::date - 1;
  v_sessions jsonb;
  v_records  jsonb;
  v_changes  jsonb;
  v_food     jsonb;
  v_steps    jsonb;
  v_sleep    jsonb;
  v_homework jsonb;
  v_workouts integer;
  v_report   jsonb;
begin
  if p_user is null or p_month is null or p_month <> date_trunc('month', p_month)::date then
    return null;
  end if;
  select coalesce(s.time_zone, 'Europe/Moscow'), coalesce(s.locale, 'ru') into v_tz, v_locale
  from public.profiles p left join public.user_settings s on s.user_id = p.id
  where p.id = p_user;
  if v_tz is null then
    return null;
  end if;
  v_from := p_month::timestamp at time zone v_tz;
  v_to := (p_month + interval '1 month')::timestamp at time zone v_tz;

  -- Attended sessions, and with whom.
  select pg_catalog.jsonb_build_object('total', sum(t.n), 'trainers', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'coaching_id', t.coaching_id, 'first_name', t.first_name, 'last_name', t.last_name, 'count', t.n)
           order by t.n desc, t.first_name))
  into v_sessions
  from (
    select b.coaching_id, p.first_name, p.last_name, count(*)::integer as n
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.profiles p on p.id = b.trainer_id
    where b.client_id = p_user and b.status = 'attended' and s.starts_at >= v_from and s.starts_at < v_to
    group by b.coaching_id, p.first_name, p.last_name
  ) t
  having count(*) > 0;

  -- Records reached this month that still stand.
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'exercise_id', r.exercise_id,
           'name', coalesce((select x.name from public.exercise_translations x
                             where x.exercise_id = r.exercise_id and x.locale = v_locale), e.name),
           'type', r.record_type, 'value', r.value, 'achieved_at', r.achieved_at)
           order by r.achieved_at desc)
  into v_records
  from public.personal_records r
  join public.exercises e on e.id = r.exercise_id
  where r.client_id = p_user and r.achieved_at >= v_from and r.achieved_at < v_to;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', m.kind, 'from', m.first_value, 'to', m.last_value)
           order by m.kind)
  into v_changes
  from (
    select x.kind,
           (array_agg(x.value order by x.measured_at, x.created_at))[1] as first_value,
           (array_agg(x.value order by x.measured_at desc, x.created_at desc))[1] as last_value
    from public.measurements x
    where x.client_id = p_user and x.local_date between p_month and v_last
    group by x.kind
    having count(*) >= 2
  ) m;

  select pg_catalog.jsonb_build_object(
           'logged_days', count(*)::integer,
           'target_days', count(d.target)::integer,
           'on_target_days', count(*) filter (where pg_catalog.abs(d.kcal - d.target) <= d.target * 0.1)::integer)
  into v_food
  from (
    select f.local_date, sum(f.kcal) as kcal,
           (select t.kcal from public.nutrition_targets t
            where t.id = private.active_nutrition_target(p_user, f.local_date)) as target
    from public.food_diary_entries f
    where f.client_id = p_user and f.local_date between p_month and v_last
    group by f.local_date
  ) d
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('average', round(avg(d.steps))::integer, 'days', count(*)::integer)
  into v_steps
  from (
    select coalesce(max(a.value) filter (where a.source = 'manual'), max(a.value)) as steps
    from public.activity_entries a
    where a.client_id = p_user and a.metric = 'steps' and a.local_date between p_month and v_last
    group by a.local_date
  ) d
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('average_min', round(avg(a.value))::integer, 'days', count(*)::integer)
  into v_sleep
  from public.activity_entries a
  where a.client_id = p_user and a.metric = 'sleep' and a.local_date between p_month and v_last
  having count(*) > 0;

  select pg_catalog.jsonb_build_object('done', count(o.done_at)::integer, 'total', count(*)::integer)
  into v_homework
  from public.homework_occurrences o
  join public.homework h on h.id = o.homework_id
  join public.coachings c on c.id = h.coaching_id
  where c.client_id = p_user and o.due_on between p_month and v_last
  having count(*) > 0;

  select count(*)::integer into v_workouts
  from public.workout_logs w
  where w.client_id = p_user and w.local_date between p_month and v_last;

  -- No activity, no report (§4-2): sessions, workouts, records, measurements, food, steps, sleep or a done homework.
  if v_sessions is null and v_records is null and v_workouts = 0 and v_food is null and v_steps is null
     and v_sleep is null and coalesce((v_homework->>'done')::integer, 0) = 0
     and not exists (select 1 from public.measurements x
                     where x.client_id = p_user and x.local_date between p_month and v_last) then
    return null;
  end if;

  v_report := pg_catalog.jsonb_build_object('month', p_month, 'workouts', v_workouts);
  if v_sessions is not null then v_report := v_report || pg_catalog.jsonb_build_object('sessions', v_sessions); end if;
  if v_records is not null then v_report := v_report || pg_catalog.jsonb_build_object('records', v_records); end if;
  if v_changes is not null then v_report := v_report || pg_catalog.jsonb_build_object('measurements', v_changes); end if;
  if v_food is not null then v_report := v_report || pg_catalog.jsonb_build_object('nutrition', v_food); end if;
  if v_steps is not null then v_report := v_report || pg_catalog.jsonb_build_object('steps', v_steps); end if;
  if v_sleep is not null then v_report := v_report || pg_catalog.jsonb_build_object('sleep', v_sleep); end if;
  if v_homework is not null then v_report := v_report || pg_catalog.jsonb_build_object('homework', v_homework); end if;
  return v_report;
end $$;

comment on function private.monthly_report(uuid, date) is
  'The client''s month in numbers (wave-3 §4-2), or null when the month has no activity. Months in the client''s time zone.';
revoke all on function private.monthly_report(uuid, date) from public;

-- The 1st of the client's current month.
create function private.user_month(p_user uuid, p_now timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', private.user_today(p_user, p_now))::date
$$;

comment on function private.user_month(uuid, timestamptz) is 'The 1st day of the user''s current month, in their time zone.';
revoke all on function private.user_month(uuid, timestamptz) from public;

-- The caller's report of a finished month; null for the current month, a future one or one without activity.
create function public.my_monthly_report(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_month is null or p_month >= private.user_month(v_user) then
    return null;
  end if;
  return private.monthly_report(v_user, p_month);
end $$;

comment on function public.my_monthly_report(date) is
  'The caller''s monthly report of a finished month (wave-3 §4), or null. Only the client reads it (§4-3).';
revoke all on function public.my_monthly_report(date) from public, anon;
grant execute on function public.my_monthly_report(date) to authenticated;

-- =========================================================================================================
-- Story cards

-- A story card of the caller's finished month. kind: sessions (attended this month), trainer (sessions with the
-- trainer of p_coaching), records (new records, with the latest one), weight (the change, only with p_confirm:
-- the client agreed to show a body number, §4-5). Returns the card id for the image link.
create function public.create_story_card(p_month date, p_kind text, p_coaching uuid default null, p_confirm boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_report jsonb;
  v_data   jsonb;
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_report := public.my_monthly_report(p_month);
  if v_report is null then
    raise exception 'no_report' using errcode = 'P0001';
  end if;
  if p_kind = 'sessions' and v_report ? 'sessions' then
    v_data := pg_catalog.jsonb_build_object('count', (v_report #>> '{sessions,total}')::integer);
  elsif p_kind = 'trainer' and p_coaching is not null then
    select pg_catalog.jsonb_build_object('count', t->'count', 'first_name', t->'first_name', 'last_name', t->'last_name')
    into v_data
    from pg_catalog.jsonb_array_elements(v_report #> '{sessions,trainers}') as x(t)
    where t->>'coaching_id' = p_coaching::text;
  elsif p_kind = 'records' and v_report ? 'records' then
    v_data := pg_catalog.jsonb_build_object(
      'count', pg_catalog.jsonb_array_length(v_report->'records'),
      'name', v_report #> '{records,0,name}', 'type', v_report #> '{records,0,type}', 'value', v_report #> '{records,0,value}');
  elsif p_kind = 'weight' then
    if not coalesce(p_confirm, false) then
      raise exception 'confirm_required' using errcode = 'P0001';
    end if;
    select pg_catalog.jsonb_build_object('change', round((m->>'to')::numeric - (m->>'from')::numeric, 1))
    into v_data
    from pg_catalog.jsonb_array_elements(v_report->'measurements') as x(m)
    where m->>'kind' = 'weight' and (m->>'to')::numeric <> (m->>'from')::numeric;
  elsif p_kind not in ('sessions', 'trainer', 'records', 'weight') or p_kind is null then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'nothing_to_show' using errcode = 'P0001';
  end if;

  delete from public.story_cards c where c.user_id = v_user and c.expires_at < now();
  insert into public.story_cards (user_id, month, kind, data) values (v_user, p_month, p_kind, v_data)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.create_story_card(date, text, uuid, boolean) is
  'Freezes a story card of the caller''s finished month (wave-3 §4-4); body numbers only with p_confirm (§4-5).';
revoke all on function public.create_story_card(date, text, uuid, boolean) from public, anon;
grant execute on function public.create_story_card(date, text, uuid, boolean) to authenticated;

-- What the image route draws: the card's kind, month and numbers while it has not expired. Public by its random
-- id, like a showcase link: the client shared it, and it holds nothing but what the picture shows.
create function public.story_card(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('kind', c.kind, 'month', c.month, 'data', c.data)
  from public.story_cards c
  where c.id = p_id and c.expires_at > now()
$$;

comment on function public.story_card(uuid) is
  'A story card by its id for the image route (wave-3 §4-4): kind, month and the frozen numbers; null when expired.';
revoke all on function public.story_card(uuid) from public;
grant execute on function public.story_card(uuid) to anon, authenticated;

-- =========================================================================================================
-- The message on the 1st

-- pg_cron: on the 1st of the client's month, from 10:00 their time, queues "Итоги месяца" of the month before for
-- each client with a report. Quiet hours apply in enqueue_notification; a switched-off type is skipped at claim
-- time and the report stays in the app (§4-6). Candidates are the people with rows in the month, so a quiet
-- account costs nothing.
create function private.queue_monthly_reports(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_utc date := (p_now at time zone 'UTC')::date;
begin
  -- Somewhere in the world it is the 1st only from the last day of a month to the 2nd.
  if extract(day from v_utc + 1) > 2 then
    return 0;
  end if;
  for r in
    with month_of as (
      select (date_trunc('month', v_utc + 1) - interval '1 month')::date as m
    ), people as (
      select b.client_id as id from public.bookings b, month_of
      where b.status = 'attended' and b.attendance_marked_at >= month_of.m - 1
      union select w.client_id from public.workout_logs w, month_of where w.local_date >= month_of.m - 1
      union select x.client_id from public.measurements x, month_of where x.local_date >= month_of.m - 1
      union select f.client_id from public.food_diary_entries f, month_of where f.local_date >= month_of.m - 1
      union select a.client_id from public.activity_entries a, month_of where a.local_date >= month_of.m - 1
      union select c.client_id from public.homework_occurrences o
        join public.homework h on h.id = o.homework_id join public.coachings c on c.id = h.coaching_id, month_of
        where o.due_on >= month_of.m - 1
    )
    select p.id, (private.user_month(p.id, p_now) - interval '1 month')::date as month
    from people p
    left join public.user_settings s on s.user_id = p.id
    where extract(day from (p_now at time zone coalesce(s.time_zone, 'Europe/Moscow'))) = 1
      and (p_now at time zone coalesce(s.time_zone, 'Europe/Moscow'))::time >= time '10:00'
  loop
    if not exists (select 1 from public.notification_outbox x
                   where x.dedupe_key = 'monthly_report:' || r.id || ':' || r.month)
       and private.monthly_report(r.id, r.month) is not null
       and private.enqueue_notification('monthly_report', 'monthly_report:' || r.id || ':' || r.month,
             pg_catalog.jsonb_build_object('month', r.month), r.id, null, p_now) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.queue_monthly_reports(timestamptz) is
  'pg_cron: queues "Итоги месяца" on the 1st from 10:00 in each client''s time zone, for the month before (wave-3 §4-1).';
revoke all on function private.queue_monthly_reports(timestamptz) from public;

select cron.schedule('monthly-reports', '*/15 * * * *', 'select private.queue_monthly_reports()');

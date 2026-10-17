-- Activity: steps, water and sleep of a client's day (PRD wave-2 §4, data-model activity_entries, Q37), and the
-- personal token iOS Shortcuts uses to send steps.
--
-- * One table with a metric per row, because the metrics sit behind different shares: water behind
--   "nutrition", steps and sleep behind "steps"; RLS works by rows.
-- * Steps of a day: the manual value when there is one, else the iOS one (wave-2 §4.3). Water: the sum of the
--   day's rows (each "+250 мл" is a row). Sleep: one manual row per day of waking up.
-- * Writes go through functions; the table grants select only. The token is shown once and kept as a sha256.

create type public.activity_metric as enum ('steps', 'water', 'sleep');
create type public.activity_source as enum ('manual', 'ios_shortcut');

create table public.activity_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  local_date    date not null,
  metric        public.activity_metric not null,
  value         integer not null,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  source        public.activity_source not null default 'manual',
  recorded_at   timestamptz not null default now(),
  constraint activity_entries_value_check check (case metric
    when 'steps' then value between 0 and 100000
    when 'water' then value between 1 and 5000
    when 'sleep' then value between 1 and 1440 end),
  constraint activity_entries_quality_check check (metric = 'sleep' or sleep_quality is null),
  constraint activity_entries_source_check check (source = 'manual' or metric = 'steps')
);

comment on table public.activity_entries is
  'Steps, water and sleep of a client''s day (wave-2 §4). Steps: the manual row wins over the iOS one; water: the sum of the day''s rows.';
comment on column public.activity_entries.local_date is 'The client''s day; for sleep, the day of waking up.';
comment on column public.activity_entries.value is 'Steps, millilitres of water or minutes of sleep.';

create unique index activity_entries_one_per_day_idx
  on public.activity_entries (client_id, local_date, metric, source) where metric in ('steps', 'sleep');
create index activity_entries_client_metric_idx on public.activity_entries (client_id, metric, local_date);

alter table public.activity_entries enable row level security;
revoke all on table public.activity_entries from anon, authenticated;

create policy "activity_entries: client and sharing trainers read"
  on public.activity_entries for select
  to authenticated
  using (
    (metric = 'water' and client_id = any ((select private.viewable_client_ids('nutrition'))::uuid[]))
    or (metric <> 'water' and client_id = any ((select private.viewable_client_ids('steps'))::uuid[])));

grant select on table public.activity_entries to authenticated;

-- The personal token of iOS Shortcuts. One live token per user; reissuing revokes the old one at once.
create table public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash   bytea not null unique,
  scope        text not null default 'steps:write' check (scope = 'steps:write'),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz,
  window_start timestamptz,
  window_count smallint not null default 0
);

comment on table public.ingest_tokens is
  'Personal tokens of iOS Shortcuts (wave-2 §4.3): only a sha256 is kept; the token writes the owner''s steps and reads nothing.';
comment on column public.ingest_tokens.window_start is 'Start of the current hour of the 60-requests-an-hour limit.';

create unique index ingest_tokens_live_idx on public.ingest_tokens (user_id) where revoked_at is null;
create index ingest_tokens_user_id_idx on public.ingest_tokens (user_id);

alter table public.ingest_tokens enable row level security;
revoke all on table public.ingest_tokens from anon, authenticated;

create policy "ingest_tokens: owner reads"
  on public.ingest_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

-- token_hash and the rate window are not granted.
grant select (id, user_id, scope, created_at, revoked_at, last_used_at) on table public.ingest_tokens to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The client's writes

-- The client's today: their time zone (Europe/Moscow until they set one).
create function private.user_today(p_user uuid, p_now timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_now at time zone coalesce(
    (select s.time_zone from public.user_settings s where s.user_id = p_user), 'Europe/Moscow'))::date
$$;

comment on function private.user_today(uuid, timestamptz) is 'The user''s day now, in their time zone.';
revoke all on function private.user_today(uuid, timestamptz) from public;

-- A day the client may write: today or up to a year back, by their own day.
create function private.check_activity_day(p_user uuid, p_day date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.user_today(p_user);
begin
  if p_day is null or p_day > v_today or p_day < v_today - 366 then
    raise exception 'bad_day' using errcode = 'P0001';
  end if;
end $$;

comment on function private.check_activity_day(uuid, date) is 'Refuses a day ahead of the user''s today or more than a year back.';
revoke all on function private.check_activity_day(uuid, date) from public;

-- Steps or sleep typed by the client for a day; null clears the manual value (the iOS steps show again).
-- Errors (message): bad_day; 22023 for a bad metric; 23514 for a value out of range.
create function public.set_activity(p_day date, p_metric public.activity_metric, p_value integer, p_quality smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_metric not in ('steps', 'sleep') then
    raise exception 'set_activity takes steps or sleep' using errcode = '22023';
  end if;
  perform private.check_activity_day(v_user, p_day);
  if p_value is null then
    delete from public.activity_entries e
    where e.client_id = v_user and e.local_date = p_day and e.metric = p_metric and e.source = 'manual';
    return;
  end if;
  insert into public.activity_entries (client_id, local_date, metric, value, sleep_quality, source)
  values (v_user, p_day, p_metric, p_value, case when p_metric = 'sleep' then p_quality end, 'manual')
  on conflict (client_id, local_date, metric, source) where metric in ('steps', 'sleep')
  do update set value = excluded.value, sleep_quality = excluded.sleep_quality, recorded_at = pg_catalog.now();
end $$;

comment on function public.set_activity(date, public.activity_metric, integer, smallint) is
  'Client: sets (or clears with null) the manual steps or sleep of a day.';
revoke all on function public.set_activity(date, public.activity_metric, integer, smallint) from public, anon;
grant execute on function public.set_activity(date, public.activity_metric, integer, smallint) to authenticated;

-- "+250 мл": a glass of water for a day. Returns the row, so the client can take it back.
create function public.add_water(p_day date, p_ml integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.check_activity_day(v_user, p_day);
  insert into public.activity_entries (client_id, local_date, metric, value)
  values (v_user, p_day, 'water', p_ml)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.add_water(date, integer) is 'Client: adds water (1..5000 ml) to a day.';
revoke all on function public.add_water(date, integer) from public, anon;
grant execute on function public.add_water(date, integer) to authenticated;

-- Takes back the client's latest water of a day ("Отменить"). Returns the millilitres taken back, 0 when none.
create function public.undo_water(p_day date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ml integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.activity_entries e
  where e.id = (
    select x.id from public.activity_entries x
    where x.client_id = v_user and x.local_date = p_day and x.metric = 'water'
    order by x.recorded_at desc, x.id desc limit 1)
  returning e.value into v_ml;
  return coalesce(v_ml, 0);
end $$;

comment on function public.undo_water(date) is 'Client: takes back the latest water of a day.';
revoke all on function public.undo_water(date) from public, anon;
grant execute on function public.undo_water(date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- iOS Shortcuts

-- A new token for the caller; the old one stops working at once. The token is returned once and never again.
create function public.issue_ingest_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.ingest_tokens t set revoked_at = pg_catalog.now() where t.user_id = v_user and t.revoked_at is null;
  v_token := 'dft_' || pg_catalog.translate(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.ingest_tokens (user_id, token_hash)
  values (v_user, extensions.digest(v_token, 'sha256'));
  return v_token;
end $$;

comment on function public.issue_ingest_token() is 'Issues the caller''s iOS Shortcuts token, revoking the previous one; returned once.';
revoke all on function public.issue_ingest_token() from public, anon;
grant execute on function public.issue_ingest_token() to authenticated;

create function public.revoke_ingest_token()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ingest_tokens t set revoked_at = pg_catalog.now()
  where t.user_id = (select auth.uid()) and t.revoked_at is null;
end $$;

comment on function public.revoke_ingest_token() is 'Revokes the caller''s iOS Shortcuts token.';
revoke all on function public.revoke_ingest_token() from public, anon;
grant execute on function public.revoke_ingest_token() to authenticated;

-- Steps from iOS Shortcuts, called by the server route with the token from the request (wave-2 §4.3): the
-- day's iOS value is overwritten by the latest one. Without a day, the user's today. 60 requests an hour.
-- Returns 'ok' or the refusal: bad_token, rate_limited, too_many_steps, bad_steps, bad_day.
create function public.ingest_steps(p_token text, p_steps integer, p_day date default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t record;
  v_day date;
begin
  select k.id, k.user_id, k.window_start, k.window_count into t
  from public.ingest_tokens k
  where k.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and k.revoked_at is null
  for update;
  if not found then
    return 'bad_token';
  end if;

  if t.window_start is null or t.window_start <= pg_catalog.now() - interval '1 hour' then
    update public.ingest_tokens set window_start = pg_catalog.now(), window_count = 1, last_used_at = pg_catalog.now()
    where id = t.id;
  elsif t.window_count >= 60 then
    return 'rate_limited';
  else
    update public.ingest_tokens set window_count = window_count + 1, last_used_at = pg_catalog.now() where id = t.id;
  end if;

  if p_steps is null or p_steps < 0 then
    return 'bad_steps';
  end if;
  if p_steps > 100000 then
    return 'too_many_steps';
  end if;
  v_day := coalesce(p_day, private.user_today(t.user_id));
  if v_day > private.user_today(t.user_id) or v_day < private.user_today(t.user_id) - 366 then
    return 'bad_day';
  end if;

  insert into public.activity_entries (client_id, local_date, metric, value, source)
  values (t.user_id, v_day, 'steps', p_steps, 'ios_shortcut')
  on conflict (client_id, local_date, metric, source) where metric in ('steps', 'sleep')
  do update set value = excluded.value, recorded_at = pg_catalog.now();
  return 'ok';
end $$;

comment on function public.ingest_steps(text, integer, date) is
  'Server route of iOS Shortcuts: writes the token owner''s steps for a day; the token reads nothing.';
revoke all on function public.ingest_steps(text, integer, date) from public, anon, authenticated;
grant execute on function public.ingest_steps(text, integer, date) to service_role;

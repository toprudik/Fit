-- Seasonal DaFit challenges (marketing 12, viral §2.4): the admin starts one for a calendar month, say «Январь без
-- пропусков», and any client may join it. The only metric is attendance: a participant goes through the month when
-- they came to at least one session and missed none (no no-show, no late cancellation), counted by the sessions of
-- that month in the client's time zone across all their trainers. Nothing about the body is read. After the month
-- the participants who made it get the badge "season_done" with its usual message and, through the month's report,
-- its story card.

create table public.season_challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (pg_catalog.char_length(title) between 3 and 80),
  month        date not null check (month = pg_catalog.date_trunc('month', month)::date),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  finished_at  timestamptz
);

comment on table public.season_challenges is
  'DaFit-wide monthly attendance challenges (marketing 12), started by an admin; clients join by choice.';
comment on column public.season_challenges.created_by is 'Admin who started it; plain uuid like the audit log, no FK.';

create unique index season_challenges_month_idx on public.season_challenges (month) where cancelled_at is null;

alter table public.season_challenges enable row level security;
revoke all on table public.season_challenges from anon, authenticated;

create table public.season_challenge_participants (
  challenge_id uuid not null references public.season_challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  result       text check (result in ('done', 'missed')),
  primary key (challenge_id, user_id)
);

comment on table public.season_challenge_participants is
  'Clients who joined a season challenge; result is set when the month is over.';
create index season_challenge_participants_user_idx on public.season_challenge_participants (user_id);

alter table public.season_challenge_participants enable row level security;
revoke all on table public.season_challenge_participants from anon, authenticated;

create policy "season_challenge_participants: owner reads"
  on public.season_challenge_participants for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.season_challenge_participants to authenticated;

alter table public.badges drop constraint badges_family_check;
alter table public.badges add constraint badges_family_check
  check (family in ('sessions', 'workout_streak', 'diary', 'records', 'homework', 'challenge', 'referral', 'season'));
insert into public.badges (code, family, threshold, position) values ('season_done', 'season', 1, 20);

-- Attendance of one client in one month, by the sessions of that month in the client's time zone.
create function private.season_attendance(p_user uuid, p_month date)
returns table (attended integer, missed integer, ahead integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (
    select coalesce((select s.time_zone from public.user_settings s where s.user_id = p_user), 'Europe/Moscow') as zone
  )
  select count(*) filter (where b.status = 'attended')::integer,
         count(*) filter (where b.status in ('no_show', 'late_cancelled'))::integer,
         count(*) filter (where b.status in ('requested', 'confirmed') and s.ends_at > pg_catalog.now())::integer
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  cross join tz
  where b.client_id = p_user
    and s.starts_at >= (p_month::timestamp at time zone tz.zone)
    and s.starts_at < (((p_month + interval '1 month')::date)::timestamp at time zone tz.zone)
$$;

comment on function private.season_attendance(uuid, date) is
  'Season challenge: attended, missed (no-show or late cancellation) and booked-ahead sessions of a client in a month.';
revoke all on function private.season_attendance(uuid, date) from public;

-- Admin ---------------------------------------------------------------------------------------------------------

create function public.admin_create_season_challenge(p_title text, p_month date)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_id    uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins start season challenges';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 3 and 80 then
    raise exception 'invalid_title' using errcode = '22023', detail = 'the title is 3 to 80 characters';
  end if;
  if p_month is null or p_month <> pg_catalog.date_trunc('month', p_month)::date
     or p_month < pg_catalog.date_trunc('month', private.user_today(auth.uid()))::date then
    raise exception 'invalid_month' using errcode = '22023', detail = 'the first day of this month or a later one';
  end if;
  insert into public.season_challenges (title, month, created_by) values (v_title, p_month, auth.uid())
  on conflict (month) where cancelled_at is null do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'month_taken' using errcode = 'P0001', detail = 'this month already has a season challenge';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'season_challenge.create', 'season_challenge', v_id,
          pg_catalog.jsonb_build_object('title', v_title, 'month', p_month));
  return v_id;
end $$;

comment on function public.admin_create_season_challenge(text, date) is
  'Admin: starts the season challenge of a month (its first day, this month or later) and audits '
  'season_challenge.create. Raises invalid_title, invalid_month or month_taken.';
revoke all on function public.admin_create_season_challenge(text, date) from public, anon;
grant execute on function public.admin_create_season_challenge(text, date) to authenticated;

create function public.admin_cancel_season_challenge(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.season_challenges;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins cancel season challenges';
  end if;
  -- The row lock makes a second click, or a second admin at the same moment, wait and then see it cancelled, so the
  -- audit row is written once.
  select c.* into v_challenge from public.season_challenges c where c.id = p_id for no key update;
  if not found or v_challenge.finished_at is not null then
    raise exception 'challenge_not_found' using errcode = 'P0001', detail = 'no running season challenge with this id';
  end if;
  if v_challenge.cancelled_at is not null then
    raise exception 'already_cancelled' using errcode = 'P0001', detail = 'the season challenge is cancelled already';
  end if;
  update public.season_challenges c set cancelled_at = pg_catalog.now() where c.id = p_id;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'season_challenge.cancel', 'season_challenge', p_id);
end $$;

comment on function public.admin_cancel_season_challenge(uuid) is
  'Admin: cancels a season challenge that has not finished and audits season_challenge.cancel once. Raises '
  'challenge_not_found or already_cancelled.';
revoke all on function public.admin_cancel_season_challenge(uuid) from public, anon;
grant execute on function public.admin_cancel_season_challenge(uuid) to authenticated;

create function public.admin_season_challenges()
returns table (
  id uuid, title text, month date, created_at timestamptz, cancelled_at timestamptz, finished_at timestamptz,
  participants integer, done integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins list season challenges';
  end if;
  return query
  select c.id, c.title, c.month, c.created_at, c.cancelled_at, c.finished_at,
         (select count(*)::integer from public.season_challenge_participants p where p.challenge_id = c.id),
         (select count(*)::integer from public.season_challenge_participants p where p.challenge_id = c.id and p.result = 'done')
  from public.season_challenges c
  order by c.month desc, c.created_at desc;
end $$;

comment on function public.admin_season_challenges() is
  'Admin: every season challenge, newest month first, with how many joined and how many made it.';
revoke all on function public.admin_season_challenges() from public, anon;
grant execute on function public.admin_season_challenges() to authenticated;

-- Client ---------------------------------------------------------------------------------------------------------

-- The season challenge to show the client: the running or coming one, or a finished one for two weeks after.
create function public.my_season_challenge()
returns table (
  id uuid, title text, month date, joined boolean, finished boolean, result text,
  attended integer, missed integer, ahead integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  return query
  select c.id, c.title, c.month, p.user_id is not null, c.finished_at is not null, p.result,
         a.attended, a.missed, a.ahead
  from public.season_challenges c
  left join public.season_challenge_participants p on p.challenge_id = c.id and p.user_id = v_user
  cross join lateral private.season_attendance(v_user, c.month) a
  where c.cancelled_at is null
    and (c.finished_at is null or c.finished_at > pg_catalog.now() - interval '14 days')
  order by c.month
  limit 1;
end $$;

comment on function public.my_season_challenge() is
  'Client: the season challenge to show (running, coming, or finished in the last two weeks) with own attendance.';
revoke all on function public.my_season_challenge() from public, anon;
grant execute on function public.my_season_challenge() to authenticated;

create function public.set_season_challenge_joined(p_id uuid, p_joined boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.season_challenges c
  where c.id = p_id and c.cancelled_at is null and c.finished_at is null
    and private.user_today(v_user) < (c.month + interval '1 month')::date;
  if not found then
    raise exception 'challenge_closed' using errcode = 'P0001', detail = 'the challenge is over, cancelled or unknown';
  end if;
  if p_joined then
    insert into public.season_challenge_participants (challenge_id, user_id) values (p_id, v_user)
    on conflict (challenge_id, user_id) do nothing;
  else
    delete from public.season_challenge_participants p where p.challenge_id = p_id and p.user_id = v_user;
  end if;
end $$;

comment on function public.set_season_challenge_joined(uuid, boolean) is
  'Client: joins or leaves a season challenge until its month is over in their time zone. Raises challenge_closed.';
revoke all on function public.set_season_challenge_joined(uuid, boolean) from public, anon;
grant execute on function public.set_season_challenge_joined(uuid, boolean) to authenticated;

-- Finishing -------------------------------------------------------------------------------------------------------

-- Once the month is over everywhere (a day after its end in UTC), sets every participant's result and gives the
-- ones who made it the badge with its message.
create function private.finish_season_challenges()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.season_challenges;
  v_done      integer := 0;
  r           record;
begin
  for v_challenge in
    select * from public.season_challenges c
    where c.cancelled_at is null and c.finished_at is null
      and (c.month + interval '1 month' + interval '1 day') <= pg_catalog.now()
    for update skip locked
  loop
    for r in
      select p.user_id, a.attended > 0 and a.missed = 0 as made_it
      from public.season_challenge_participants p
      cross join lateral private.season_attendance(p.user_id, v_challenge.month) a
      where p.challenge_id = v_challenge.id
    loop
      update public.season_challenge_participants p
      set result = case when r.made_it then 'done' else 'missed' end
      where p.challenge_id = v_challenge.id and p.user_id = r.user_id;
      if r.made_it then
        perform private.grant_challenge_badge(r.user_id, 'season_done');
      end if;
    end loop;
    update public.season_challenges c set finished_at = pg_catalog.now() where c.id = v_challenge.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

comment on function private.finish_season_challenges() is
  'Finishes the season challenges whose month is over, sets results and awards season_done (marketing 12).';
revoke all on function private.finish_season_challenges() from public;

select cron.schedule('season-challenges-finish', '17 * * * *', 'select private.finish_season_challenges()');

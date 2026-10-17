-- Group challenges and their leaderboards (PRD wave-3 §2.3–2.4, Q29, Q40; data-model «Геймификация»):
--   * challenges: a trainer runs one for a group of theirs (trainer.groups): a title, one metric, 1 to 12 weeks
--     from a start day, an optional goal and whether it has a leaderboard. Body metrics (weight, measurements,
--     photos) do not exist here at all (§2.4).
--   * challenge_participants: a client of the group joins on their own (opt-in, §2.3-11). Their score counts only
--     data they share with the trainer: the metric's share category must be on to join, and while it is off the
--     score stays at its last value and the board says it is hidden (§2.3-12, edge cases).
--   * The leaderboard is a function, not a table: the trainer sees every participant; a participant sees the
--     ones who agreed to be shown (off by default, Q40) and their own row. Names are the alias or the first name.
--   * When the last day is over, finish_challenges (hourly) fixes the scores and awards "challenge_done" to those
--     who reached the goal and "challenge_winner" to the top three of a challenge with a leaderboard (§2.3-13).
--   * A pair that ends or leaves the group leaves the trainer's challenges; badges stay with the client.

-- Tables -----------------------------------------------------------------------------------------------------

create table public.challenges (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainer_profiles (user_id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,
  title        text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 80),
  metric       text not null check (metric in ('workouts', 'steps', 'diary_days', 'adherence_days')),
  goal         integer check (goal between 1 and 10000000),
  starts_on    date not null,
  ends_on      date not null,
  leaderboard  boolean not null default true,
  cancelled_at timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on + 6 and ends_on <= starts_on + 83 and (ends_on - starts_on + 1) % 7 = 0)
);
comment on table public.challenges is
  'A time-boxed contest inside a trainer group (wave-3 §2.3), 1 to 12 weeks. Written by the challenge RPCs.';
create index challenges_trainer_id_idx on public.challenges (trainer_id);
create index challenges_group_id_idx on public.challenges (group_id);
alter table public.challenges enable row level security;
revoke all on table public.challenges from anon, authenticated;

create table public.challenge_participants (
  challenge_id        uuid not null references public.challenges (id) on delete cascade,
  coaching_id         uuid not null references public.coachings (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  show_on_leaderboard boolean not null default false,
  alias               text check (pg_catalog.char_length(pg_catalog.btrim(alias)) between 1 and 30),
  score               integer not null default 0,
  score_updated_at    timestamptz,
  joined_at           timestamptz not null default now(),
  primary key (challenge_id, coaching_id)
);
comment on table public.challenge_participants is
  'Clients who joined a challenge (opt-in, wave-3 §2.3-11). score is a cache refreshed while the metric is shared.';
create index challenge_participants_coaching_id_idx on public.challenge_participants (coaching_id);
create index challenge_participants_user_id_idx on public.challenge_participants (user_id);
alter table public.challenge_participants enable row level security;
revoke all on table public.challenge_participants from anon, authenticated;

insert into public.badges (code, family, threshold, position) values
  ('challenge_done', 'challenge', 1, 16),
  ('challenge_winner', 'challenge', 1, 17);

-- Policies ---------------------------------------------------------------------------------------------------

create policy "challenges: trainer and group members read"
  on public.challenges for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or exists (
      select 1 from public.group_members m
      where m.group_id = challenges.group_id and m.client_id = (select auth.uid())));

create policy "challenge_participants: the participant and the trainer read"
  on public.challenge_participants for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_participants.challenge_id and c.trainer_id = (select auth.uid())));

grant select on table public.challenges, public.challenge_participants to authenticated;

-- Helpers ----------------------------------------------------------------------------------------------------

-- The share category a metric counts from.
create function private.challenge_share(p_metric text)
returns public.share_category
language sql
immutable
set search_path = ''
as $$
  select case p_metric
    when 'workouts' then 'workouts'
    when 'steps' then 'steps'
    else 'nutrition'
  end::public.share_category
$$;
comment on function private.challenge_share(text) is 'The share category a challenge metric is counted from.';
revoke all on function private.challenge_share(text) from public;

-- Whether a pair is live and shares the category with its trainer.
create function private.pair_shares(p_coaching uuid, p_category public.share_category)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_category
             when 'nutrition'    then d.nutrition
             when 'measurements' then d.measurements
             when 'photos'       then d.photos
             when 'steps'        then d.steps
             when 'intake'       then d.intake
             when 'workouts'     then d.workouts
           end
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.id = p_coaching and c.status in ('trial', 'active')), false)
$$;
comment on function private.pair_shares(uuid, public.share_category) is
  'True when the pair is live and its client shares the category with the trainer.';
revoke all on function private.pair_shares(uuid, public.share_category) from public;

-- A client's value of a metric over their local days [p_from, p_to]: workouts (attended sessions and logs not
-- tied to a session), the sum of steps (the manual value of a day, else the iOS one), days with a food diary
-- entry, or days within ±10% of the calorie target (wave-2 §5).
create function private.challenge_value(p_metric text, p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := coalesce((select s.time_zone from public.user_settings s where s.user_id = p_user), 'Europe/Moscow');
begin
  if p_to < p_from then
    return 0;
  end if;
  case p_metric
    when 'workouts' then
      return (
        select pg_catalog.count(*)::integer
        from public.bookings b
        join public.sessions s on s.id = b.session_id
        where b.client_id = p_user and b.status = 'attended'
          and (s.starts_at at time zone v_tz)::date between p_from and p_to
      ) + (
        select pg_catalog.count(*)::integer
        from public.workout_logs l
        where l.client_id = p_user and l.booking_id is null and l.local_date between p_from and p_to);
    when 'steps' then
      return coalesce((
        select pg_catalog.sum(d.value)::integer
        from (
          select distinct on (e.local_date) e.value
          from public.activity_entries e
          where e.client_id = p_user and e.metric = 'steps' and e.local_date between p_from and p_to
          order by e.local_date, e.source = 'manual' desc
        ) d), 0);
    when 'diary_days' then
      return (
        select pg_catalog.count(distinct e.local_date)::integer
        from public.food_diary_entries e
        where e.client_id = p_user and e.local_date between p_from and p_to);
    when 'adherence_days' then
      return (select a.in_norm from private.adherence_counts(p_user, p_from, p_to) a);
    else
      return 0;
  end case;
end $$;
comment on function private.challenge_value(text, uuid, date, date) is
  'A client''s value of a challenge metric over a range of their local days.';
revoke all on function private.challenge_value(text, uuid, date, date) from public;

-- Recounts the scores of the participants who share the metric. Days count up to the last day of the challenge
-- or the client's today, whichever comes first; adherence waits until the day is over, as on the profile.
create function private.refresh_challenge_scores(p_challenge uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_today date;
  r record;
begin
  select * into v_challenge from public.challenges c where c.id = p_challenge;
  if v_challenge.id is null or v_challenge.cancelled_at is not null or v_challenge.finished_at is not null then
    return;
  end if;
  for r in select p.coaching_id, p.user_id from public.challenge_participants p where p.challenge_id = p_challenge loop
    if private.pair_shares(r.coaching_id, private.challenge_share(v_challenge.metric)) then
      v_today := private.user_today(r.user_id);
      update public.challenge_participants p
      set score = private.challenge_value(
            v_challenge.metric, r.user_id, v_challenge.starts_on,
            least(v_challenge.ends_on, case when v_challenge.metric = 'adherence_days' then v_today - 1 else v_today end)),
          score_updated_at = pg_catalog.now()
      where p.challenge_id = p_challenge and p.coaching_id = r.coaching_id;
    end if;
  end loop;
end $$;
comment on function private.refresh_challenge_scores(uuid) is
  'Recounts challenge scores of participants who share the metric; the others keep their last score.';
revoke all on function private.refresh_challenge_scores(uuid) from public;

-- The state of a challenge for the app.
create function private.challenge_state(p_challenge public.challenges)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_challenge.cancelled_at is not null then 'cancelled'
    when p_challenge.finished_at is not null then 'finished'
    when p_challenge.starts_on > private.user_today(p_challenge.trainer_id) then 'upcoming'
    else 'active'
  end
$$;
comment on function private.challenge_state(public.challenges) is 'upcoming, active, finished or cancelled.';
revoke all on function private.challenge_state(public.challenges) from public;

-- Trainer RPCs -----------------------------------------------------------------------------------------------

-- create_challenge: starts on the trainer's today or later; invites every live pair of the group by the bot.
create function public.create_challenge(
  p_group_id uuid,
  p_title text,
  p_metric text,
  p_weeks smallint,
  p_starts_on date,
  p_goal integer default null,
  p_leaderboard boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.groups');
  v_group public.groups := private.own_group(p_group_id);
  v_title text := pg_catalog.btrim(p_title);
  v_name text;
  v_id uuid;
  r record;
begin
  if p_metric is null or p_metric not in ('workouts', 'steps', 'diary_days', 'adherence_days') then
    raise exception 'bad_metric' using errcode = 'P0001';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 80
     or p_weeks is null or p_weeks not between 1 and 12
     or p_starts_on is null or p_starts_on < private.user_today(v_trainer) or p_starts_on > private.user_today(v_trainer) + 60
     or (p_goal is not null and p_goal not between 1 and 10000000) then
    raise exception 'invalid_challenge' using errcode = '22023';
  end if;

  insert into public.challenges (trainer_id, group_id, title, metric, goal, starts_on, ends_on, leaderboard)
  values (v_trainer, v_group.id, v_title, p_metric, p_goal, p_starts_on, p_starts_on + p_weeks * 7 - 1,
          coalesce(p_leaderboard, true))
  returning id into v_id;

  select coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)))
  into v_name
  from public.profiles p where p.id = v_trainer;
  for r in
    select c.client_id
    from public.group_members m join public.coachings c on c.id = m.coaching_id
    where m.group_id = v_group.id and c.status in ('trial', 'active')
  loop
    perform private.enqueue_notification(
      'challenge', 'challenge:' || v_id::text || ':' || r.client_id::text,
      pg_catalog.jsonb_build_object('challenge_id', v_id, 'title', v_title, 'metric', p_metric,
        'starts_on', p_starts_on, 'ends_on', p_starts_on + p_weeks * 7 - 1, 'trainer_name', v_name),
      r.client_id);
  end loop;
  return v_id;
end $$;
comment on function public.create_challenge(uuid, text, text, smallint, date, integer, boolean) is
  'The trainer starts a challenge in a group of theirs and invites its members by the bot (wave-3 §2.3).';
revoke all on function public.create_challenge(uuid, text, text, smallint, date, integer, boolean) from public, anon;
grant execute on function public.create_challenge(uuid, text, text, smallint, date, integer, boolean) to authenticated;

-- cancel_challenge: stops a challenge that has not finished; nobody gets its badges.
create function public.cancel_challenge(p_challenge_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.challenges c
  set cancelled_at = pg_catalog.now()
  where c.id = p_challenge_id and c.trainer_id = auth.uid() and c.cancelled_at is null and c.finished_at is null;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
end $$;
comment on function public.cancel_challenge(uuid) is 'The trainer cancels a running or upcoming challenge.';
revoke all on function public.cancel_challenge(uuid) from public, anon;
grant execute on function public.cancel_challenge(uuid) to authenticated;

-- Client RPCs ------------------------------------------------------------------------------------------------

-- The caller's live pair in the challenge's group, or not_allowed.
create function private.challenge_pair(p_challenge public.challenges)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair uuid;
begin
  select c.id into v_pair
  from public.group_members m join public.coachings c on c.id = m.coaching_id
  where m.group_id = p_challenge.group_id and c.client_id = auth.uid() and c.status in ('trial', 'active')
  limit 1;
  if auth.uid() is null or v_pair is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return v_pair;
end $$;
comment on function private.challenge_pair(public.challenges) is 'The caller''s live pair in the challenge group.';
revoke all on function private.challenge_pair(public.challenges) from public;

-- join_challenge: a client of the group joins a challenge that has not ended. The metric's share must be on
-- (share_needed, detail = the category); the leaderboard stays off unless asked for (Q40).
create function public.join_challenge(p_challenge_id uuid, p_show_on_leaderboard boolean default false, p_alias text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_pair uuid;
  v_alias text := nullif(pg_catalog.btrim(p_alias), '');
begin
  select * into v_challenge from public.challenges c where c.id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  v_pair := private.challenge_pair(v_challenge);
  if private.challenge_state(v_challenge) not in ('upcoming', 'active') then
    raise exception 'challenge_closed' using errcode = 'P0001';
  end if;
  if v_alias is not null and pg_catalog.char_length(v_alias) > 30 then
    raise exception 'bad_alias' using errcode = 'P0001';
  end if;
  if not private.pair_shares(v_pair, private.challenge_share(v_challenge.metric)) then
    raise exception 'share_needed' using errcode = 'P0001', detail = private.challenge_share(v_challenge.metric)::text;
  end if;
  insert into public.challenge_participants (challenge_id, coaching_id, user_id, show_on_leaderboard, alias)
  values (v_challenge.id, v_pair, auth.uid(), coalesce(p_show_on_leaderboard, false) and v_challenge.leaderboard, v_alias)
  on conflict (challenge_id, coaching_id) do nothing;
  perform private.refresh_challenge_scores(v_challenge.id);
end $$;
comment on function public.join_challenge(uuid, boolean, text) is
  'A client of the group joins a challenge (opt-in); the metric must be shared with the trainer (wave-3 §2.3).';
revoke all on function public.join_challenge(uuid, boolean, text) from public, anon;
grant execute on function public.join_challenge(uuid, boolean, text) to authenticated;

-- set_challenge_leaderboard: the participant shows or hides themselves on the leaderboard, with an alias.
create function public.set_challenge_leaderboard(p_challenge_id uuid, p_show boolean, p_alias text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alias text := nullif(pg_catalog.btrim(p_alias), '');
begin
  if v_alias is not null and pg_catalog.char_length(v_alias) > 30 then
    raise exception 'bad_alias' using errcode = 'P0001';
  end if;
  update public.challenge_participants p
  set show_on_leaderboard = coalesce(p_show, false) and c.leaderboard, alias = v_alias
  from public.challenges c
  where c.id = p.challenge_id and p.challenge_id = p_challenge_id and p.user_id = auth.uid();
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
end $$;
comment on function public.set_challenge_leaderboard(uuid, boolean, text) is
  'The participant turns their place on the leaderboard on or off (Q40) and sets an alias.';
revoke all on function public.set_challenge_leaderboard(uuid, boolean, text) from public, anon;
grant execute on function public.set_challenge_leaderboard(uuid, boolean, text) to authenticated;

-- leave_challenge: the participant leaves; their score goes with them.
create function public.leave_challenge(p_challenge_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.challenge_participants p where p.challenge_id = p_challenge_id and p.user_id = auth.uid();
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
end $$;
comment on function public.leave_challenge(uuid) is 'The participant leaves a challenge.';
revoke all on function public.leave_challenge(uuid) from public, anon;
grant execute on function public.leave_challenge(uuid) to authenticated;

-- Reads ------------------------------------------------------------------------------------------------------

-- my_challenges: the challenges of the caller's groups that are upcoming, running or finished in the last 30
-- days, with whether they joined and whether the metric is shared.
create function public.my_challenges()
returns table (id uuid, title text, metric text, goal integer, starts_on date, ends_on date, leaderboard boolean,
               state text, trainer_name text, coaching_id uuid, joined boolean, shared boolean,
               show_on_leaderboard boolean, alias text, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id, ch.title, ch.metric, ch.goal, ch.starts_on, ch.ends_on, ch.leaderboard,
         private.challenge_state(ch),
         coalesce(nullif(pg_catalog.btrim(t.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', t.first_name, t.last_name))),
         c.id, p.challenge_id is not null, private.pair_shares(c.id, private.challenge_share(ch.metric)),
         coalesce(p.show_on_leaderboard, false), p.alias, p.score
  from public.challenges ch
  join public.group_members m on m.group_id = ch.group_id
  join public.coachings c on c.id = m.coaching_id and c.client_id = auth.uid() and c.status in ('trial', 'active')
  join public.profiles t on t.id = ch.trainer_id
  left join public.challenge_participants p on p.challenge_id = ch.id and p.coaching_id = c.id
  where ch.cancelled_at is null
    and (ch.finished_at is null or ch.ends_on >= private.user_today(auth.uid()) - 30)
  order by ch.starts_on desc, ch.created_at desc
$$;
comment on function public.my_challenges() is 'Challenges of the client''s groups, recent and running, with their place in them.';
revoke all on function public.my_challenges() from public, anon;
grant execute on function public.my_challenges() to authenticated;

-- challenge_board: the leaderboard. Places are ranked by score over every participant. The trainer reads every
-- row with the client's full name and alias; a participant reads the rows shown on the leaderboard and their own
-- (§2.4-17, 18), each named by the alias or the first name; anybody else reads nothing. hidden marks a participant
-- who stopped sharing the metric: their score is the last one counted.
create function public.challenge_board(p_challenge_id uuid)
returns table (place integer, name text, alias text, score integer, is_me boolean, shown boolean, hidden boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_trainer boolean;
begin
  select * into v_challenge from public.challenges c where c.id = p_challenge_id;
  if v_challenge.id is null or auth.uid() is null then
    return;
  end if;
  v_trainer := v_challenge.trainer_id = auth.uid();
  if not v_trainer and not exists (
       select 1 from public.challenge_participants p where p.challenge_id = v_challenge.id and p.user_id = auth.uid()) then
    return;
  end if;
  perform private.refresh_challenge_scores(v_challenge.id);
  return query
  select b.place, b.name, b.alias, b.score, b.is_me, b.shown, b.hidden
  from (
    select (pg_catalog.rank() over (order by p.score desc))::integer as place,
           case when v_trainer
             then coalesce(nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', pr.first_name, pr.last_name)), ''),
                           nullif(pg_catalog.btrim(pr.display_name), ''), '–')
             else coalesce(p.alias, nullif(pg_catalog.btrim(pr.first_name), ''), nullif(pg_catalog.btrim(pr.display_name), ''), '–')
           end as name,
           case when v_trainer then p.alias end as alias,
           p.score, p.user_id = auth.uid() as is_me, p.show_on_leaderboard and v_challenge.leaderboard as shown,
           not private.pair_shares(p.coaching_id, private.challenge_share(v_challenge.metric)) as hidden,
           p.joined_at
    from public.challenge_participants p
    join public.profiles pr on pr.id = p.user_id
    where p.challenge_id = v_challenge.id
  ) b
  where v_trainer or b.is_me or b.shown
  order by b.place, b.joined_at;
end $$;
comment on function public.challenge_board(uuid) is
  'The challenge leaderboard: the trainer sees everyone, a participant the ones shown and themselves (Q40).';
revoke all on function public.challenge_board(uuid) from public, anon;
grant execute on function public.challenge_board(uuid) to authenticated;

-- Finishing --------------------------------------------------------------------------------------------------

-- Fixes the scores of challenges whose last day is over for the trainer and awards their badges, each with a
-- "badge" message: challenge_done at the goal, challenge_winner to the places 1–3 above zero on a leaderboard.
create function private.finish_challenges()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_done integer := 0;
  r record;
begin
  for v_challenge in
    select * from public.challenges c
    where c.cancelled_at is null and c.finished_at is null and c.ends_on < private.user_today(c.trainer_id)
    for update skip locked
  loop
    perform private.refresh_challenge_scores(v_challenge.id);
    update public.challenges c set finished_at = pg_catalog.now() where c.id = v_challenge.id;
    for r in
      select p.user_id, v_challenge.goal is not null and p.score >= v_challenge.goal as reached,
             v_challenge.leaderboard and p.score > 0 and pg_catalog.rank() over (order by p.score desc) <= 3 as winner
      from public.challenge_participants p
      where p.challenge_id = v_challenge.id
    loop
      if r.reached then
        perform private.grant_challenge_badge(r.user_id, 'challenge_done');
      end if;
      if r.winner then
        perform private.grant_challenge_badge(r.user_id, 'challenge_winner');
      end if;
    end loop;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- A challenge badge, once, with its bot message.
create function private.grant_challenge_badge(p_user uuid, p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.user_badges (user_id, badge_code) values (p_user, p_code) on conflict (user_id, badge_code) do nothing;
  if found then
    perform private.enqueue_notification(
      'badge', 'badge:' || p_user::text || ':' || p_code,
      pg_catalog.jsonb_build_object('badge', p_code), p_user);
  end if;
end $$;
comment on function private.grant_challenge_badge(uuid, text) is 'Awards a challenge badge once and queues its message.';
revoke all on function private.grant_challenge_badge(uuid, text) from public;

comment on function private.finish_challenges() is
  'Finishes the challenges whose last day is over and awards challenge_done and challenge_winner (wave-3 §2.3-13).';
revoke all on function private.finish_challenges() from public;

select cron.schedule('challenges-finish', '7 * * * *', 'select private.finish_challenges()');

-- Leaving with the pair ----------------------------------------------------------------------------------------

-- A pair removed from a group leaves that group's challenges.
create function private.leave_challenges_on_group_exit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.challenge_participants p
  using public.challenges c
  where c.id = p.challenge_id and c.group_id = old.group_id and p.coaching_id = old.coaching_id
    and c.finished_at is null;
  return old;
end $$;
revoke all on function private.leave_challenges_on_group_exit() from public;

create trigger group_members_leave_challenges
  after delete on public.group_members
  for each row execute function private.leave_challenges_on_group_exit();

-- An ended pair leaves the trainer's running challenges (edge cases: «Пара завершена»).
create function private.leave_challenges_on_pair_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('trial', 'active') and old.status in ('trial', 'active') then
    delete from public.challenge_participants p
    using public.challenges c
    where c.id = p.challenge_id and p.coaching_id = new.id and c.finished_at is null;
  end if;
  return new;
end $$;
revoke all on function private.leave_challenges_on_pair_end() from public;

create trigger coachings_leave_challenges
  after update of status on public.coachings
  for each row execute function private.leave_challenges_on_pair_end();

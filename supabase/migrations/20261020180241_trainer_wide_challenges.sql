-- A trainer's challenge for all of their clients, without a group (marketing/viral-and-gamification.md §2, item 5):
-- groups are a Pro feature and many trainers have none, yet they want "10 тренировок до Нового года" too.
--   * challenges.group_id is null for such a challenge; it is open to every live pair (trial or active) of the
--     trainer. Any trainer can run one, with no plan feature: only group challenges need trainer.groups.
--   * create_challenge takes p_group_id null and invites every live pair by the bot, the same message as in a group.
--   * challenge_pair, my_challenges and the read policy learn the null group. Joining, the leaderboard, finishing
--     and the badges work as for a group (20261017103914_group_challenges.sql and its follow-ups).
--   * An ended pair leaves the running challenge by the existing coachings trigger; the group trigger never matches.

alter table public.challenges alter column group_id drop not null;
comment on column public.challenges.group_id is 'The group the challenge is for; null when it is for every client of the trainer.';

-- Policies ---------------------------------------------------------------------------------------------------

drop policy "challenges: trainer and group members read" on public.challenges;
create policy "challenges: trainer and group members read"
  on public.challenges for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or exists (
      select 1 from public.group_members m
      where m.group_id = challenges.group_id and m.client_id = (select auth.uid()))
    or (
      group_id is null
      and exists (
        select 1 from public.coachings c
        where c.trainer_id = challenges.trainer_id and c.client_id = (select auth.uid()) and c.status in ('trial', 'active'))));

-- The live pairs a challenge is open to: the pairs of its group, or every live pair of the trainer.
create function private.challenge_pairs(p_challenge public.challenges)
returns table (coaching_id uuid, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.client_id
  from public.coachings c
  where c.status in ('trial', 'active')
    and c.client_id is not null
    and c.trainer_id = p_challenge.trainer_id
    and (p_challenge.group_id is null
         or exists (select 1 from public.group_members m where m.group_id = p_challenge.group_id and m.coaching_id = c.id))
$$;
comment on function private.challenge_pairs(public.challenges) is
  'The live pairs a challenge is open to: its group''s, or every pair of the trainer when it has no group.';
revoke all on function private.challenge_pairs(public.challenges) from public;

-- Trainer RPCs -----------------------------------------------------------------------------------------------

-- create_challenge: starts on the trainer's today or later; invites every live pair of the group, or of the
-- trainer when p_group_id is null, by the bot. Only a group challenge needs trainer.groups.
create or replace function public.create_challenge(
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
  v_trainer uuid := auth.uid();
  v_group_id uuid;
  v_title text := pg_catalog.btrim(p_title);
  v_name text;
  v_id uuid;
  v_challenge public.challenges;
  r record;
begin
  if p_group_id is null then
    if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
      raise exception 'not_a_trainer' using errcode = '42501';
    end if;
  else
    v_trainer := private.assert_trainer_feature('trainer.groups');
    v_group_id := (private.own_group(p_group_id)).id;
  end if;
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
  values (v_trainer, v_group_id, v_title, p_metric, p_goal, p_starts_on, p_starts_on + p_weeks * 7 - 1,
          coalesce(p_leaderboard, true))
  returning * into v_challenge;
  v_id := v_challenge.id;

  select coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)))
  into v_name
  from public.profiles p where p.id = v_trainer;
  for r in select distinct cp.client_id from private.challenge_pairs(v_challenge) cp loop
    perform private.enqueue_notification(
      'challenge', 'challenge:' || v_id::text || ':' || r.client_id::text,
      pg_catalog.jsonb_build_object('challenge_id', v_id, 'title', v_title, 'metric', p_metric,
        'starts_on', p_starts_on, 'ends_on', p_starts_on + p_weeks * 7 - 1, 'trainer_name', v_name),
      r.client_id);
  end loop;
  return v_id;
end $$;
comment on function public.create_challenge(uuid, text, text, smallint, date, integer, boolean) is
  'The trainer starts a challenge in a group of theirs, or for all their clients with a null group, and invites '
  'the clients by the bot (wave-3 §2.3, marketing viral item 5).';

-- Client RPCs ------------------------------------------------------------------------------------------------

-- The caller's live pair the challenge is open to, or not_allowed.
create or replace function private.challenge_pair(p_challenge public.challenges)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair uuid;
begin
  select cp.coaching_id into v_pair
  from private.challenge_pairs(p_challenge) cp
  where cp.client_id = auth.uid()
  limit 1;
  if auth.uid() is null or v_pair is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return v_pair;
end $$;
comment on function private.challenge_pair(public.challenges) is 'The caller''s live pair the challenge is open to.';

-- Reads ------------------------------------------------------------------------------------------------------

-- my_challenges: the challenges of the caller's groups and their trainers' challenges for all clients that are
-- upcoming, running or finished in the last 30 days, with whether they joined and whether the metric is shared.
create or replace function public.my_challenges()
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
  from public.coachings c
  join public.challenges ch on ch.trainer_id = c.trainer_id
  join public.profiles t on t.id = ch.trainer_id
  left join public.challenge_participants p on p.challenge_id = ch.id and p.coaching_id = c.id
  where c.client_id = auth.uid() and c.status in ('trial', 'active')
    and (ch.group_id is null
         or exists (select 1 from public.group_members m where m.group_id = ch.group_id and m.coaching_id = c.id))
    and ch.cancelled_at is null
    and (ch.finished_at is null or ch.ends_on >= private.user_today(auth.uid()) - 30)
  order by ch.starts_on desc, ch.created_at desc
$$;
comment on function public.my_challenges() is
  'Challenges of the client''s groups and of their trainers for all clients, recent and running, with their place in them.';

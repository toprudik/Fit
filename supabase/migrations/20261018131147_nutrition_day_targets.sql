-- Past days keep the nutrition target they had (wave-2 §5.4; plan-remaining §2.14, §5.4). active_nutrition_target
-- resolved every day against the pair's status, its nutrition permission, the group membership and the client's
-- chosen target as they are now, so ending a pair, revoking the permission or leaving a group rewrote the adherence,
-- streaks and monthly reports of days already over.
--   * private.nutrition_day_targets: the target each client had on a finished local day, null when there was none.
--     private.freeze_nutrition_days writes the last 7 finished days that have no row yet, every 5 minutes, for every
--     client with a target of their own or a group membership; the migration fills the days since their first one.
--   * private.live_nutrition_target: the previous body of active_nutrition_target (20261017084217_trainer_groups.sql).
--   * private.active_nutrition_target: a finished day with a row returns that row, any other day the live target.
--     Every caller (adherence, streaks, monthly reports, nutrition_target_on) reads past days through it.

-- Tables -----------------------------------------------------------------------------------------------------

create table private.nutrition_day_targets (
  client_id uuid not null references public.profiles (id) on delete cascade,
  day       date not null,
  target_id uuid references public.nutrition_targets (id) on delete cascade,
  primary key (client_id, day)
);
comment on table private.nutrition_day_targets is
  'The nutrition target of a client on a finished local day, null when none; written by private.freeze_nutrition_days.';
create index nutrition_day_targets_target_id_idx on private.nutrition_day_targets (target_id) where target_id is not null;
revoke all on table private.nutrition_day_targets from public;

-- Functions --------------------------------------------------------------------------------------------------

-- The target in force for the client on a day by today's rules: a trainer target (the one the client picked, else
-- the latest set) of a live pair that shares nutrition, else the template of such a pair's group, else the
-- calculator's (wave-2 §2.10, §2.13, §6.1, §6.6). Body of active_nutrition_target in 20261017084217_trainer_groups.sql.
create function private.live_nutrition_target(p_client uuid, p_day date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x.id
  from (
    select t.id, 1 as rank, t.coaching_id, t.created_at
    from public.nutrition_targets t
    where t.client_id = p_client and t.source = 'trainer'
      and t.effective_from <= p_day and (t.effective_to is null or t.effective_to > p_day)
      and private.trainer_target_counts(t.coaching_id)
    union all
    select t.id, 2, c.id, t.created_at
    from public.coachings c
    join public.nutrition_targets t on t.group_id = private.effective_nutrition_group(c.id) and t.source = 'group'
    where c.client_id = p_client
      and t.effective_from <= p_day and (t.effective_to is null or t.effective_to > p_day)
      and private.trainer_target_counts(c.id)
    union all
    select t.id, 3, null, t.created_at
    from public.nutrition_targets t
    where t.client_id = p_client and t.source = 'calculator'
      and t.effective_from <= p_day and (t.effective_to is null or t.effective_to > p_day)
  ) x
  left join public.body_profiles b on b.user_id = p_client
  order by x.rank, (x.coaching_id is not distinct from b.preferred_target_coaching_id) desc, x.created_at desc
  limit 1
$$;
comment on function private.live_nutrition_target(uuid, date) is
  'The client''s target for a day by the current pairs, permissions and groups; active_nutrition_target uses it for '
  'today, the future and finished days not yet frozen.';
revoke all on function private.live_nutrition_target(uuid, date) from public;

create or replace function private.active_nutrition_target(p_client uuid, p_day date)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if p_day < private.client_today(p_client) then
    select f.target_id into v_target
    from private.nutrition_day_targets f
    where f.client_id = p_client and f.day = p_day;
    if found then
      return v_target;
    end if;
  end if;
  return private.live_nutrition_target(p_client, p_day);
end;
$$;
comment on function private.active_nutrition_target(uuid, date) is
  'The client''s target for a day: the frozen one for a finished day, else the trainer target the client picked, else '
  'the latest trainer target of a live pair that shares nutrition, else such a pair''s group template, else the '
  'calculator''s (wave-2 §2.10, §2.13, §5.4, §6).';

-- The clients whose days are frozen: those with a target of their own or a group membership.
create function private.nutrition_day_clients()
returns table (client_id uuid, since date)
language sql
stable
security definer
set search_path = ''
as $$
  select s.client_id, pg_catalog.min(s.since)
  from (
    select t.client_id, t.effective_from as since
    from public.nutrition_targets t
    where t.client_id is not null
    union all
    select m.client_id, (m.added_at at time zone coalesce(p.time_zone, 'UTC'))::date
    from public.group_members m
    left join public.profiles p on p.id = m.client_id
  ) s
  group by s.client_id
$$;
comment on function private.nutrition_day_clients() is
  'Clients with a target of their own or a group membership, with the first day either began.';
revoke all on function private.nutrition_day_clients() from public;

-- Freezes the target of the finished days of the last p_days that have no row yet; returns how many it wrote.
create function private.freeze_nutrition_days(p_days integer default 7)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.nutrition_day_targets (client_id, day, target_id)
  select c.client_id, d.day::date, private.live_nutrition_target(c.client_id, d.day::date)
  from private.nutrition_day_clients() c
  cross join lateral pg_catalog.generate_series(
    greatest(c.since, private.client_today(c.client_id) - p_days)::timestamp,
    (private.client_today(c.client_id) - 1)::timestamp,
    interval '1 day') d(day)
  where not exists (
    select 1 from private.nutrition_day_targets f where f.client_id = c.client_id and f.day = d.day::date)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function private.freeze_nutrition_days(integer) is
  'Writes the target of each finished day of the last p_days without a row, for clients with targets or groups.';
revoke all on function private.freeze_nutrition_days(integer) from public;

-- Every day since each client's first target or group, by the rules in force now: the best record there is.
select private.freeze_nutrition_days(100000);

-- cron.schedule with a name replaces a job of the same name, so re-running this file is harmless.
select cron.schedule('nutrition-days', '*/5 * * * *', 'select private.freeze_nutrition_days()');

-- Goal and nutrition target (wave-2 §1–2, data-model §2.2): the client's goal with its history, the inputs of
-- the Mifflin–St Jeor calculator, and the target versions (calculator or trainer). Group templates (§6) come
-- with the groups: the 'group' source and group_id are here already, their FK arrives with public.groups.
-- * Every write goes through a function: tables grant select only (body_profiles also its own inputs).
-- * A target is immutable; a new version closes the previous one from the client's today, so past days keep
--   the target they had (§2.14). A version replaced on the day it started is dropped instead.
-- * The active target of a day: the trainer's (the one the client picked, else the latest set) in a live pair
--   that shares nutrition, else the calculator's (§2.10, §2.13).

create type public.goal_type as enum ('lose', 'gain', 'maintain');
create type public.activity_level as enum ('minimal', 'low', 'moderate', 'high', 'very_high');
create type public.calc_sex as enum ('male', 'female');
create type public.target_source as enum ('trainer', 'group', 'calculator');

-- client_goals: history of the client's goal; the latest row is the goal (§1.3).
create table public.client_goals (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal    public.goal_type not null,
  set_at  timestamptz not null default now()
);
comment on table public.client_goals is 'History of the client''s goal (wave-2 §1); the latest row is the current goal.';
create index client_goals_user_id_set_at_idx on public.client_goals (user_id, set_at desc);
alter table public.client_goals enable row level security;
revoke all on table public.client_goals from anon, authenticated;

-- body_profiles: the calculator inputs other than weight (weight is the latest measurement or typed in).
create table public.body_profiles (
  user_id                      uuid primary key references public.profiles (id) on delete cascade,
  calc_sex                     public.calc_sex,
  birth_date                   date check (birth_date > date '1900-01-01'),
  height_cm                    numeric(4, 1) check (height_cm between 80 and 260),
  activity_level               public.activity_level,
  preferred_target_coaching_id uuid references public.coachings (id) on delete set null,
  updated_at                   timestamptz not null default now()
);
comment on table public.body_profiles is 'Calculator inputs of a user (wave-2 §2.1) and whose trainer target is active (§2.13).';
comment on column public.body_profiles.calc_sex is 'Sex for the formula only.';
comment on column public.body_profiles.preferred_target_coaching_id is
  'Pair whose trainer target the client picked as active; null = the latest set. Written by choose_nutrition_target.';
create index body_profiles_preferred_target_coaching_id_idx on public.body_profiles (preferred_target_coaching_id)
  where preferred_target_coaching_id is not null;
create trigger body_profiles_set_updated_at
  before update on public.body_profiles
  for each row execute function public.set_updated_at();
alter table public.body_profiles enable row level security;
revoke all on table public.body_profiles from anon, authenticated;

-- nutrition_targets: immutable versions of a target with the days they cover.
create table public.nutrition_targets (
  id                    uuid primary key default gen_random_uuid(),
  source                public.target_source not null,
  client_id             uuid references public.profiles (id) on delete cascade,
  coaching_id           uuid references public.coachings (id) on delete cascade,
  group_id              uuid,
  kcal                  smallint not null check (kcal between 500 and 10000),
  protein_g             smallint check (protein_g between 0 and 1000),
  fat_g                 smallint check (fat_g between 0 and 1000),
  carbs_g               smallint check (carbs_g between 0 and 2000),
  water_ml              integer check (water_ml between 0 and 10000),
  steps_target          integer check (steps_target between 0 and 100000),
  calc_inputs           jsonb,
  effective_from        date not null,
  effective_to          date,
  low_kcal_confirmed_at timestamptz,
  set_by                uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint nutrition_targets_source_check check (case source
    when 'trainer'    then coaching_id is not null and client_id is not null and group_id is null
    when 'group'      then group_id is not null and client_id is null and coaching_id is null
    when 'calculator' then client_id is not null and coaching_id is null and group_id is null
  end),
  constraint nutrition_targets_period_check check (effective_to is null or effective_to > effective_from)
);
comment on table public.nutrition_targets is
  'Immutable versions of a nutrition target (wave-2 §2): the calculator''s, a trainer''s for a pair, a group template.';
comment on column public.nutrition_targets.calc_inputs is 'Snapshot of the calculator inputs: weight, height, age, sex, activity, goal, bmr.';
comment on column public.nutrition_targets.effective_from is 'First day it applies, in the client''s time zone.';
comment on column public.nutrition_targets.effective_to is 'First day it no longer applies (exclusive); null = in force.';
comment on column public.nutrition_targets.low_kcal_confirmed_at is 'When the trainer confirmed the warning for a target under 1200/1500 kcal (§2.12).';
create unique index nutrition_targets_trainer_open_idx on public.nutrition_targets (coaching_id)
  where source = 'trainer' and effective_to is null;
create unique index nutrition_targets_group_open_idx on public.nutrition_targets (group_id)
  where source = 'group' and effective_to is null;
create unique index nutrition_targets_calculator_open_idx on public.nutrition_targets (client_id)
  where source = 'calculator' and effective_to is null;
create index nutrition_targets_client_id_effective_from_idx on public.nutrition_targets (client_id, effective_from);
create index nutrition_targets_coaching_id_idx on public.nutrition_targets (coaching_id) where coaching_id is not null;
create index nutrition_targets_set_by_idx on public.nutrition_targets (set_by) where set_by is not null;
alter table public.nutrition_targets enable row level security;
revoke all on table public.nutrition_targets from anon, authenticated;

-- Policies. The goal is shared with the nutrition category (§1.2); the trainer reads the targets of own pairs
-- and the client's calculator target while nutrition is shared, never another trainer's target (§2.8).

create policy "client_goals: client and nutrition-sharing trainers read"
  on public.client_goals for select
  to authenticated
  using (user_id = any ((select private.viewable_client_ids('nutrition'))::uuid[]));

create policy "body_profiles: own row"
  on public.body_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "body_profiles: own insert"
  on public.body_profiles for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "body_profiles: own update"
  on public.body_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "nutrition_targets: client, own pairs, calculator for sharing trainers"
  on public.nutrition_targets for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (source = 'trainer' and exists (
          select 1 from public.coachings c
          where c.id = coaching_id and c.trainer_id = (select auth.uid()))
        and private.can_view(client_id, 'nutrition'))
    or (source = 'calculator' and client_id = any ((select private.viewable_client_ids('nutrition'))::uuid[])));

grant select on table public.client_goals, public.nutrition_targets to authenticated;
grant select on table public.body_profiles to authenticated;
grant insert (user_id, calc_sex, birth_date, height_cm, activity_level) on table public.body_profiles to authenticated;
-- user_id is in the update grant only for upserts (on conflict sets every sent column); the policy pins it.
grant update (user_id, calc_sex, birth_date, height_cm, activity_level) on table public.body_profiles to authenticated;

-- private.client_today: the client's current day, in the time zone mirrored on the profile.
create function private.client_today(p_client uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (pg_catalog.now() at time zone coalesce((select p.time_zone from public.profiles p where p.id = p_client), 'UTC'))::date
$$;
comment on function private.client_today(uuid) is 'The client''s current date in the time zone of the profile.';
revoke all on function private.client_today(uuid) from public;

-- private.min_kcal: the floor under which the calculator offers nothing and a trainer must confirm (§2.8, §2.12).
create function private.min_kcal(p_sex public.calc_sex)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_sex = 'male' then 1500 else 1200 end
$$;
comment on function private.min_kcal(public.calc_sex) is 'Lowest kcal the calculator offers: 1500 for men, 1200 otherwise (wave-2 §2.8).';
revoke all on function private.min_kcal(public.calc_sex) from public;

-- private.mifflin: the calculator itself (§2.2–2.8). Returns { status, ... }: 'ok' with kcal and macros, or
-- 'incomplete' (an input is missing), 'minor' (under 18), 'too_low' (under the floor even at BMR).
create function private.mifflin(
  p_sex public.calc_sex,
  p_birth_date date,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_activity public.activity_level,
  p_goal public.goal_type,
  p_today date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_age integer;
  v_bmr numeric;
  v_kcal integer;
  v_protein_per_kg numeric;
  v_fat_per_kg numeric := 0.9;
  v_protein integer;
  v_fat integer;
  v_carbs integer;
begin
  if p_sex is null or p_birth_date is null or p_height_cm is null or p_weight_kg is null or p_activity is null or p_goal is null then
    return '{"status": "incomplete"}'::jsonb;
  end if;
  v_age := pg_catalog.date_part('year', pg_catalog.age(p_today, p_birth_date))::integer;
  if v_age < 18 then
    return '{"status": "minor"}'::jsonb;
  end if;

  v_bmr := 10 * p_weight_kg + 6.25 * p_height_cm - 5 * v_age + case p_sex when 'male' then 5 else -161 end;
  v_kcal := pg_catalog.round(
    greatest(
      v_bmr,
      v_bmr
        * case p_activity when 'minimal' then 1.2 when 'low' then 1.375 when 'moderate' then 1.55 when 'high' then 1.725 else 1.9 end
        * case p_goal when 'lose' then 0.85 when 'gain' then 1.10 else 1 end
    ) / 10) * 10;
  if v_kcal < private.min_kcal(p_sex) then
    return pg_catalog.jsonb_build_object('status', 'too_low', 'bmr', pg_catalog.round(v_bmr, 2), 'age', v_age);
  end if;

  -- Macros (§2.5): protein 1.8 g/kg (2.0 when losing), fat 0.9 g/kg, carbs take the rest. When nothing is left
  -- for carbs, fat drops to 0.6 g/kg, then protein to 1.6 g/kg.
  v_protein_per_kg := case when p_goal = 'lose' then 2.0 else 1.8 end;
  if v_kcal - 4 * v_protein_per_kg * p_weight_kg - 9 * v_fat_per_kg * p_weight_kg < 0 then
    v_fat_per_kg := 0.6;
    if v_kcal - 4 * v_protein_per_kg * p_weight_kg - 9 * v_fat_per_kg * p_weight_kg < 0 then
      v_protein_per_kg := 1.6;
    end if;
  end if;
  v_protein := pg_catalog.round(v_protein_per_kg * p_weight_kg);
  v_fat := pg_catalog.round(v_fat_per_kg * p_weight_kg);
  v_carbs := greatest(0, pg_catalog.round((v_kcal - 4 * v_protein - 9 * v_fat) / 4.0));

  return pg_catalog.jsonb_build_object(
    'status', 'ok', 'kcal', v_kcal, 'protein_g', v_protein, 'fat_g', v_fat, 'carbs_g', v_carbs,
    'bmr', pg_catalog.round(v_bmr, 2), 'age', v_age);
end $$;
comment on function private.mifflin(public.calc_sex, date, numeric, numeric, public.activity_level, public.goal_type, date) is
  'Mifflin–St Jeor calculator of wave-2 §2: status ok with kcal and macros, or incomplete, minor, too_low.';
revoke all on function private.mifflin(public.calc_sex, date, numeric, numeric, public.activity_level, public.goal_type, date) from public;

-- private.current_goal: the latest goal of a user.
create function private.current_goal(p_user uuid)
returns public.goal_type
language sql
stable
security definer
set search_path = ''
as $$
  select g.goal from public.client_goals g where g.user_id = p_user order by g.set_at desc, g.id limit 1
$$;
comment on function private.current_goal(uuid) is 'The latest goal of the user, null when none was chosen.';
revoke all on function private.current_goal(uuid) from public;

-- private.trainer_target_counts: a trainer target counts while its pair is live and shares nutrition.
create function private.trainer_target_counts(p_coaching uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.id = p_coaching and c.status in ('trial', 'active') and d.nutrition)
$$;
comment on function private.trainer_target_counts(uuid) is 'True when the pair is live and shares nutrition, so its trainer target can be active.';
revoke all on function private.trainer_target_counts(uuid) from public;

-- private.active_nutrition_target: the target in force for the client on a day (§2.10, §2.13).
create function private.active_nutrition_target(p_client uuid, p_day date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.nutrition_targets t
  left join public.body_profiles b on b.user_id = p_client
  where t.client_id = p_client
    and t.effective_from <= p_day and (t.effective_to is null or t.effective_to > p_day)
    and (t.source = 'calculator' or private.trainer_target_counts(t.coaching_id))
  order by
    (t.source = 'trainer') desc,
    (t.coaching_id is not distinct from b.preferred_target_coaching_id) desc,
    t.created_at desc
  limit 1
$$;
comment on function private.active_nutrition_target(uuid, date) is
  'The client''s target for a day: the trainer target the client picked, else the latest trainer target of a live '
  'pair that shares nutrition, else the calculator''s (wave-2 §2.10, §2.13). Group templates join with §6.';
revoke all on function private.active_nutrition_target(uuid, date) from public;

-- private.close_target: ends an open target from the client's today; a version that started today is dropped.
create function private.close_target(p_target uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.nutrition_targets t where t.id = p_target and t.effective_from >= p_today;
  update public.nutrition_targets t set effective_to = p_today where t.id = p_target and t.effective_to is null;
end $$;
comment on function private.close_target(uuid, date) is
  'Ends a target before the given day; a version that has not covered a whole day yet is removed.';
revoke all on function private.close_target(uuid, date) from public;

-- set_client_goal: the client picks a goal (§1.1, Q29). Trainers whose own target is active get a message,
-- since their target does not follow the goal (§1.3). Returns false when the goal did not change.
create function public.set_client_goal(p_goal public.goal_type)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.goal_type;
  v_actor public.profiles;
  v_pair record;
begin
  if v_user is null or p_goal is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_goal:' || v_user::text, 0));
  v_before := private.current_goal(v_user);
  if v_before is not distinct from p_goal then
    return false;
  end if;
  insert into public.client_goals (user_id, goal) values (v_user, p_goal);

  if v_before is not null then
    select * into v_actor from public.profiles p where p.id = v_user;
    for v_pair in
      select t.coaching_id, c.trainer_id
      from public.nutrition_targets t
      join public.coachings c on c.id = t.coaching_id
      where t.client_id = v_user and t.source = 'trainer' and t.effective_to is null
        and private.trainer_target_counts(t.coaching_id)
    loop
      perform private.enqueue_notification(
        'goal_changed',
        'goal_changed:' || v_pair.coaching_id::text || ':' || pg_catalog.now()::text,
        pg_catalog.jsonb_build_object(
          'coaching_id', v_pair.coaching_id, 'goal', p_goal, 'previous_goal', v_before,
          'first_name', v_actor.first_name, 'last_name', v_actor.last_name),
        v_pair.trainer_id);
    end loop;
  end if;
  return true;
end $$;
comment on function public.set_client_goal(public.goal_type) is
  'The client sets the goal (wave-2 §1); trainers with their own active target are told (goal_changed).';
revoke all on function public.set_client_goal(public.goal_type) from public, anon;
grant execute on function public.set_client_goal(public.goal_type) to authenticated;

-- calculate_nutrition_target: the calculator for the signed-in client with the saved inputs and a weight.
create function public.calculate_nutrition_target(p_weight_kg numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body public.body_profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_weight_kg is not null and (p_weight_kg < 25 or p_weight_kg > 350) then
    raise exception 'invalid_weight' using errcode = '22023';
  end if;
  select * into v_body from public.body_profiles b where b.user_id = v_user;
  return private.mifflin(v_body.calc_sex, v_body.birth_date, v_body.height_cm, p_weight_kg, v_body.activity_level,
    private.current_goal(v_user), private.client_today(v_user));
end $$;
comment on function public.calculate_nutrition_target(numeric) is
  'Runs the wave-2 §2 calculator for the caller with the saved body profile, the current goal and this weight.';
revoke all on function public.calculate_nutrition_target(numeric) from public, anon;
grant execute on function public.calculate_nutrition_target(numeric) to authenticated;

-- save_calculator_target: the client accepts the calculator's result; it becomes the calculator version from
-- today. The result is computed here again, so a client cannot store a number the calculator would not give.
create function public.save_calculator_target(p_weight_kg numeric)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body public.body_profiles;
  v_goal public.goal_type;
  v_today date;
  v_calc jsonb;
  v_open uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_weight_kg is null or p_weight_kg < 25 or p_weight_kg > 350 then
    raise exception 'invalid_weight' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nutrition_target:' || v_user::text, 0));
  select * into v_body from public.body_profiles b where b.user_id = v_user;
  v_goal := private.current_goal(v_user);
  v_today := private.client_today(v_user);
  v_calc := private.mifflin(v_body.calc_sex, v_body.birth_date, v_body.height_cm, p_weight_kg, v_body.activity_level, v_goal, v_today);
  if v_calc ->> 'status' <> 'ok' then
    raise exception 'calculator_%', v_calc ->> 'status' using errcode = '22023';
  end if;

  select t.id into v_open from public.nutrition_targets t
  where t.client_id = v_user and t.source = 'calculator' and t.effective_to is null;
  if v_open is not null then
    perform private.close_target(v_open, v_today);
  end if;
  insert into public.nutrition_targets
    (source, client_id, kcal, protein_g, fat_g, carbs_g, calc_inputs, effective_from, set_by)
  values (
    'calculator', v_user, (v_calc ->> 'kcal')::smallint, (v_calc ->> 'protein_g')::smallint, (v_calc ->> 'fat_g')::smallint,
    (v_calc ->> 'carbs_g')::smallint,
    pg_catalog.jsonb_build_object(
      'weight_kg', p_weight_kg, 'height_cm', v_body.height_cm, 'age', (v_calc ->> 'age')::integer, 'sex', v_body.calc_sex,
      'activity', v_body.activity_level, 'goal', v_goal, 'bmr', (v_calc ->> 'bmr')::numeric),
    v_today, v_user)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.save_calculator_target(numeric) is
  'Saves the calculator''s result for the caller as the calculator target from today (wave-2 §2).';
revoke all on function public.save_calculator_target(numeric) from public, anon;
grant execute on function public.save_calculator_target(numeric) to authenticated;

-- set_nutrition_target: a trainer sets the target of a client in a live pair that shares nutrition (§2.11–2.12).
-- Macros are optional; a target under the floor needs p_confirm_low, and the confirmation is stored.
create function public.set_nutrition_target(
  p_coaching_id uuid,
  p_kcal integer,
  p_protein_g integer default null,
  p_fat_g integer default null,
  p_carbs_g integer default null,
  p_confirm_low boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_sex public.calc_sex;
  v_today date;
  v_open uuid;
  v_id uuid;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_user is null or v_pair.id is null or v_pair.trainer_id <> v_user or not private.trainer_target_counts(v_pair.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kcal is null or p_kcal < 500 or p_kcal > 10000
     or p_protein_g < 0 or p_protein_g > 1000 or p_fat_g < 0 or p_fat_g > 1000 or p_carbs_g < 0 or p_carbs_g > 2000 then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  select b.calc_sex into v_sex from public.body_profiles b where b.user_id = v_pair.client_id;
  if p_kcal < private.min_kcal(v_sex) and not coalesce(p_confirm_low, false) then
    raise exception 'low_kcal_unconfirmed' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nutrition_target:' || v_pair.client_id::text, 0));
  v_today := private.client_today(v_pair.client_id);
  select t.id into v_open from public.nutrition_targets t
  where t.coaching_id = v_pair.id and t.source = 'trainer' and t.effective_to is null;
  if v_open is not null then
    perform private.close_target(v_open, v_today);
  end if;
  insert into public.nutrition_targets
    (source, client_id, coaching_id, kcal, protein_g, fat_g, carbs_g, effective_from, low_kcal_confirmed_at, set_by)
  values (
    'trainer', v_pair.client_id, v_pair.id, p_kcal, p_protein_g, p_fat_g, p_carbs_g, v_today,
    case when p_kcal < private.min_kcal(v_sex) then pg_catalog.now() end, v_user)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean) is
  'The trainer of a live pair that shares nutrition sets the client''s target from the client''s today (wave-2 §2.11).';
revoke all on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.set_nutrition_target(uuid, integer, integer, integer, integer, boolean) to authenticated;

-- clear_nutrition_target: the trainer removes their target; the next source takes over from today (§2.5).
create function public.clear_nutrition_target(p_coaching_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_open uuid;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_user is null or v_pair.id is null or v_pair.trainer_id <> v_user or v_pair.status = 'ended' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nutrition_target:' || v_pair.client_id::text, 0));
  select t.id into v_open from public.nutrition_targets t
  where t.coaching_id = v_pair.id and t.source = 'trainer' and t.effective_to is null;
  if v_open is null then
    return false;
  end if;
  perform private.close_target(v_open, private.client_today(v_pair.client_id));
  return true;
end $$;
comment on function public.clear_nutrition_target(uuid) is 'The trainer ends their target for the pair from the client''s today.';
revoke all on function public.clear_nutrition_target(uuid) from public, anon;
grant execute on function public.clear_nutrition_target(uuid) to authenticated;

-- choose_nutrition_target: the client picks whose trainer target is active (§2.13); null goes back to the latest.
create function public.choose_nutrition_target(p_coaching_id uuid)
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
  if p_coaching_id is not null and not exists (
    select 1 from public.nutrition_targets t
    join public.coachings c on c.id = t.coaching_id
    where t.coaching_id = p_coaching_id and c.client_id = v_user and t.source = 'trainer' and t.effective_to is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.body_profiles (user_id, preferred_target_coaching_id) values (v_user, p_coaching_id)
  on conflict (user_id) do update set preferred_target_coaching_id = excluded.preferred_target_coaching_id;
end $$;
comment on function public.choose_nutrition_target(uuid) is 'The client picks the pair whose trainer target is active; null = the latest set.';
revoke all on function public.choose_nutrition_target(uuid) from public, anon;
grant execute on function public.choose_nutrition_target(uuid) to authenticated;

-- my_nutrition_target: the caller's active target today with its source, for the client screens.
create function public.my_nutrition_target()
returns table (
  id uuid, source public.target_source, coaching_id uuid, trainer_name text,
  kcal smallint, protein_g smallint, fat_g smallint, carbs_g smallint, effective_from date, calc_inputs jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.source, t.coaching_id,
    coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name))),
    t.kcal, t.protein_g, t.fat_g, t.carbs_g, t.effective_from, t.calc_inputs
  from public.nutrition_targets t
  left join public.coachings c on c.id = t.coaching_id
  left join public.profiles p on p.id = c.trainer_id
  where t.id = private.active_nutrition_target(auth.uid(), private.client_today(auth.uid()))
$$;
comment on function public.my_nutrition_target() is 'The caller''s active nutrition target today with its source and the trainer''s name.';
revoke all on function public.my_nutrition_target() from public, anon;
grant execute on function public.my_nutrition_target() to authenticated;

-- pair_nutrition_state: for the trainer of a pair, whose target is active today without another trainer's
-- values (§2.8): 'mine', 'other_trainer', 'calculator' or 'none'. Null when the caller may not see nutrition.
create function public.pair_nutrition_state(p_coaching_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_active public.nutrition_targets;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.trainer_id <> auth.uid() or not private.trainer_target_counts(v_pair.id) then
    return null;
  end if;
  select * into v_active from public.nutrition_targets t
  where t.id = private.active_nutrition_target(v_pair.client_id, private.client_today(v_pair.client_id));
  return case
    when v_active.id is null then 'none'
    when v_active.source = 'calculator' then 'calculator'
    when v_active.coaching_id = v_pair.id then 'mine'
    else 'other_trainer'
  end;
end $$;
comment on function public.pair_nutrition_state(uuid) is
  'For the pair''s trainer: whose target is active today (mine, other_trainer, calculator, none), never its values.';
revoke all on function public.pair_nutrition_state(uuid) from public, anon;
grant execute on function public.pair_nutrition_state(uuid) to authenticated;

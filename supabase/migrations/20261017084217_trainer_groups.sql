-- Trainer groups and broadcasts (PRD wave-2 §6, Q29; data-model «Группы, рассылки»; screens.md /trainer/groups):
--   * groups: a trainer's segment of clients (not a group session) with a goal, a colour and an optional
--     template target (a nutrition_targets row with source 'group'). Pro feature trainer.groups.
--   * group_members: pairs of the same trainer in a group. A pair takes the template of one group only, its
--     primary nutrition group (coachings.primary_nutrition_group_id). add_group_member asks for that choice
--     when the pair already sits in another group with a template (§6.3).
--   * The template counts like a trainer target of the pair (a live pair that shares nutrition) but yields to
--     any trainer target of the client, and the calculator yields to it (§6.1, §6.6). active_nutrition_target,
--     my_nutrition_target and pair_nutrition_state of 20261017033815_nutrition_targets.sql learn the source.
--   * broadcasts: one message to every member through the notification outbox, at most 5 a local day per trainer
--     (§6.9, trainer.broadcasts). A client mutes one trainer's broadcasts with coachings.broadcasts_muted; their
--     row is still written, as skipped with last_error 'muted', so the stats can say «отключено получателем».

-- Tables -----------------------------------------------------------------------------------------------------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  name        text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 60),
  goal        public.goal_type,
  description text check (pg_catalog.char_length(description) <= 500),
  color       text check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.groups is 'A trainer''s segment of clients (wave-2 §6, Q29), not a group session. Archived, never deleted.';
create index groups_trainer_id_idx on public.groups (trainer_id);
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();
alter table public.groups enable row level security;
revoke all on table public.groups from anon, authenticated;

alter table public.nutrition_targets
  add constraint nutrition_targets_group_id_fkey foreign key (group_id) references public.groups (id) on delete cascade;
create index nutrition_targets_group_id_idx on public.nutrition_targets (group_id) where group_id is not null;

create table public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  coaching_id uuid not null references public.coachings (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (group_id, coaching_id)
);
comment on table public.group_members is 'Pairs in a trainer group. Written by add_group_member; the trainer removes rows.';
create index group_members_coaching_id_idx on public.group_members (coaching_id);
create index group_members_client_id_idx on public.group_members (client_id);
alter table public.group_members enable row level security;
revoke all on table public.group_members from anon, authenticated;

alter table public.coachings
  add column primary_nutrition_group_id uuid references public.groups (id) on delete set null,
  add column broadcasts_muted boolean not null default false;
comment on column public.coachings.primary_nutrition_group_id is
  'The group whose template target applies to the pair when it sits in several (wave-2 §6.4). Written by the group RPCs.';
comment on column public.coachings.broadcasts_muted is 'The client turned off this trainer''s broadcasts (wave-2 §6.9). Written by set_broadcasts_muted.';
create index coachings_primary_nutrition_group_id_idx on public.coachings (primary_nutrition_group_id)
  where primary_nutrition_group_id is not null;

create table public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  body        text not null check (pg_catalog.char_length(body) between 1 and 2000),
  button_kind text check (button_kind in ('deep_link', 'url')),
  button_url  text check (button_url ~ '^https://[^\s]+$' and pg_catalog.char_length(button_url) <= 500),
  deleted_at  timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((button_kind = 'url') = (button_url is not null))
);
comment on table public.broadcasts is
  'A message to a group through the bot (wave-2 §6.9). Never edited; deleted_at removes it from the history.';
create index broadcasts_trainer_id_created_at_idx on public.broadcasts (trainer_id, created_at);
create index broadcasts_group_id_idx on public.broadcasts (group_id);
create index broadcasts_created_by_idx on public.broadcasts (created_by) where created_by is not null;
alter table public.broadcasts enable row level security;
revoke all on table public.broadcasts from anon, authenticated;

alter table public.notification_outbox
  add column broadcast_id uuid references public.broadcasts (id) on delete set null;
create index notification_outbox_broadcast_id_idx on public.notification_outbox (broadcast_id) where broadcast_id is not null;

-- Policies ---------------------------------------------------------------------------------------------------

create policy "groups: trainer reads own"
  on public.groups for select
  to authenticated
  using (trainer_id = (select auth.uid()));

create policy "groups: trainer with the plan creates"
  on public.groups for insert
  to authenticated
  with check (trainer_id = (select auth.uid()) and private.has_entitlement((select auth.uid()), 'trainer.groups'));

create policy "groups: trainer edits own"
  on public.groups for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy "group_members: trainer of the group and the client read"
  on public.group_members for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_id and g.trainer_id = (select auth.uid())));

create policy "group_members: trainer of the group removes"
  on public.group_members for delete
  to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.trainer_id = (select auth.uid())));

create policy "broadcasts: trainer reads own"
  on public.broadcasts for select
  to authenticated
  using (trainer_id = (select auth.uid()));

create policy "broadcasts: trainer removes from history"
  on public.broadcasts for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

-- The trainer also reads the templates of own groups (one select policy per table, 000_schema_invariants).
drop policy "nutrition_targets: client, own pairs, calculator for sharing trainers" on public.nutrition_targets;
create policy "nutrition_targets: client, own pairs, calculator for sharing trainers, own group templates"
  on public.nutrition_targets for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (source = 'trainer' and exists (
          select 1 from public.coachings c
          where c.id = coaching_id and c.trainer_id = (select auth.uid()))
        and private.can_view(client_id, 'nutrition'))
    or (source = 'calculator' and client_id = any ((select private.viewable_client_ids('nutrition'))::uuid[]))
    or (source = 'group' and exists (
          select 1 from public.groups g where g.id = group_id and g.trainer_id = (select auth.uid()))));

grant select on table public.groups, public.group_members, public.broadcasts to authenticated;
grant insert (trainer_id, name, goal, description, color) on table public.groups to authenticated;
grant update (name, goal, description, color, archived_at) on table public.groups to authenticated;
grant delete on table public.group_members to authenticated;
grant update (deleted_at) on table public.broadcasts to authenticated;

-- Helpers ----------------------------------------------------------------------------------------------------

-- The group of the signed-in trainer, not archived, or forbidden (42501).
create function private.own_group(p_group_id uuid)
returns public.groups
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select * into v_group from public.groups g where g.id = p_group_id;
  if auth.uid() is null or v_group.id is null or v_group.trainer_id <> auth.uid() or v_group.archived_at is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_group;
end $$;
comment on function private.own_group(uuid) is 'The caller''s live group, or forbidden.';
revoke all on function private.own_group(uuid) from public;

-- The open template target of a group, if any.
create function private.group_template(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.nutrition_targets t where t.group_id = p_group_id and t.source = 'group' and t.effective_to is null
$$;
comment on function private.group_template(uuid) is 'The template target of a group in force, null when it has none.';
revoke all on function private.group_template(uuid) from public;

-- The group whose template applies to a pair: the primary nutrition group while the pair is in it, the group is
-- live and has a template; otherwise the pair's latest joined live group with a template (§6.4).
create function private.effective_nutrition_group(p_coaching uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id
  from public.group_members m
  join public.groups g on g.id = m.group_id and g.archived_at is null
  join public.coachings c on c.id = m.coaching_id
  where m.coaching_id = p_coaching
    and private.group_template(m.group_id) is not null
  order by (m.group_id is not distinct from c.primary_nutrition_group_id) desc, m.added_at desc, m.group_id
  limit 1
$$;
comment on function private.effective_nutrition_group(uuid) is
  'The group whose template target applies to the pair: its primary nutrition group, else the latest joined one with a template.';
revoke all on function private.effective_nutrition_group(uuid) from public;

-- Nutrition target sources (replaces the versions of 20261017033815_nutrition_targets.sql) ----------------------

-- The target in force for the client on a day: a trainer target (the one the client picked, else the latest set)
-- of a live pair that shares nutrition, else the template of such a pair's group, else the calculator's
-- (wave-2 §2.10, §2.13, §6.1, §6.6).
create or replace function private.active_nutrition_target(p_client uuid, p_day date)
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
comment on function private.active_nutrition_target(uuid, date) is
  'The client''s target for a day: the trainer target the client picked, else the latest trainer target of a live '
  'pair that shares nutrition, else such a pair''s group template, else the calculator''s (wave-2 §2.10, §2.13, §6).';

-- my_nutrition_target: for a group template, coaching_id is the pair it came through and trainer_name its trainer.
create or replace function public.my_nutrition_target()
returns table (
  id uuid, source public.target_source, coaching_id uuid, trainer_name text,
  kcal smallint, protein_g smallint, fat_g smallint, carbs_g smallint, effective_from date, calc_inputs jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.source, coalesce(t.coaching_id, pair.id),
    coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name))),
    t.kcal, t.protein_g, t.fat_g, t.carbs_g, t.effective_from, t.calc_inputs
  from public.nutrition_targets t
  left join public.groups g on g.id = t.group_id
  left join lateral (
    select c.id from public.coachings c
    where c.trainer_id = g.trainer_id and c.client_id = auth.uid() and c.status in ('trial', 'active')
    limit 1) pair on true
  left join public.coachings c on c.id = t.coaching_id
  left join public.profiles p on p.id = coalesce(c.trainer_id, g.trainer_id)
  where t.id = private.active_nutrition_target(auth.uid(), private.client_today(auth.uid()))
$$;
comment on function public.my_nutrition_target() is
  'The caller''s active nutrition target today with its source, its pair and the trainer''s name.';

-- pair_nutrition_state: 'group' when the template of this trainer's group is active.
create or replace function public.pair_nutrition_state(p_coaching_id uuid)
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
    when v_active.source = 'group'
         and exists (select 1 from public.groups g where g.id = v_active.group_id and g.trainer_id = v_pair.trainer_id) then 'group'
    else 'other_trainer'
  end;
end $$;
comment on function public.pair_nutrition_state(uuid) is
  'For the pair''s trainer: whose target is active today (mine, group, other_trainer, calculator, none), never its values.';

-- Members ----------------------------------------------------------------------------------------------------

-- add_group_member: puts a live pair of the trainer into the group (§6.7). When the group has a template and the
-- pair already sits in another live group with one, p_make_primary must say which stays primary (§6.3):
-- true = this group, false = keep the current one; null raises primary_choice_required (P0001). Returns whether
-- the client's goal differs from the group's (§6.2), for the warning; null when the goal is not visible.
create function public.add_group_member(p_group_id uuid, p_coaching_id uuid, p_make_primary boolean default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.groups := private.own_group(p_group_id);
  v_pair public.coachings;
  v_other uuid;
  v_goal public.goal_type;
begin
  if not private.has_entitlement(v_group.trainer_id, 'trainer.groups') then
    raise exception 'plan_required' using errcode = '42501', detail = 'trainer.groups';
  end if;
  select * into v_pair from public.coachings c where c.id = p_coaching_id for update;
  if v_pair.id is null or v_pair.trainer_id <> v_group.trainer_id or v_pair.status not in ('trial', 'active') then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = v_group.id and m.coaching_id = v_pair.id) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  v_other := private.effective_nutrition_group(v_pair.id);
  if private.group_template(v_group.id) is not null and v_other is not null and p_make_primary is null then
    raise exception 'primary_choice_required' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, coaching_id, client_id) values (v_group.id, v_pair.id, v_pair.client_id);
  if private.group_template(v_group.id) is not null and (v_other is null or p_make_primary) then
    update public.coachings c set primary_nutrition_group_id = v_group.id where c.id = v_pair.id;
  elsif v_other is not null and v_pair.primary_nutrition_group_id is distinct from v_other then
    update public.coachings c set primary_nutrition_group_id = v_other where c.id = v_pair.id;
  end if;

  if v_group.goal is null or not private.can_view(v_pair.client_id, 'nutrition') then
    return null;
  end if;
  v_goal := private.current_goal(v_pair.client_id);
  return v_goal is not null and v_goal <> v_group.goal;
end $$;
comment on function public.add_group_member(uuid, uuid, boolean) is
  'Adds the trainer''s live pair to a group, settling the primary nutrition group (wave-2 §6.3, §6.7). '
  'Returns true when the client''s goal differs from the group''s.';
revoke all on function public.add_group_member(uuid, uuid, boolean) from public, anon;
grant execute on function public.add_group_member(uuid, uuid, boolean) to authenticated;

-- set_primary_nutrition_group: the trainer picks which of the pair's groups gives the template (§6.4).
create function public.set_primary_nutrition_group(p_coaching_id uuid, p_group_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.groups := private.own_group(p_group_id);
begin
  if not exists (select 1 from public.group_members m where m.group_id = v_group.id and m.coaching_id = p_coaching_id) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  update public.coachings c set primary_nutrition_group_id = v_group.id where c.id = p_coaching_id;
end $$;
comment on function public.set_primary_nutrition_group(uuid, uuid) is 'The trainer makes a group the pair''s primary nutrition group.';
revoke all on function public.set_primary_nutrition_group(uuid, uuid) from public, anon;
grant execute on function public.set_primary_nutrition_group(uuid, uuid) to authenticated;

-- Template target --------------------------------------------------------------------------------------------

-- How many members would get the template today: live pairs sharing nutrition whose template group is this
-- one (or would be, for a group without a template yet) and whose client has no trainer target (§6.6).
create function public.group_target_impact(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.group_members m
  join public.coachings c on c.id = m.coaching_id
  where m.group_id = (private.own_group(p_group_id)).id
    and private.trainer_target_counts(c.id)
    and coalesce(private.effective_nutrition_group(c.id), m.group_id) = m.group_id
    and not exists (
      select 1 from public.nutrition_targets t
      where t.client_id = c.client_id and t.source = 'trainer' and t.effective_to is null
        and private.trainer_target_counts(t.coaching_id))
$$;
comment on function public.group_target_impact(uuid) is
  'Members whose active target would be the group template today (no trainer target of their own), wave-2 §6.6.';
revoke all on function public.group_target_impact(uuid) from public, anon;
grant execute on function public.group_target_impact(uuid) to authenticated;

-- set_group_target: a new template version from the trainer's today; under 1200 kcal needs p_confirm_low.
-- Members whose primary group has no template take this one as primary.
create function public.set_group_target(
  p_group_id uuid,
  p_kcal integer,
  p_protein_g integer default null,
  p_fat_g integer default null,
  p_carbs_g integer default null,
  p_water_ml integer default null,
  p_steps_target integer default null,
  p_confirm_low boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.groups := private.own_group(p_group_id);
  v_today date := private.client_today(v_group.trainer_id);
  v_open uuid;
  v_id uuid;
begin
  if not private.has_entitlement(v_group.trainer_id, 'trainer.groups') then
    raise exception 'plan_required' using errcode = '42501', detail = 'trainer.groups';
  end if;
  if p_kcal is null or p_kcal < 500 or p_kcal > 10000
     or p_protein_g < 0 or p_protein_g > 1000 or p_fat_g < 0 or p_fat_g > 1000 or p_carbs_g < 0 or p_carbs_g > 2000
     or p_water_ml < 0 or p_water_ml > 10000 or p_steps_target < 0 or p_steps_target > 100000 then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_kcal < private.min_kcal(null) and not coalesce(p_confirm_low, false) then
    raise exception 'low_kcal_unconfirmed' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group_target:' || v_group.id::text, 0));
  v_open := private.group_template(v_group.id);
  if v_open is not null then
    perform private.close_target(v_open, v_today);
  end if;
  insert into public.nutrition_targets
    (source, group_id, kcal, protein_g, fat_g, carbs_g, water_ml, steps_target, effective_from, low_kcal_confirmed_at, set_by)
  values (
    'group', v_group.id, p_kcal, p_protein_g, p_fat_g, p_carbs_g, p_water_ml, p_steps_target, v_today,
    case when p_kcal < private.min_kcal(null) then pg_catalog.now() end, auth.uid())
  returning id into v_id;

  update public.coachings c set primary_nutrition_group_id = v_group.id
  from public.group_members m
  where m.group_id = v_group.id and c.id = m.coaching_id
    and (c.primary_nutrition_group_id is null or private.group_template(c.primary_nutrition_group_id) is null
         or not exists (select 1 from public.group_members o
                        where o.group_id = c.primary_nutrition_group_id and o.coaching_id = c.id));
  return v_id;
end $$;
comment on function public.set_group_target(uuid, integer, integer, integer, integer, integer, integer, boolean) is
  'The trainer sets the group template target from today (wave-2 §6.2, §6.6).';
revoke all on function public.set_group_target(uuid, integer, integer, integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.set_group_target(uuid, integer, integer, integer, integer, integer, integer, boolean) to authenticated;

-- clear_group_target: the group has no template from today.
create function public.clear_group_target(p_group_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.groups := private.own_group(p_group_id);
  v_open uuid := private.group_template(v_group.id);
begin
  if v_open is not null then
    perform private.close_target(v_open, private.client_today(v_group.trainer_id));
  end if;
end $$;
comment on function public.clear_group_target(uuid) is 'The trainer removes the group template; members fall back to the next source from today.';
revoke all on function public.clear_group_target(uuid) from public, anon;
grant execute on function public.clear_group_target(uuid) to authenticated;

-- Group analytics (§6 rule 8) --------------------------------------------------------------------------------

-- Members of live pairs; attendance of the last 30 days (attended out of attended and no-shows) over them, and
-- the average weight change over 30 days among members who share measurements. An aggregate over fewer than 3
-- clients is null. Hitting the target waits for the food diary (§3).
create function public.group_analytics(p_group_id uuid)
returns table (members integer, attendance numeric, attendance_clients integer, weight_change_kg numeric, weight_clients integer)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (select (private.own_group(p_group_id)).id as id),
  pairs as (
    select c.id, c.client_id
    from public.group_members m join g on g.id = m.group_id
    join public.coachings c on c.id = m.coaching_id and c.status in ('trial', 'active')),
  marks as (
    select b.coaching_id, pg_catalog.count(*) filter (where b.status = 'attended') as attended, pg_catalog.count(*) as marked
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.coaching_id in (select id from pairs) and b.status in ('attended', 'no_show')
      and s.starts_at >= pg_catalog.now() - interval '30 days' and s.starts_at < pg_catalog.now()
    group by b.coaching_id),
  weights as (
    select p.client_id,
      (select w.value from public.measurements w where w.client_id = p.client_id and w.kind = 'weight'
         and w.measured_at >= pg_catalog.now() - interval '30 days' order by w.measured_at desc limit 1)
      - (select w.value from public.measurements w where w.client_id = p.client_id and w.kind = 'weight'
         and w.measured_at >= pg_catalog.now() - interval '30 days' order by w.measured_at limit 1) as change
    from pairs p
    where private.can_view(p.client_id, 'measurements'))
  select
    (select pg_catalog.count(*)::integer from pairs),
    case when (select pg_catalog.count(*) from marks) >= 3
      then pg_catalog.round((select pg_catalog.sum(attended)::numeric / pg_catalog.sum(marked) from marks), 3) end,
    (select pg_catalog.count(*)::integer from marks),
    case when (select pg_catalog.count(*) from weights where change is not null) >= 3
      then pg_catalog.round((select pg_catalog.avg(change) from weights where change is not null), 1) end,
    (select pg_catalog.count(*)::integer from weights where change is not null)
$$;
comment on function public.group_analytics(uuid) is
  'Members, attendance over 30 days and average weight change of a group (wave-2 §6 rule 8); null under 3 clients.';
revoke all on function public.group_analytics(uuid) from public, anon;
grant execute on function public.group_analytics(uuid) to authenticated;

-- Broadcasts -------------------------------------------------------------------------------------------------

-- send_broadcast: queues one trainer_broadcast per member of a live pair (§6.9). Raises broadcast_limit (P0001)
-- on the sixth of the trainer's local day (§6.5), group_empty (P0001) without recipients, invalid_broadcast
-- (22023) for a bad text or button. A muted pair's row is written as skipped ('muted') for the stats (§6.6).
create function public.send_broadcast(p_group_id uuid, p_body text, p_button_kind text default null, p_button_url text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.broadcasts');
  v_group public.groups := private.own_group(p_group_id);
  v_body text := pg_catalog.btrim(p_body);
  v_tz text;
  v_day_start timestamptz;
  v_name text;
  v_id uuid;
  v_outbox bigint;
  r record;
begin
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 2000
     or (p_button_kind is not null and p_button_kind not in ('deep_link', 'url'))
     or ((p_button_kind = 'url') <> (p_button_url is not null and p_button_url ~ '^https://[^\s]+$'
                                     and pg_catalog.char_length(p_button_url) <= 500))
     or (p_button_kind is distinct from 'url' and p_button_url is not null) then
    raise exception 'invalid_broadcast' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('broadcasts:' || v_trainer::text, 0));
  select p.time_zone,
         coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)))
  into v_tz, v_name
  from public.profiles p where p.id = v_trainer;
  v_day_start := ((pg_catalog.now() at time zone coalesce(v_tz, 'UTC'))::date)::timestamp at time zone coalesce(v_tz, 'UTC');
  if (select pg_catalog.count(*) from public.broadcasts b where b.trainer_id = v_trainer and b.created_at >= v_day_start) >= 5 then
    raise exception 'broadcast_limit' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.group_members m join public.coachings c on c.id = m.coaching_id
                 where m.group_id = v_group.id and c.status in ('trial', 'active')) then
    raise exception 'group_empty' using errcode = 'P0001';
  end if;

  insert into public.broadcasts (trainer_id, group_id, body, button_kind, button_url, created_by)
  values (v_trainer, v_group.id, v_body, p_button_kind, p_button_url, v_trainer)
  returning id into v_id;

  for r in
    select c.id, c.client_id, c.broadcasts_muted
    from public.group_members m join public.coachings c on c.id = m.coaching_id
    where m.group_id = v_group.id and c.status in ('trial', 'active')
  loop
    if r.broadcasts_muted then
      insert into public.notification_outbox
        (user_id, type, dedupe_key, payload, scheduled_for, deliver_after, status, last_error, broadcast_id)
      values (r.client_id, 'trainer_broadcast', 'broadcast:' || v_id::text || ':' || r.client_id::text, '{}',
              pg_catalog.now(), pg_catalog.now(), 'skipped', 'muted', v_id);
    else
      v_outbox := private.enqueue_notification(
        'trainer_broadcast',
        'broadcast:' || v_id::text || ':' || r.client_id::text,
        pg_catalog.jsonb_build_object('broadcast_id', v_id, 'coaching_id', r.id, 'trainer_name', v_name,
          'body', v_body, 'button_kind', p_button_kind, 'button_url', p_button_url),
        r.client_id);
      update public.notification_outbox o set broadcast_id = v_id where o.id = v_outbox;
    end if;
  end loop;
  return v_id;
end $$;
comment on function public.send_broadcast(uuid, text, text, text) is
  'Sends a message to every member of the trainer''s group through the bot, at most 5 a local day (wave-2 §6.9).';
revoke all on function public.send_broadcast(uuid, text, text, text) from public, anon;
grant execute on function public.send_broadcast(uuid, text, text, text) to authenticated;

-- broadcast_history: the group's broadcasts not removed from the history, newest first, with their stats:
-- sent, deferred (still queued, e.g. quiet hours), undelivered (no Telegram, bot blocked, failed) and muted
-- (the client turned off this trainer's broadcasts or the type).
create function public.broadcast_history(p_group_id uuid)
returns table (
  id uuid, created_at timestamptz, body text, button_kind text, button_url text,
  recipients integer, sent integer, deferred integer, undelivered integer, muted integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.created_at, b.body, b.button_kind, b.button_url,
    pg_catalog.count(o.id)::integer,
    (pg_catalog.count(o.id) filter (where o.status = 'sent'))::integer,
    (pg_catalog.count(o.id) filter (where o.status in ('pending', 'processing')))::integer,
    (pg_catalog.count(o.id) filter (where o.status in ('failed', 'cancelled')
       or (o.status = 'skipped' and o.last_error is distinct from 'muted' and o.last_error is distinct from 'disabled')))::integer,
    (pg_catalog.count(o.id) filter (where o.status = 'skipped' and o.last_error in ('muted', 'disabled')))::integer
  from public.broadcasts b
  left join public.notification_outbox o on o.broadcast_id = b.id
  where b.group_id = (select g.id from public.groups g where g.id = p_group_id and g.trainer_id = auth.uid())
    and b.deleted_at is null
  group by b.id
  order by b.created_at desc
$$;
comment on function public.broadcast_history(uuid) is 'The trainer''s broadcasts of a group with delivery stats (wave-2 §6.9).';
revoke all on function public.broadcast_history(uuid) from public, anon;
grant execute on function public.broadcast_history(uuid) to authenticated;

-- broadcasts_today: how many broadcasts the trainer sent today in their time zone, for the limit hint.
create function public.broadcasts_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.broadcasts b
  join public.profiles p on p.id = b.trainer_id
  where b.trainer_id = auth.uid()
    and b.created_at >= ((pg_catalog.now() at time zone coalesce(p.time_zone, 'UTC'))::date)::timestamp
                         at time zone coalesce(p.time_zone, 'UTC')
$$;
comment on function public.broadcasts_today() is 'Broadcasts the caller sent today (local day), out of 5.';
revoke all on function public.broadcasts_today() from public, anon;
grant execute on function public.broadcasts_today() to authenticated;

-- Client side ------------------------------------------------------------------------------------------------

-- my_groups: the caller's groups through live pairs: name, goal and colour, never the other members (§6.7).
create function public.my_groups()
returns table (group_id uuid, coaching_id uuid, trainer_name text, name text, goal public.goal_type, color text, broadcasts_muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, c.id,
    coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name))),
    g.name, g.goal, g.color, c.broadcasts_muted
  from public.group_members m
  join public.groups g on g.id = m.group_id and g.archived_at is null
  join public.coachings c on c.id = m.coaching_id and c.status in ('trial', 'active')
  join public.profiles p on p.id = c.trainer_id
  where m.client_id = auth.uid()
  order by p.display_name, g.name
$$;
comment on function public.my_groups() is 'Groups the caller is in, with whether that trainer''s broadcasts are muted (wave-2 §6.7).';
revoke all on function public.my_groups() from public, anon;
grant execute on function public.my_groups() to authenticated;

-- set_broadcasts_muted: the client turns one trainer's broadcasts off or on (§6.9).
create function public.set_broadcasts_muted(p_coaching_id uuid, p_muted boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_muted is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  update public.coachings c set broadcasts_muted = p_muted
  where c.id = p_coaching_id and c.client_id = auth.uid();
  if not found then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
end $$;
comment on function public.set_broadcasts_muted(uuid, boolean) is 'The client mutes or unmutes a trainer''s broadcasts.';
revoke all on function public.set_broadcasts_muted(uuid, boolean) from public, anon;
grant execute on function public.set_broadcasts_muted(uuid, boolean) to authenticated;

-- =========================================================================================================
-- The target of a diary day with group templates (§3.9 with §6): a trainer sees a group template's values only
-- for their own group; another trainer's group template is reported like another trainer's target (§2.8).
create or replace function public.nutrition_target_on(p_client_id uuid, p_day date)
returns table (source public.target_source, kcal integer, protein_g integer, fat_g integer, carbs_g integer, other_trainer boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.nutrition_targets;
begin
  if v_user is null or p_client_id is null or p_day is null or not private.can_view(p_client_id, 'nutrition') then
    return;
  end if;
  select * into v_target from public.nutrition_targets t where t.id = private.active_nutrition_target(p_client_id, p_day);
  if v_target.id is null then
    return;
  end if;
  if v_user <> p_client_id
     and ((v_target.source = 'trainer'
           and not exists (select 1 from public.coachings c where c.id = v_target.coaching_id and c.trainer_id = v_user))
       or (v_target.source = 'group'
           and not exists (select 1 from public.groups g where g.id = v_target.group_id and g.trainer_id = v_user))) then
    return query select v_target.source, null::integer, null::integer, null::integer, null::integer, true;
    return;
  end if;
  return query select v_target.source, v_target.kcal::integer, v_target.protein_g::integer, v_target.fat_g::integer,
                      v_target.carbs_g::integer, false;
end $$;
comment on function public.nutrition_target_on(uuid, date) is
  'The target of a diary day for the client or a nutrition-sharing trainer; another trainer''s values, own or group '
  'template, stay hidden (wave-2 §2.8, §3.9, §6).';

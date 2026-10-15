-- Workouts (data-model §2.1 "Тренировки"): exercises and their translations, workout templates, workout logs
-- with exercises and sets, and personal records kept up to date by triggers.
-- Policies: 20261015123700_workouts_policies.sql.

-- exercises: the shared catalog. wger rows come from the import job; custom rows belong to a trainer.
create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  source            public.exercise_source not null,
  wger_id           integer unique,
  wger_uuid         uuid unique,
  -- set null, not cascade: logs keep referencing the exercise after its author deletes the account (R61).
  owner_id          uuid references public.profiles (id) on delete set null,
  name              text not null check (char_length(name) between 1 and 200),  -- author language, or the English wger name
  category          text,                                                        -- wger category or the trainer's own
  muscles_primary   text[] not null default '{}',
  muscles_secondary text[] not null default '{}',
  equipment         text[] not null default '{}',
  video_url         text check (video_url ~ '^https://'),                        -- video as a link (Q25)
  image_path        text,
  license           text,                                                        -- 'CC-BY-SA-4.0' for wger
  license_author    text,                                                        -- wger authors, shown on the card
  source_url        text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint exercises_wger_identity_check check ((source = 'wger') = (wger_id is not null)),
  -- Only custom rows have an owner; a custom row keeps a null owner once its author is gone.
  constraint exercises_owner_check check (source = 'custom' or owner_id is null),
  constraint exercises_wger_license_check check (source <> 'wger' or license is not null),
  constraint exercises_wger_uuid_check check (source = 'wger' or wger_uuid is null),
  constraint exercises_image_folder_check check (
    image_path is null
    or (source = 'wger' and image_path like 'wger/%')
    or (source = 'custom' and (owner_id is null or image_path like ('custom/' || owner_id::text || '/%'))))
);

comment on table public.exercises is
  'An exercise in the catalog: imported from wger (written only by the import job) or a trainer''s own (custom).';
comment on column public.exercises.owner_id is
  'Trainer who created a custom exercise. Null for wger rows, and for custom rows whose author '
  'deleted the account (nobody reads those).';
comment on column public.exercises.image_path is
  'Object name in bucket exercise-media, without the bucket: wger/... for imports, custom/{owner_id}/... for own exercises.';

create index exercises_owner_id_idx on public.exercises (owner_id);
create index exercises_name_trgm on public.exercises using gin (name extensions.gin_trgm_ops);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;
revoke all on table public.exercises from anon, authenticated;

-- exercise_translations: the exercise name and description in one app language.
create table public.exercise_translations (
  exercise_id uuid references public.exercises (id) on delete cascade,
  locale      public.app_locale,
  name        text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (exercise_id, locale)
);

comment on table public.exercise_translations is 'Name and description of an exercise in one app language.';

create index exercise_translations_name_trgm on public.exercise_translations using gin (name extensions.gin_trgm_ops);

create trigger exercise_translations_set_updated_at
  before update on public.exercise_translations
  for each row execute function public.set_updated_at();

alter table public.exercise_translations enable row level security;
revoke all on table public.exercise_translations from anon, authenticated;

-- workout_templates: a trainer's reusable workout. The UI archives; the owner may also delete (R51).
create table public.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,  -- the trainer
  title       text not null check (char_length(title) between 1 and 200),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.workout_templates is
  'A workout template a trainer reuses for clients; logs keep a null template_id if it is deleted.';

create index workout_templates_owner_id_idx on public.workout_templates (owner_id);

create trigger workout_templates_set_updated_at
  before update on public.workout_templates
  for each row execute function public.set_updated_at();

alter table public.workout_templates enable row level security;
revoke all on table public.workout_templates from anon, authenticated;

-- workout_template_items: one exercise of a template with its targets.
create table public.workout_template_items (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.workout_templates (id) on delete cascade,
  position          smallint not null,
  exercise_id       uuid not null references public.exercises (id),
  target_sets       smallint check (target_sets between 1 and 50),
  target_reps       smallint check (target_reps between 1 and 1000),
  target_weight_kg  numeric(6, 2) check (target_weight_kg >= 0),
  target_duration_s integer check (target_duration_s > 0),
  rest_s            smallint check (rest_s >= 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Deferred, so a reorder can swap positions in one statement.
  constraint workout_template_items_template_id_position_key unique (template_id, position) deferrable initially deferred
);

comment on table public.workout_template_items is 'One exercise of a workout template, with target sets, reps, weight or time.';
comment on column public.workout_template_items.target_weight_kg is 'Target weight in kg.';
comment on column public.workout_template_items.target_duration_s is 'Target duration in seconds.';
comment on column public.workout_template_items.rest_s is 'Rest between sets in seconds.';

create index workout_template_items_exercise_id_idx on public.workout_template_items (exercise_id);

create trigger workout_template_items_set_updated_at
  before update on public.workout_template_items
  for each row execute function public.set_updated_at();

alter table public.workout_template_items enable row level security;
revoke all on table public.workout_template_items from anon, authenticated;

-- workout_logs: a workout the client did. A pair log has coaching_id; a self log has coaching_id null and
-- created_by = client_id (R62). A pair log whose pair was deleted keeps coaching_id null and its trainer
-- author, so it is no self log and only the client sees it.
create table public.workout_logs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles (id) on delete cascade,
  coaching_id  uuid,
  -- The plain FK clears booking_id when the booking goes; the composite one below is skipped once a deleted
  -- pair has already cleared coaching_id (MATCH SIMPLE), which would leave a dangling booking_id.
  booking_id   uuid unique references public.bookings (id) on delete set null,
  template_id  uuid references public.workout_templates (id) on delete set null,
  title        text check (char_length(title) <= 200),
  performed_at timestamptz not null,
  local_date   date not null,
  duration_min smallint check (duration_min between 1 and 600),
  notes        text check (char_length(notes) <= 5000),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- The pair must be this client's pair; a client change of the pair (stub, card merge) moves the log along.
  constraint workout_logs_pair_fkey foreign key (coaching_id, client_id)
    references public.coachings (id, client_id)
    on update cascade on delete set null (coaching_id) deferrable initially immediate,
  constraint workout_logs_booking_fkey foreign key (booking_id, coaching_id)
    references public.bookings (id, coaching_id) on delete set null (booking_id) deferrable initially immediate
  -- No "booking implies pair" check: deleting a pair clears coaching_id before the booking cascade clears booking_id.
);

comment on table public.workout_logs is
  'A workout the client did: logged by the client alone (self log) or by the trainer in a pair (pair log).';
comment on column public.workout_logs.coaching_id is
  'Pair the workout belongs to; null = a self log, or a pair log whose pair was deleted (see created_by).';
comment on column public.workout_logs.local_date is 'Date of the workout in the client time zone.';
comment on column public.workout_logs.duration_min is 'Duration in minutes.';
comment on column public.workout_logs.created_by is 'Author of the log; stamped from the signed-in caller.';

create index workout_logs_client_id_performed_at_idx on public.workout_logs (client_id, performed_at desc);
create index workout_logs_coaching_id_performed_at_idx on public.workout_logs (coaching_id, performed_at desc);
create index workout_logs_created_by_idx on public.workout_logs (created_by);
create index workout_logs_template_id_idx on public.workout_logs (template_id) where template_id is not null;

create trigger workout_logs_set_updated_at
  before update on public.workout_logs
  for each row execute function public.set_updated_at();

create trigger workout_logs_stamp_created_by
  before insert on public.workout_logs
  for each row execute function private.stamp_actor('created_by');

alter table public.workout_logs enable row level security;
revoke all on table public.workout_logs from anon, authenticated;

-- workout_log_exercises: one exercise inside a logged workout.
create table public.workout_log_exercises (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid not null references public.workout_logs (id) on delete cascade,
  position    smallint not null,
  exercise_id uuid not null references public.exercises (id),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Deferred, so a reorder can swap positions in one statement.
  constraint workout_log_exercises_log_id_position_key unique (log_id, position) deferrable initially deferred
);

comment on table public.workout_log_exercises is 'One exercise inside a logged workout, in order.';

create index workout_log_exercises_exercise_id_idx on public.workout_log_exercises (exercise_id);

create trigger workout_log_exercises_set_updated_at
  before update on public.workout_log_exercises
  for each row execute function public.set_updated_at();

alter table public.workout_log_exercises enable row level security;
revoke all on table public.workout_log_exercises from anon, authenticated;

-- workout_sets: one set of an exercise in a logged workout.
create table public.workout_sets (
  id              uuid primary key default gen_random_uuid(),
  log_exercise_id uuid not null references public.workout_log_exercises (id) on delete cascade,
  position        smallint not null,
  reps            smallint check (reps between 0 and 1000),
  weight_kg       numeric(6, 2) check (weight_kg between 0 and 1000),
  duration_s      integer check (duration_s between 0 and 86400),
  distance_m      integer check (distance_m between 0 and 1000000),
  rpe             numeric(3, 1) check (rpe between 1 and 10),
  is_warmup       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Deferred, so a reorder can swap positions in one statement.
  constraint workout_sets_log_exercise_id_position_key unique (log_exercise_id, position) deferrable initially deferred,
  constraint workout_sets_measure_check check (coalesce(reps, duration_s, distance_m) is not null)
);

comment on table public.workout_sets is 'One set of an exercise in a logged workout: reps, weight, time or distance.';
comment on column public.workout_sets.weight_kg is 'Weight in kg; 0 or null = bodyweight.';
comment on column public.workout_sets.duration_s is 'Duration in seconds.';
comment on column public.workout_sets.distance_m is 'Distance in meters.';
comment on column public.workout_sets.is_warmup is 'Warm-up sets never count for personal records.';

create trigger workout_sets_set_updated_at
  before update on public.workout_sets
  for each row execute function public.set_updated_at();

alter table public.workout_sets enable row level security;
revoke all on table public.workout_sets from anon, authenticated;

-- personal_records: cache of the best values per client and exercise (R43), rebuilt by the triggers below.
create table public.personal_records (
  client_id   uuid references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete cascade,
  record_type public.pr_type,
  value       numeric(10, 2) not null,
  set_id      uuid references public.workout_sets (id) on delete set null,
  achieved_at timestamptz not null,
  primary key (client_id, exercise_id, record_type)
);

comment on table public.personal_records is
  'Best value of a client per exercise and record type. A cache written only by the triggers on workout tables.';
comment on column public.personal_records.value is 'kg for max_weight, reps for max_reps, seconds for max_duration.';
comment on column public.personal_records.set_id is 'Earliest set that reached the value.';
comment on column public.personal_records.achieved_at is 'performed_at of the workout with that set.';

create index personal_records_set_id_idx on public.personal_records (set_id);
create index personal_records_exercise_id_idx on public.personal_records (exercise_id);

alter table public.personal_records enable row level security;
revoke all on table public.personal_records from anon, authenticated;

-- Rebuilds the records of one client and exercise from that client's non-warmup sets (PRD 2.10-6, R43).
-- Definer: it reads every log of the client and writes the cache, which nobody may write directly.
create function private.recompute_personal_records(p_client uuid, p_exercise uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_client is null or p_exercise is null then
    return;
  end if;
  -- The profile is being deleted: its records leave through the cascade.
  if not exists (select 1 from public.profiles p where p.id = p_client) then
    return;
  end if;
  -- The deleted-client stub holds the logs of many former clients; a record across them means nothing,
  -- and rebuilding it would grow with every deleted account.
  if p_client = private.deleted_client_id() then
    return;
  end if;
  -- Serializes rebuilds of the same key, so two parallel writers cannot both insert the same record.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('personal_records:' || p_client::text || ':' || p_exercise::text, 0));

  delete from public.personal_records r where r.client_id = p_client and r.exercise_id = p_exercise;

  insert into public.personal_records (client_id, exercise_id, record_type, value, set_id, achieved_at)
  select distinct on (c.record_type) p_client, p_exercise, c.record_type, c.value, c.set_id, c.performed_at
  from (
    select v.record_type, v.value, s.id as set_id, l.performed_at, l.id as log_id,
           e.position as exercise_position, s.position as set_position
    from public.workout_logs l
    join public.workout_log_exercises e on e.log_id = l.id
    join public.workout_sets s on s.log_exercise_id = e.id
    cross join lateral (values
      ('max_weight'::public.pr_type, case when s.weight_kg > 0 then s.weight_kg end),
      ('max_reps'::public.pr_type, case when s.reps > 0 and coalesce(s.weight_kg, 0) = 0 then s.reps::numeric end),
      ('max_duration'::public.pr_type, case when s.duration_s > 0 then s.duration_s::numeric end)
    ) as v (record_type, value)
    where l.client_id = p_client and e.exercise_id = p_exercise and not s.is_warmup and v.value is not null
  ) c
  -- Highest value; on a tie the earliest set reaching it.
  order by c.record_type, c.value desc, c.performed_at, c.log_id, c.exercise_position, c.set_position;
end $$;

comment on function private.recompute_personal_records(uuid, uuid) is
  'Rebuilds personal_records of one client and exercise: max weight, max reps without weight, max duration; warm-ups skipped.';
revoke all on function private.recompute_personal_records(uuid, uuid) from public;

-- A set changed: rebuild the old and the new (client, exercise). When the parents are already gone
-- (a log or log exercise delete cascading here), the trigger on that parent does the rebuild.
create function private.workout_sets_refresh_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_client   uuid;
  v_old_exercise uuid;
  v_new_client   uuid;
  v_new_exercise uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select l.client_id, e.exercise_id into v_old_client, v_old_exercise
    from public.workout_log_exercises e
    join public.workout_logs l on l.id = e.log_id
    where e.id = old.log_exercise_id;
    if found then
      perform private.recompute_personal_records(v_old_client, v_old_exercise);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select l.client_id, e.exercise_id into v_new_client, v_new_exercise
    from public.workout_log_exercises e
    join public.workout_logs l on l.id = e.log_id
    where e.id = new.log_exercise_id;
    if found and (v_new_client, v_new_exercise) is distinct from (v_old_client, v_old_exercise) then
      perform private.recompute_personal_records(v_new_client, v_new_exercise);
    end if;
  end if;
  return null;
end $$;

comment on function private.workout_sets_refresh_records() is
  'Trigger: rebuilds personal records after a set is added, changed or removed.';
revoke all on function private.workout_sets_refresh_records() from public;

create trigger workout_sets_refresh_records
  after insert or update or delete on public.workout_sets
  for each row execute function private.workout_sets_refresh_records();

-- A log exercise moved to another exercise or log, or was removed (its sets are gone by now).
create function private.workout_log_exercises_refresh_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_client uuid;
  v_new_client uuid;
begin
  select l.client_id into v_old_client from public.workout_logs l where l.id = old.log_id;
  if found then
    perform private.recompute_personal_records(v_old_client, old.exercise_id);
  end if;

  if tg_op = 'UPDATE' then
    select l.client_id into v_new_client from public.workout_logs l where l.id = new.log_id;
    if found and (v_new_client, new.exercise_id) is distinct from (v_old_client, old.exercise_id) then
      perform private.recompute_personal_records(v_new_client, new.exercise_id);
    end if;
  end if;
  return null;
end $$;

comment on function private.workout_log_exercises_refresh_records() is
  'Trigger: rebuilds personal records when a log exercise changes exercise or log, or is removed.';
revoke all on function private.workout_log_exercises_refresh_records() from public;

create trigger workout_log_exercises_refresh_records
  after update of exercise_id, log_id or delete on public.workout_log_exercises
  for each row execute function private.workout_log_exercises_refresh_records();

-- A log changed client or time, or was removed. Trigger names in lowercase sort after Postgres'
-- RI_ConstraintTrigger_*, so on a delete the cascade has already removed the children, and the exercises
-- of the log are unknown: rebuild every exercise the old client has a record for.
create function private.workout_logs_refresh_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exercise uuid;
begin
  if tg_op = 'DELETE' then
    for v_exercise in
      select r.exercise_id from public.personal_records r where r.client_id = old.client_id
    loop
      perform private.recompute_personal_records(old.client_id, v_exercise);
    end loop;
    return null;
  end if;

  -- UPDATE: the children are still there, and only this log's exercises can change, for both clients.
  for v_exercise in
    select distinct e.exercise_id from public.workout_log_exercises e where e.log_id = new.id
  loop
    perform private.recompute_personal_records(old.client_id, v_exercise);
    if new.client_id is distinct from old.client_id then
      perform private.recompute_personal_records(new.client_id, v_exercise);
    end if;
  end loop;
  return null;
end $$;

comment on function private.workout_logs_refresh_records() is
  'Trigger: rebuilds personal records when a log moves to another client, changes its time or is removed.';
revoke all on function private.workout_logs_refresh_records() from public;

create trigger workout_logs_refresh_records
  after update of client_id, performed_at or delete on public.workout_logs
  for each row execute function private.workout_logs_refresh_records();

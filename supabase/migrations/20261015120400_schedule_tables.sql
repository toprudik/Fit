-- Schedule (data-model §2.1 "Расписание"): locations, week_templates, week_template_items, slots, recurrences,
-- sessions, the forward foreign keys from trial_links and coaching_notes, and the trainer time-zone propagation.
-- Policies: 20261015123300_schedule_policies.sql.

-- locations: where the trainer works. Archived, never deleted by users, so old sessions keep their place.
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainer_profiles (user_id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  address     text,
  lat         numeric(9, 6) check (lat between -90 and 90),
  lng         numeric(9, 6) check (lng between -180 and 180),
  notes       text,                                                  -- "entrance from the yard", parking
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint locations_coordinates_check check ((lat is null) = (lng is null)),
  -- Target of the composite foreign keys that keep a row from pointing at another trainer's location.
  constraint locations_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.locations is 'A place where a trainer holds offline sessions (gym, park, address).';
comment on column public.locations.lat is 'Latitude in degrees; set together with lng or not at all.';
comment on column public.locations.lng is 'Longitude in degrees; set together with lat or not at all.';

create index locations_trainer_id_idx on public.locations (trainer_id);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;
revoke all on table public.locations from anon, authenticated;

-- A trial link may only name a location of the same trainer.
alter table public.trial_links
  add constraint trial_links_location_fkey foreign key (location_id, trainer_id)
    references public.locations (id, trainer_id) on delete set null (location_id);

create index trial_links_location_id_idx on public.trial_links (location_id);

-- week_templates: the trainer's typical week, from which open slots are generated.
create table public.week_templates (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainer_profiles (user_id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 64),
  time_zone       public.iana_tz not null,
  is_active       boolean not null default false,
  horizon_weeks   smallint not null default 4 check (horizon_weeks between 1 and 12),
  buffer_min      smallint not null default 0 check (buffer_min between 0 and 240),
  generated_until date,                                              -- slots exist up to this date (inclusive)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.week_templates is 'A trainer week template; the slot generator turns the active one into open slots.';
comment on column public.week_templates.time_zone is
  'Zone the item times are read in. Follows the trainer time zone when it changes (trigger on user_settings).';
comment on column public.week_templates.buffer_min is 'Minutes left free between two generated slots.';
comment on column public.week_templates.generated_until is 'Last local date with generated slots; written by the generator.';

create unique index week_templates_one_active_uniq on public.week_templates (trainer_id) where is_active;

create trigger week_templates_set_updated_at
  before update on public.week_templates
  for each row execute function public.set_updated_at();

alter table public.week_templates enable row level security;
revoke all on table public.week_templates from anon, authenticated;

-- week_template_items: a weekly window cut into personal slots of duration_min (R22). Windows past
-- midnight are not supported. Trainer-only table, so the online link stays private here (R77).
create table public.week_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.week_templates (id) on delete cascade,
  iso_weekday  smallint not null check (iso_weekday between 1 and 7),
  start_time   time not null,
  end_time     time not null,
  duration_min smallint not null check (duration_min between 15 and 480),
  location_id  uuid references public.locations (id) on delete set null,
  mode         public.session_mode not null default 'offline',
  meeting_url  text check (meeting_url ~ '^https://'),
  allow_trial  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint week_template_items_window_check
    check (end_time > start_time and extract(epoch from (end_time - start_time)) / 60 >= duration_min),
  constraint week_template_items_location_mode_check check (mode = 'offline' or location_id is null),
  constraint week_template_items_meeting_url_mode_check check (mode = 'online' or meeting_url is null)
);

comment on table public.week_template_items is
  'A weekly time window of a template, cut into slots of duration_min (plus the template buffer).';
comment on column public.week_template_items.duration_min is 'Length of each generated slot in minutes.';
comment on column public.week_template_items.meeting_url is
  'Online link for sessions booked from these slots; copied to the session by the booking RPC, never shown on slots.';

create index week_template_items_template_id_idx on public.week_template_items (template_id);
create index week_template_items_location_id_idx on public.week_template_items (location_id);

create trigger week_template_items_set_updated_at
  before update on public.week_template_items
  for each row execute function public.set_updated_at();

-- Items have no trainer_id, so a composite key cannot tie the location to the template's trainer.
-- Definer: the location check must not depend on what the caller can read.
create function private.week_template_items_check_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is not null and not exists (
    select 1
    from public.week_templates t
    join public.locations l on l.trainer_id = t.trainer_id
    where t.id = new.template_id and l.id = new.location_id
  ) then
    raise exception 'location_not_owned' using errcode = 'P0001',
      detail = 'the location must belong to the template trainer';
  end if;
  return new;
end $$;

comment on function private.week_template_items_check_location() is
  'Trigger: a template item may only use a location of the template trainer.';
revoke all on function private.week_template_items_check_location() from public;

create trigger week_template_items_check_location
  before insert or update of location_id, template_id on public.week_template_items
  for each row execute function private.week_template_items_check_location();

alter table public.week_template_items enable row level security;
revoke all on table public.week_template_items from anon, authenticated;

-- slots: free time a client can book. Closed periods are 'closed' marker slots that the generator skips (R92).
create table public.slots (
  id               uuid primary key default gen_random_uuid(),
  trainer_id       uuid not null references public.trainer_profiles (user_id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  location_id      uuid,
  mode             public.session_mode not null default 'offline',
  status           public.slot_status not null default 'open',
  allow_trial      boolean not null default true,
  template_item_id uuid references public.week_template_items (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint slots_time_check check (ends_at > starts_at),
  constraint slots_location_mode_check check (mode = 'offline' or location_id is null),
  constraint slots_location_fkey foreign key (location_id, trainer_id)
    references public.locations (id, trainer_id) on delete set null (location_id),
  constraint slots_id_trainer_id_key unique (id, trainer_id),
  -- Open and booked slots of one trainer never overlap; closed markers may cover them.
  constraint slots_no_overlap_excl
    exclude using gist (trainer_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'closed')
);

comment on table public.slots is
  'A bookable time window of a trainer, generated from the week template or added by hand; closed = time off.';
comment on column public.slots.template_item_id is 'Template item that generated the slot; null = added by hand. Set only by the generator.';

create index slots_trainer_id_starts_at_idx on public.slots (trainer_id, starts_at);
create index slots_starts_at_idx on public.slots (starts_at) where status = 'open';
create index slots_template_item_id_idx on public.slots (template_item_id);

create trigger slots_set_updated_at
  before update on public.slots
  for each row execute function public.set_updated_at();

alter table public.slots enable row level security;
revoke all on table public.slots from anon, authenticated;

-- recurrences: "repeat every Mon/Wed" rules; a job materializes them into sessions.
create table public.recurrences (
  id                 uuid primary key default gen_random_uuid(),
  trainer_id         uuid not null references public.trainer_profiles (user_id) on delete cascade,
  coaching_id        uuid,                                           -- personal repeat with this client
  rrule              text not null,                                  -- RFC 5545 subset: FREQ=WEEKLY;INTERVAL=n;BYDAY=MO,WE
  dtstart_local      timestamp not null,                             -- local date and time of the first session
  time_zone          public.iana_tz not null,
  until_date         date,                                           -- inclusive; null with null count = until the horizon
  occurrence_count   smallint check (occurrence_count between 1 and 500),
  duration_min       smallint not null check (duration_min between 15 and 480),
  kind               public.session_kind not null check (kind <> 'trial'),
  title              text check (char_length(title) <= 120),
  capacity           smallint not null default 1 check (capacity between 1 and 100),
  location_id        uuid,
  mode               public.session_mode not null default 'offline',
  meeting_url        text check (meeting_url ~ '^https://'),
  open_for_booking   boolean not null default false,                 -- group repeat that clients book themselves
  materialized_until date,                                           -- sessions exist up to this local date
  ended_at           timestamptz,                                    -- "stop repeating"; future instances cancelled
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint recurrences_personal_capacity_check check (kind = 'group' or capacity = 1),
  constraint recurrences_pair_kind_check check (kind = 'personal' or coaching_id is null),
  constraint recurrences_rrule_check
    check (rrule ~ '^FREQ=WEEKLY(;INTERVAL=[1-9][0-9]?)?;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$'),
  constraint recurrences_end_check check (not (until_date is not null and occurrence_count is not null)),
  constraint recurrences_open_for_booking_check check (not open_for_booking or kind = 'group'),
  constraint recurrences_location_mode_check check (mode = 'offline' or location_id is null),
  constraint recurrences_coaching_fkey foreign key (coaching_id, trainer_id)
    references public.coachings (id, trainer_id) on delete cascade deferrable initially immediate,
  constraint recurrences_location_fkey foreign key (location_id, trainer_id)
    references public.locations (id, trainer_id) on delete set null (location_id),
  constraint recurrences_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.recurrences is 'A weekly repeat rule of a trainer (personal with one client, or group).';
comment on column public.recurrences.time_zone is
  'Zone dtstart_local is read in. Follows the trainer time zone while the repeat is open (trigger on user_settings).';
comment on column public.recurrences.duration_min is 'Length of each session in minutes.';
comment on column public.recurrences.materialized_until is 'Last local date with created sessions; written by the materialization job.';
comment on column public.recurrences.created_by is 'Who created the repeat; stamped from the signed-in caller.';

create index recurrences_trainer_id_idx on public.recurrences (trainer_id);
create index recurrences_coaching_id_idx on public.recurrences (coaching_id);

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function public.set_updated_at();

create trigger recurrences_stamp_created_by
  before insert on public.recurrences
  for each row execute function private.stamp_actor('created_by');

alter table public.recurrences enable row level security;
revoke all on table public.recurrences from anon, authenticated;

-- sessions: a planned training session (personal, group or trial) at a fixed time.
create table public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  trainer_id           uuid not null references public.trainer_profiles (user_id) on delete cascade,
  kind                 public.session_kind not null,
  title                text check (char_length(title) <= 120),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  location_id          uuid,
  mode                 public.session_mode not null,
  meeting_url          text check (meeting_url ~ '^https://'),
  capacity             smallint not null default 1 check (capacity between 1 and 100),
  open_for_booking     boolean not null default false,               -- the trainer's clients see it and book themselves
  status               public.session_status not null default 'scheduled',
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles (id) on delete set null,
  cancel_reason        text check (char_length(cancel_reason) <= 500),
  slot_id              uuid,
  recurrence_id        uuid,
  original_starts_at   timestamptz,                                  -- recurrence instance: planned start (exception key)
  is_exception         boolean not null default false,               -- recurrence instance changed by hand
  trial_link_id        uuid,
  created_by           uuid references public.profiles (id) on delete set null,
  manually_adjusted_at timestamptz,                                  -- beta metric "sessions without manual edits" (Q26)
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sessions_time_check check (ends_at > starts_at),
  constraint sessions_personal_capacity_check check (kind = 'group' or capacity = 1),
  constraint sessions_location_mode_check check (mode = 'offline' or location_id is null),
  constraint sessions_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint sessions_completed_check check (status <> 'completed' or completed_at is not null),
  constraint sessions_open_for_booking_check check (not open_for_booking or kind = 'group'),
  -- Composite keys: a session may only point at the same trainer's location, slot, repeat and trial link.
  constraint sessions_location_fkey foreign key (location_id, trainer_id)
    references public.locations (id, trainer_id) on delete set null (location_id),
  constraint sessions_slot_fkey foreign key (slot_id, trainer_id)
    references public.slots (id, trainer_id) on delete set null (slot_id),
  constraint sessions_recurrence_fkey foreign key (recurrence_id, trainer_id)
    references public.recurrences (id, trainer_id) on delete set null (recurrence_id),
  constraint sessions_trial_link_fkey foreign key (trial_link_id, trainer_id)
    references public.trial_links (id, trainer_id) on delete set null (trial_link_id),
  constraint sessions_id_trainer_id_key unique (id, trainer_id)
);

comment on table public.sessions is
  'A training session at a fixed time. Never deleted by users; cancelled sessions stay for history.';
comment on column public.sessions.meeting_url is
  'Online link. Not granted for SELECT; read through public.session_meeting_url() (R25).';
comment on column public.sessions.capacity is 'Seats; requested, confirmed, attended and no_show bookings take one each (R18).';
comment on column public.sessions.created_by is 'Who created the session; stamped from the signed-in caller.';

create index sessions_trainer_id_starts_at_idx on public.sessions (trainer_id, starts_at);
create index sessions_starts_at_idx on public.sessions (starts_at) where status = 'scheduled';
create unique index sessions_one_live_per_slot_uniq on public.sessions (slot_id) where status <> 'cancelled';
create unique index sessions_recurrence_occurrence_uniq on public.sessions (recurrence_id, original_starts_at)
  where recurrence_id is not null;

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create trigger sessions_stamp_created_by
  before insert on public.sessions
  for each row execute function private.stamp_actor('created_by');

-- Status machine for every role (R93): scheduled -> completed | cancelled, completed -> cancelled.
-- cancelled is final. An update that keeps the status is not a transition.
create function private.sessions_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not ((old.status = 'scheduled' and new.status in ('completed', 'cancelled'))
          or (old.status = 'completed' and new.status = 'cancelled')) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = pg_catalog.format('sessions: %s -> %s is not allowed', old.status, new.status);
  end if;
  return new;
end $$;

comment on function private.sessions_status_transition() is
  'Trigger: allows only scheduled -> completed | cancelled and completed -> cancelled.';
revoke all on function private.sessions_status_transition() from public;

create trigger sessions_status_transition
  before update of status on public.sessions
  for each row execute function private.sessions_status_transition();

alter table public.sessions enable row level security;
revoke all on table public.sessions from anon, authenticated;

-- coaching_notes may point at a session; it must be a session of the pair's trainer.
alter table public.coaching_notes
  add constraint coaching_notes_session_fkey foreign key (session_id)
    references public.sessions (id) on delete set null;

create index coaching_notes_session_id_idx on public.coaching_notes (session_id) where session_id is not null;

-- Definer: the check must see the session and the pair whatever the caller can read. A missing session and
-- another trainer's session give the same error, so the trigger tells nothing about other trainers.
create function private.coaching_notes_check_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_id is not null and not exists (
    select 1
    from public.sessions s
    join public.coachings c on c.trainer_id = s.trainer_id
    where s.id = new.session_id and c.id = new.coaching_id
  ) then
    raise exception 'session_not_in_pair' using errcode = 'P0001',
      detail = 'the session must belong to the trainer of the pair';
  end if;
  return new;
end $$;

comment on function private.coaching_notes_check_session() is
  'Trigger: a note may only point at a session of the same trainer as its pair.';
revoke all on function private.coaching_notes_check_session() from public;

create trigger coaching_notes_check_session
  before insert or update of session_id on public.coaching_notes
  for each row execute function private.coaching_notes_check_session();

-- When the trainer changes their time zone, templates and open repeats follow it (R24). Existing sessions
-- and slots keep their absolute times. Definer: it must reach every row of the trainer whatever the
-- caller's grants and policies allow.
create function private.user_settings_propagate_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.time_zone is distinct from old.time_zone then
    update public.week_templates t
    set time_zone = new.time_zone
    where t.trainer_id = new.user_id and t.time_zone is distinct from new.time_zone;

    update public.recurrences r
    set time_zone = new.time_zone
    where r.trainer_id = new.user_id and r.ended_at is null and r.time_zone is distinct from new.time_zone;
  end if;
  return null;
end $$;

comment on function private.user_settings_propagate_time_zone() is
  'Trigger: copies a new user time zone into their week templates and open recurrences.';
revoke all on function private.user_settings_propagate_time_zone() from public;

create trigger user_settings_propagate_time_zone
  after update of time_zone on public.user_settings
  for each row execute function private.user_settings_propagate_time_zone();

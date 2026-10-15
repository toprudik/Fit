-- Progress (data-model §2.1 "Прогресс"): body measurements, progress photos and pair milestones, with the
-- trigger on bookings that records milestones. Policies: 20261015123800_progress_policies.sql.

-- measurements: one body measurement of a client, entered by the client or by a trainer (Q24).
create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  kind        public.measurement_kind not null,
  value       numeric(7, 2) not null check (value > 0),
  measured_at timestamptz not null,
  local_date  date not null,
  entered_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.measurements is
  'One body measurement of a client (weight or a girth), entered by the client or a trainer.';
comment on column public.measurements.value is 'kg for weight, cm for girths.';
comment on column public.measurements.local_date is 'Date of the measurement in the client time zone.';
comment on column public.measurements.entered_by is
  'Who entered the value; stamped from the signed-in caller. Only the author edits it (R41b).';

create index measurements_client_id_kind_measured_at_idx on public.measurements (client_id, kind, measured_at desc);
create index measurements_entered_by_idx on public.measurements (entered_by);

create trigger measurements_set_updated_at
  before update on public.measurements
  for each row execute function public.set_updated_at();

create trigger measurements_stamp_entered_by
  before insert on public.measurements
  for each row execute function private.stamp_actor('entered_by');

alter table public.measurements enable row level security;
revoke all on table public.measurements from anon, authenticated;

-- progress_photos: a progress photo of the client. Only the version blurred on the device is uploaded.
-- The Free plan limit binds direct uploads through the insert policy (private.can_add_progress_photo).
create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles (id) on delete cascade,
  angle        public.photo_angle not null,
  taken_on     date not null,
  storage_path text not null unique,
  face_blurred boolean not null check (face_blurred),   -- the client confirms the on-device blur
  blur_method  text not null check (blur_method in ('auto', 'auto+brush', 'brush', 'none_no_face')),
  width        smallint not null,
  height       smallint not null,
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint progress_photos_size_check check (width > 0 and height > 0),
  -- Object name inside bucket progress-photos, without the bucket (R52).
  constraint progress_photos_object_name_check check (
    storage_path in (client_id::text || '/' || id::text || '.webp', client_id::text || '/' || id::text || '.jpg'))
);

comment on table public.progress_photos is 'A progress photo of a client, blurred on the device before upload.';
comment on column public.progress_photos.storage_path is
  'Object name in bucket progress-photos: {client_id}/{id}.webp or .jpg, without the bucket (R52).';
comment on column public.progress_photos.width is 'Width in pixels.';
comment on column public.progress_photos.height is 'Height in pixels.';

create index progress_photos_client_id_taken_on_idx on public.progress_photos (client_id, taken_on desc);

create trigger progress_photos_set_updated_at
  before update on public.progress_photos
  for each row execute function public.set_updated_at();

alter table public.progress_photos enable row level security;
revoke all on table public.progress_photos from anon, authenticated;

-- milestones: attended-session milestones of a pair (R37). Recorded by the trigger below; kept when the
-- booking that reached them is re-marked.
create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  coaching_id uuid not null references public.coachings (id) on delete cascade,
  kind        public.milestone_kind not null,
  booking_id  uuid,
  achieved_at timestamptz not null,
  constraint milestones_coaching_id_kind_key unique (coaching_id, kind),
  constraint milestones_booking_fkey foreign key (booking_id, coaching_id)
    references public.bookings (id, coaching_id) on delete set null (booking_id) deferrable initially immediate
);

comment on table public.milestones is
  'A milestone of a pair (10, 25, 50, 100 attended sessions). '
  'Written only by the trigger on bookings; never removed on re-marking.';
comment on column public.milestones.booking_id is 'The booking whose attendance reached the milestone; cleared if it is deleted.';
comment on column public.milestones.achieved_at is 'Start of the session of that booking (R74).';

create index milestones_booking_id_idx on public.milestones (booking_id) where booking_id is not null;

alter table public.milestones enable row level security;
revoke all on table public.milestones from anon, authenticated;

-- A booking became attended (an insert as attended counts too, R74): record every threshold the pair has
-- reached. Trial bookings count. No outbox row (R37). Definer: it counts every booking of the pair and
-- writes milestones, which nobody may write directly.
create function private.bookings_record_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attended  integer;
  v_starts_at timestamptz;
begin
  if new.status <> 'attended' or (tg_op = 'UPDATE' and old.status = 'attended') then
    return null;
  end if;
  -- Serializes parallel attendance marks of one pair, so the count sees the other mark once it commits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('milestones:' || new.coaching_id::text, 0));

  select count(*) into v_attended
  from public.bookings b
  where b.coaching_id = new.coaching_id and b.status = 'attended';
  if v_attended < 10 then
    return null;
  end if;

  select s.starts_at into v_starts_at from public.sessions s where s.id = new.session_id;
  insert into public.milestones (coaching_id, kind, booking_id, achieved_at)
  select new.coaching_id, t.kind, new.id, v_starts_at
  from (values
    (10, 'sessions_10'::public.milestone_kind),
    (25, 'sessions_25'::public.milestone_kind),
    (50, 'sessions_50'::public.milestone_kind),
    (100, 'sessions_100'::public.milestone_kind)
  ) as t (threshold, kind)
  where v_attended >= t.threshold
  on conflict (coaching_id, kind) do nothing;
  return null;
end $$;

comment on function private.bookings_record_milestones() is
  'Trigger: when a booking becomes attended, records the 10, 25, 50 and 100 attended-session milestones the pair reached.';
revoke all on function private.bookings_record_milestones() from public;

create trigger bookings_record_milestones
  after insert or update of status on public.bookings
  for each row execute function private.bookings_record_milestones();

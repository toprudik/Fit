-- People and access (data-model §2.1 "Люди и доступ"): profiles columns, user_settings, notification_preferences,
-- user_roles, consents, account_deletions, data_exports. Policies and grants live in 20261015123000_people_policies.sql.

-- profiles, part 1. The server still writes profiles at sign-in; grants and policies change in the policies file.
alter table public.profiles
  add column last_seen_at   timestamptz,
  add column bot_started_at timestamptz,
  add column bot_blocked_at timestamptz,
  add column blocked_at     timestamptz,
  add column blocked_reason text check (char_length(blocked_reason) <= 500),
  add column display_name   text,
  add column avatar_path    text,
  add column time_zone      public.iana_tz not null default 'Europe/Moscow',
  add constraint profiles_blocked_check check ((blocked_at is null) = (blocked_reason is null));

comment on column public.profiles.last_seen_at is 'Last sign-in; set by the server.';
comment on column public.profiles.bot_started_at is 'User pressed /start in the bot; without it the bot cannot message them.';
comment on column public.profiles.bot_blocked_at is 'Telegram answered 403 when the bot wrote; cleared on /start.';
comment on column public.profiles.blocked_at is 'Admin blocked the account; written by an admin RPC only (not granted).';
comment on column public.profiles.blocked_reason is 'Why the admin blocked the account; set together with blocked_at.';
comment on column public.profiles.display_name is 'Mirror of user_settings.display_name, written only by a trigger; read through public_profiles.';
comment on column public.profiles.avatar_path is 'Mirror of user_settings.avatar_path, written only by a trigger.';
comment on column public.profiles.time_zone is 'Mirror of user_settings.time_zone, written only by a trigger; pair partners and views read it.';

-- user_settings: everything the user changes, 1:1 with profiles. A trigger on profiles creates the row.
create table public.user_settings (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  display_name      text check (char_length(display_name) between 1 and 64),  -- null = name from Telegram
  avatar_path       text,                                                      -- object in bucket avatars; null = Telegram photo
  locale            public.app_locale not null default 'ru',
  theme             public.app_theme not null default 'system',
  unit_system       public.unit_system,                                        -- null = from the locale
  time_zone         public.iana_tz not null default 'Europe/Moscow',
  last_zone         public.app_zone not null default 'client',
  quiet_hours_start time default '22:00',                                      -- both null = quiet hours off
  quiet_hours_end   time default '08:00',
  daily_digest_time time not null default '08:00',                             -- used when the user is a trainer
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint user_settings_quiet_hours_check check ((quiet_hours_start is null) = (quiet_hours_end is null)),
  constraint user_settings_avatar_path_check
    check (avatar_path is null or split_part(avatar_path, '/', 1) = user_id::text)
);

comment on table public.user_settings is
  'Settings a user changes themselves, one row per profile. Created by a trigger when the profile is inserted.';
comment on column public.user_settings.avatar_path is 'Object name inside bucket avatars, starting with the user id folder (no bucket prefix).';
comment on column public.user_settings.locale is 'Set from profiles.language_code when the row is created (en* = en, else ru).';
comment on column public.user_settings.quiet_hours_start is 'Local time in time_zone; with quiet_hours_end, both null = quiet hours off.';
comment on column public.user_settings.daily_digest_time is 'Local time of the trainer daily digest (data-model called it morning_summary_time).';

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from anon, authenticated;

-- Keep the profiles mirror columns in step with the settings. Definer: users have no UPDATE on profiles.
create function private.mirror_settings_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set display_name = new.display_name,
      avatar_path = new.avatar_path,
      time_zone = new.time_zone
  where p.id = new.user_id
    and (p.display_name, p.avatar_path, p.time_zone)
        is distinct from (new.display_name, new.avatar_path, new.time_zone);
  return null;
end $$;

comment on function private.mirror_settings_to_profile() is
  'Trigger: copies display_name, avatar_path and time_zone from user_settings to the profiles mirror columns.';
revoke all on function private.mirror_settings_to_profile() from public;

create trigger user_settings_mirror_to_profile
  after insert or update of display_name, avatar_path, time_zone on public.user_settings
  for each row execute function private.mirror_settings_to_profile();

-- Every profile gets its settings row, also cards created by a trainer. Definer: the insert bypasses RLS.
create function private.create_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id, locale)
  values (new.id, case when lower(coalesce(new.language_code, '')) like 'en%' then 'en' else 'ru' end::public.app_locale)
  on conflict do nothing;
  return null;
end $$;

comment on function private.create_user_settings() is
  'Trigger: creates the user_settings row for a new profile, with the locale taken from the Telegram language.';
revoke all on function private.create_user_settings() from public;

create trigger profiles_create_settings
  after insert on public.profiles
  for each row execute function private.create_user_settings();

-- notification_preferences: overrides only; a missing row means the default from code.
create table public.notification_preferences (
  user_id    uuid references public.profiles (id) on delete cascade,
  type       public.notification_type,
  enabled    boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, type),
  constraint notification_preferences_mandatory_check
    check (enabled or private.notification_type_is_optional(type))
);

comment on table public.notification_preferences is
  'Per-user override of one notification type; no row means the default. Mandatory types cannot be switched off.';

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on table public.notification_preferences from anon, authenticated;

-- user_roles: being a trainer is not a role (it is having a trainer_profiles row).
create table public.user_roles (
  user_id    uuid references public.profiles (id) on delete cascade,
  role       public.app_role,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is 'Platform role of a user (admin). Written only by admin RPCs or the server.';

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon, authenticated;

-- consents: accepted texts by version; a revocation only stamps revoked_at.
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.consent_kind not null,
  version     text not null check (char_length(version) between 1 and 64),  -- text version, for example '2026-11-beta'
  accepted_at timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint consents_revoked_check check (revoked_at is null or revoked_at >= accepted_at)
);

comment on table public.consents is 'A consent the user accepted (beta terms, privacy policy, contact sharing), by text version.';

create index consents_user_id_kind_idx on public.consents (user_id, kind);
create unique index consents_one_active_uniq on public.consents (user_id, kind, version) where revoked_at is null;

alter table public.consents enable row level security;
revoke all on table public.consents from anon, authenticated;

-- account_deletions: the 30-day window before anonymization (data-model §1.6).
create table public.account_deletions (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  requested_at  timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at  timestamptz,
  updated_at    timestamptz not null default now(),
  constraint account_deletions_scheduled_check check (scheduled_for > requested_at),
  constraint account_deletions_cancelled_check check (cancelled_at is null or cancelled_at >= requested_at)
);

comment on table public.account_deletions is
  'A pending or cancelled account deletion request. Written only by RPCs; pair partners read it for the "deleting" label.';

create index account_deletions_scheduled_for_idx on public.account_deletions (scheduled_for) where cancelled_at is null;

create trigger account_deletions_set_updated_at
  before update on public.account_deletions
  for each row execute function public.set_updated_at();

alter table public.account_deletions enable row level security;
revoke all on table public.account_deletions from anon, authenticated;

-- data_exports: one archive request; the server builds the file in bucket exports.
create table public.data_exports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       public.export_status not null default 'queued',
  storage_path text,
  requested_at timestamptz not null default now(),
  ready_at     timestamptz,
  expires_at   timestamptz,
  updated_at   timestamptz not null default now(),
  constraint data_exports_ready_check
    check (status <> 'ready' or (storage_path is not null and ready_at is not null and expires_at is not null)),
  constraint data_exports_storage_path_check
    check (storage_path is null or split_part(storage_path, '/', 1) = user_id::text)
);

comment on table public.data_exports is 'A data export request and its archive. Written only by RPCs and the server.';
comment on column public.data_exports.storage_path is 'Object name inside bucket exports, starting with the user id folder (no bucket prefix).';

create index data_exports_user_id_requested_at_idx on public.data_exports (user_id, requested_at desc);

create trigger data_exports_set_updated_at
  before update on public.data_exports
  for each row execute function public.set_updated_at();

alter table public.data_exports enable row level security;
revoke all on table public.data_exports from anon, authenticated;

-- Profiles created before this migration get their settings row too.
insert into public.user_settings (user_id, locale)
select p.id, case when lower(coalesce(p.language_code, '')) like 'en%' then 'en' else 'ru' end::public.app_locale
from public.profiles p
on conflict do nothing;

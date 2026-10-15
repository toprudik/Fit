-- Policies, grants and guards for the people tables (data-model §4.2, contract §1.4 file 14): profiles,
-- user_settings, notification_preferences, user_roles, consents, account_deletions, data_exports.
-- Every table starts from "revoke all" and gets back exactly the privileges below. Server code with the
-- secret key (service_role) keeps its default privileges and bypasses RLS; writes it does are not listed here.

-- profiles ------------------------------------------------------------------------------------------------

-- The first migration let users read only their own row. Partners, cards and admins are added here.
drop policy "profiles: users read own row" on public.profiles;

revoke all on table public.profiles from anon, authenticated;

-- Column grant: telegram_id (identity), the bot status columns, the admin block, claimed_by and last_seen_at
-- stay server-only. Other users must not learn when someone was last online; admin tooling reads last_seen_at
-- through definer functions later. select * therefore fails with 42501; the app lists columns or reads
-- public_profiles.
grant select (
  id, username, first_name, last_name, photo_url, language_code, display_name, avatar_path, time_zone,
  managed_by_trainer_id, created_at, updated_at
) on table public.profiles to authenticated;

-- Pair partners stay visible after a pair ends (history). Admins see ordinary accounts, but not a trainer's
-- cards (PAIR-10) and not the deleted-client stub. No write policies: the sign-in code writes with the secret key.
create policy "profiles: read self, pair partners, own cards, admins"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or managed_by_trainer_id = (select auth.uid())
    or id in (select private.pair_partner_ids())
    or ((select private.is_admin()) and managed_by_trainer_id is null and id <> private.deleted_client_id())
  );

comment on policy "profiles: read self, pair partners, own cards, admins" on public.profiles is
  'Self, anyone sharing a pair in any status, the trainer of a card, and admins (not cards, not the stub).';

-- user_settings -------------------------------------------------------------------------------------------

revoke all on table public.user_settings from anon, authenticated;
grant select on table public.user_settings to authenticated;
grant update (
  display_name, avatar_path, locale, theme, unit_system, time_zone, last_zone,
  quiet_hours_start, quiet_hours_end, daily_digest_time
) on table public.user_settings to authenticated;

-- Others see the name, avatar and zone only through the profiles mirror (public_profiles view).
create policy "user_settings: owner reads"
  on public.user_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

comment on policy "user_settings: owner reads" on public.user_settings is 'Only the owner reads the settings row.';

-- The row is created by a trigger on profiles, so there is no insert path for users.
create policy "user_settings: owner updates"
  on public.user_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on policy "user_settings: owner updates" on public.user_settings is
  'Only the owner changes the settings; the column grant keeps user_id fixed.';

-- notification_preferences --------------------------------------------------------------------------------

revoke all on table public.notification_preferences from anon, authenticated;
grant select, delete on table public.notification_preferences to authenticated;
grant insert (user_id, type, enabled) on table public.notification_preferences to authenticated;
grant update (enabled) on table public.notification_preferences to authenticated;

-- Mandatory types cannot be switched off: that is the table check, which binds the server too.
create policy "notification_preferences: owner manages"
  on public.notification_preferences for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on policy "notification_preferences: owner manages" on public.notification_preferences is
  'The owner reads and writes their own overrides; nobody else sees them.';

-- user_roles ----------------------------------------------------------------------------------------------

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

-- No write policies: roles change only through admin RPCs that write the audit log (R13).
create policy "user_roles: owner or admin reads"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "user_roles: owner or admin reads" on public.user_roles is
  'A user sees their own roles; admins see every role.';

-- consents ------------------------------------------------------------------------------------------------

revoke all on table public.consents from anon, authenticated;
grant select on table public.consents to authenticated;
-- accepted_at is not granted, so it is always the insert time.
grant insert (user_id, kind, version) on table public.consents to authenticated;
grant update (revoked_at) on table public.consents to authenticated;

-- Admins see the fact of consent (kind, version, dates); the row holds nothing else.
create policy "consents: owner or admin reads"
  on public.consents for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "consents: owner or admin reads" on public.consents is
  'A user sees their own consents; admins see who accepted which version.';

create policy "consents: owner inserts"
  on public.consents for insert
  to authenticated
  with check (user_id = (select auth.uid()));

comment on policy "consents: owner inserts" on public.consents is 'A user accepts a text version for themselves only.';

-- The only user update is a revocation; the guard below stamps it.
create policy "consents: owner revokes"
  on public.consents for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on policy "consents: owner revokes" on public.consents is
  'A user revokes their own consent; consents_guard_revocation sets the time.';

-- Guard: a revocation happens once and always at the current time, whatever the client sends.
-- Applies only to direct API calls; server code and definer RPCs (current_user postgres) are not bound.
create function private.consents_guard_revocation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.revoked_at is not null then
    raise exception 'forbidden' using errcode = '42501', detail = 'the consent is already revoked';
  end if;
  new.revoked_at := pg_catalog.now();
  return new;
end $$;

comment on function private.consents_guard_revocation() is
  'Guard trigger for signed-in users: a consent is revoked once, and revoked_at is always now().';
revoke all on function private.consents_guard_revocation() from public;

create trigger consents_guard_revocation
  before update on public.consents
  for each row execute function private.consents_guard_revocation();

-- account_deletions ---------------------------------------------------------------------------------------

revoke all on table public.account_deletions from anon, authenticated;
grant select on table public.account_deletions to authenticated;

-- Pair partners (any status) read it for the "deleting" label (R10); the row holds only dates.
-- Request and cancel go through RPCs, so there are no write policies.
create policy "account_deletions: owner, pair partners, admins read"
  on public.account_deletions for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select private.pair_partner_ids())
    or (select private.is_admin())
  );

comment on policy "account_deletions: owner, pair partners, admins read" on public.account_deletions is
  'The owner, everyone sharing a pair with them and admins see the deletion dates.';

-- data_exports --------------------------------------------------------------------------------------------

revoke all on table public.data_exports from anon, authenticated;
grant select on table public.data_exports to authenticated;

-- Personal data: no admin branch (data-model §4.3). Requests and the archive are written by RPCs and the server.
create policy "data_exports: owner reads"
  on public.data_exports for select
  to authenticated
  using (user_id = (select auth.uid()));

comment on policy "data_exports: owner reads" on public.data_exports is 'Only the owner sees their export requests.';

-- Trainers policies (data-model §4.2, contract §1.4 file 15): trainer_profiles, trainer_certificates,
-- trainer_verifications, trainer_invites, client_invites, trial_links. Tables: 20261015120200_trainers_tables.sql.
-- Every table starts from no privileges; the grants below are the whole API surface for signed-in users.
-- anon gets nothing: the showcase and the public link lookups come later as definer functions.

revoke all on table
  public.trainer_profiles,
  public.trainer_certificates,
  public.trainer_verifications,
  public.trainer_invites,
  public.client_invites,
  public.trial_links
from anon, authenticated;

-- trainer_profiles

-- Clients of any pair status keep seeing their trainers (R89); other trainers and strangers do not.
-- Strangers reach a showcase only through the later get_trainer_showcase function.
create policy "trainer_profiles: self, own clients and admins read"
  on public.trainer_profiles for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select private.trainer_ids_visible())
    or (select private.is_admin())
  );

-- The trainer edits the showcase and scheduling defaults. verification_status, verified_at and
-- trainer_invite_id are left out of the column grant: only the verification and redeem RPCs set them.
create policy "trainer_profiles: trainer updates own"
  on public.trainer_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on table public.trainer_profiles to authenticated;
grant update (
  slug, headline, bio, specialties, city, works_offline, works_online, is_public, default_currency,
  cancellation_deadline_hours, default_client_reminder_offsets, min_booking_notice_minutes
) on table public.trainer_profiles to authenticated;

-- trainer_certificates

-- Certificates are verification documents: the trainer and admins only, never clients (TINV-6).
create policy "trainer_certificates: trainer and admins read"
  on public.trainer_certificates for select
  to authenticated
  using (trainer_id = (select auth.uid()) or (select private.is_admin()));

-- A user without a trainer profile fails the foreign key; the 5-file cap is an invariant trigger.
create policy "trainer_certificates: trainer inserts own"
  on public.trainer_certificates for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy "trainer_certificates: trainer updates own"
  on public.trainer_certificates for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy "trainer_certificates: trainer deletes own"
  on public.trainer_certificates for delete
  to authenticated
  using (trainer_id = (select auth.uid()));

grant select, delete on table public.trainer_certificates to authenticated;
grant insert (id, trainer_id, title, issuer, issued_on, storage_path) on table public.trainer_certificates to authenticated;
grant update (title, issuer, issued_on, storage_path) on table public.trainer_certificates to authenticated;

-- trainer_verifications

-- History of submissions and decisions. Written only by RPCs (submission and admin decision).
create policy "trainer_verifications: trainer and admins read"
  on public.trainer_verifications for select
  to authenticated
  using (trainer_id = (select auth.uid()) or (select private.is_admin()));

grant select on table public.trainer_verifications to authenticated;

-- trainer_invites

-- Admins list invites in the admin panel. Create, revoke and redeem go through RPCs (R13), so there is no
-- write policy. code_hash is never granted: the plain code is shown once and only its hash is stored.
create policy "trainer_invites: admins read"
  on public.trainer_invites for select
  to authenticated
  using ((select private.is_admin()));

grant select (id, code_hint, note, created_by, expires_at, redeemed_by, redeemed_at, revoked_at, created_at)
  on table public.trainer_invites to authenticated;

-- client_invites

-- Only the owning trainer sees and edits the links; clients reach a link through the later
-- resolve_client_invite function. token, code and uses_count are not granted: the database generates the
-- first two (R66) and the join RPC counts uses. There is no DELETE: a link is archived, and archived stays
-- archived (invariant trigger client_invites_keep_archived).
create policy "client_invites: trainer reads own"
  on public.client_invites for select
  to authenticated
  using (trainer_id = (select auth.uid()));

create policy "client_invites: trainer inserts own"
  on public.client_invites for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy "client_invites: trainer updates own"
  on public.client_invites for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

grant select on table public.client_invites to authenticated;
grant insert (trainer_id, label, max_uses, expires_at) on table public.client_invites to authenticated;
grant update (label, max_uses, expires_at, archived_at) on table public.client_invites to authenticated;

-- trial_links

-- Same shape as client_invites; visitors reach a trial link through the later get_trial_link function.
-- The location foreign key (location_id, trainer_id) keeps a link from pointing at another trainer's place.
create policy "trial_links: trainer reads own"
  on public.trial_links for select
  to authenticated
  using (trainer_id = (select auth.uid()));

create policy "trial_links: trainer inserts own"
  on public.trial_links for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy "trial_links: trainer updates own"
  on public.trial_links for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

grant select on table public.trial_links to authenticated;
grant insert (
  trainer_id, title, description, duration_min, price_minor, currency, location_id, mode, max_uses, expires_at,
  is_enabled
) on table public.trial_links to authenticated;
grant update (
  title, description, duration_min, price_minor, currency, location_id, mode, max_uses, expires_at, is_enabled,
  archived_at
) on table public.trial_links to authenticated;

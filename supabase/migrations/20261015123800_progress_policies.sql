-- Progress policies (data-model §4.2, §4.3, contract §1.4 file 22): measurements, progress_photos, milestones.
-- Tables: 20261015120900_progress_tables.sql. Every table starts from no privileges; the grants below are the
-- whole API surface for signed-in users. Each UPDATE policy admits a single kind of actor (the author, or the
-- client), so column grants alone decide what may change (contract §3.5) and there are no guard triggers.
-- Personal data (§4.3): no policy here calls is_admin(). An admin reads measurements and photos only through
-- private.can_view, which is true for an admin only with a live break-glass grant for that category (ADM-15).

revoke all on table public.measurements, public.progress_photos, public.milestones from anon, authenticated;

-- measurements

-- Measurements belong to the client, not to a pair (PRD 2.11 edge cases): each trainer of a live pair reads all
-- of them, whoever entered them, while that pair shares measurements. Turning the share off hides even the
-- trainer's own entries (PRIV-4); an ended pair hides everything.
create policy "measurements: client, sharing trainers, break-glass read"
  on public.measurements for select
  to authenticated
  using (private.can_view(client_id, 'measurements'));

-- The client enters own values; a trainer enters values for a client of a live pair that shares measurements
-- (a card shares everything). entered_by is stamped from auth.uid() before this check runs and is not granted.
create policy "measurements: client or sharing trainer inserts"
  on public.measurements for insert
  to authenticated
  with check (
    entered_by = (select auth.uid())
    and (client_id = (select auth.uid())
         or (private.is_trainer_of(client_id, 'progress') and private.can_view(client_id, 'measurements'))));

-- Only the author edits or deletes an entry (R41b, PROG-1): the client cannot change a trainer's value, and a
-- trainer loses the right together with the share.
create policy "measurements: author updates"
  on public.measurements for update
  to authenticated
  using (entered_by = (select auth.uid()) and private.can_view(client_id, 'measurements'))
  with check (entered_by = (select auth.uid()) and private.can_view(client_id, 'measurements'));

create policy "measurements: author deletes"
  on public.measurements for delete
  to authenticated
  using (entered_by = (select auth.uid()) and private.can_view(client_id, 'measurements'));

grant select, delete on table public.measurements to authenticated;
grant insert (id, client_id, kind, value, measured_at, local_date, note) on table public.measurements to authenticated;
grant update (kind, value, measured_at, local_date, note) on table public.measurements to authenticated;

-- progress_photos

-- Photos are off by default for trainers and open only per pair (Q38, PROG-5/6); the Storage policy on bucket
-- progress-photos reads through this row, so revoking the share also stops new signed URLs.
create policy "progress_photos: client, sharing trainers, break-glass read"
  on public.progress_photos for select
  to authenticated
  using (private.can_view(client_id, 'photos'));

-- Only the client uploads, edits and deletes photos (PRD 2.11-6). The object name, the confirmed blur and the
-- blur method are table checks.
create policy "progress_photos: client inserts"
  on public.progress_photos for insert
  to authenticated
  with check (client_id = (select auth.uid()));

create policy "progress_photos: client updates"
  on public.progress_photos for update
  to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

create policy "progress_photos: client deletes"
  on public.progress_photos for delete
  to authenticated
  using (client_id = (select auth.uid()));

grant select, delete on table public.progress_photos to authenticated;
grant insert (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height, note)
  on table public.progress_photos to authenticated;
grant update (note, angle) on table public.progress_photos to authenticated;

-- milestones

-- Both members of the pair see its milestones in any status (PRD 2.11-9): they come from attendance, which
-- stays visible after the pair ends. Written only by the trigger on bookings.
create policy "milestones: pair members read"
  on public.milestones for select
  to authenticated
  using (private.is_coaching_member(coaching_id));

grant select on table public.milestones to authenticated;

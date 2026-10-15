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
-- viewable_client_ids is can_view as an array computed once, so the client_id index serves the read.
create policy "measurements: client, sharing trainers, break-glass read"
  on public.measurements for select
  to authenticated
  using (client_id = any ((select private.viewable_client_ids('measurements'))::uuid[]));

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
  using (client_id = any ((select private.viewable_client_ids('photos'))::uuid[]));

-- Free photo limit (decisions §11 and Q57/Q58, ADR 0014, PRD 2.14-2 and 2.14-6, PLAN-3): checked in the
-- database, not only in the app. R82 is still open with the owner; until then this is the most restrictive
-- reading that keeps every documented case working:
--   * a set («комплект») is the photos of one taken_on date;
--   * a Free client starts at most limits.progress_photo_sets_per_month (client_free) new sets per calendar
--     month of upload, counted by created_at in the client's time zone, so a backdated taken_on does not help;
--     more photos for a set already started this month are free;
--   * no limit with client.progress_photos_unlimited (Premium), or while any live pair has a trainer on a paid
--     plan. The photos belong to the client, not to a pair, so the inherited right is not tied to one pair; a
--     pair column would be needed for that, and only if the owner asks for it.
-- Volatile, so in a multi-row insert it sees the rows inserted before the current one; the per-client
-- advisory lock makes a parallel upload wait, so two uploads cannot both take the last free set. It reads the
-- caller from auth.uid() and answers only for the caller.
-- R44 (client.self_training) stays ungated: PRD 2.10-4 lets every client log own workouts, and gating self
-- logs would break that until the owner says Q57 means them.
create function private.can_add_progress_photo(p_taken_on date)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer;
  v_zone  text;
  v_sets  date[];
begin
  if v_uid is null then
    return false;
  end if;
  if private.has_entitlement(v_uid, 'client.progress_photos_unlimited')
     or exists (
       select 1 from public.coachings c
       where c.client_id = v_uid and c.status in ('trial', 'active')
         and private.has_entitlement(v_uid, 'client.progress_photos_unlimited', c.id)) then
    return true;
  end if;

  select (p.limits ->> 'progress_photo_sets_per_month')::integer into v_limit
  from public.plans p
  where p.code = 'client_free';
  if v_limit is null then
    return true;   -- no key means no limit, as for the paid plans
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('progress_photos:' || v_uid::text, 0));
  select pr.time_zone into v_zone from public.profiles pr where pr.id = v_uid;
  select coalesce(pg_catalog.array_agg(distinct ph.taken_on), '{}') into v_sets
  from public.progress_photos ph
  where ph.client_id = v_uid
    and ph.created_at >= (pg_catalog.date_trunc('month', pg_catalog.now() at time zone v_zone) at time zone v_zone);
  return p_taken_on = any (v_sets) or pg_catalog.cardinality(v_sets) < v_limit;
end $$;

comment on function private.can_add_progress_photo(date) is
  'Policy helper: whether the caller may upload a photo for this date now: a Free client starts at most the '
  'plan''s number of photo sets (one taken_on date each) per calendar month; Premium or a paid trainer lifts it.';
revoke all on function private.can_add_progress_photo(date) from public;
grant execute on function private.can_add_progress_photo(date) to authenticated, service_role;

-- Only the client uploads, edits and deletes photos (PRD 2.11-6). The object name, the confirmed blur and the
-- blur method are table checks; the Free limit is can_add_progress_photo.
create policy "progress_photos: client inserts"
  on public.progress_photos for insert
  to authenticated
  with check (client_id = (select auth.uid()) and private.can_add_progress_photo(taken_on));

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

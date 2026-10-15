-- Owner decisions of 15.10.2026 (decisions §12, Q60-Q65; data-model §2.1.0 R16, R44, R50, R58, R82, R91). The
-- product owner delegated six open questions to Claude. Two of them touch the schema:
--   * R82 (Q64): a progress photo set is the photos of one taken_on date, at most one per angle, on every plan.
--     The unique constraint below enforces it. A retake goes through replace_progress_photo and an angle swap
--     through set_progress_photo_angle; both run as the caller, under the policies that already exist.
--   * R16 (Q60): a rejected verification hides the public showcase. Nothing reads is_public yet, so only its
--     comment changes; the later public get_trainer_showcase(slug) must answer "unavailable" for a rejected
--     trainer.
-- R44 (Q61), R50 (Q62), R58 (Q63) and R91 (Q65) confirm what the wave 1 migrations already do.
-- Production has no progress_photos rows yet, so the constraint needs no backfill.

-- progress_photos: one photo per client, date and angle (R82). DEFERRABLE INITIALLY IMMEDIATE moves the check
-- from each row to the end of each statement, so one UPDATE can swap the angles of two photos of a date
-- (set_progress_photo_angle). Nothing defers it to commit, and no ON CONFLICT or foreign key uses it.
alter table public.progress_photos
  add constraint progress_photos_client_id_taken_on_angle_key unique (client_id, taken_on, angle)
  deferrable initially immediate;

comment on constraint progress_photos_client_id_taken_on_angle_key on public.progress_photos is
  'A set is the photos of one date, at most one per angle (R82, decisions Q64). A retake goes through '
  'replace_progress_photo (delete and insert in one transaction) and an angle swap through '
  'set_progress_photo_angle (one UPDATE, checked at its end). Rows are never edited in place: UPDATE is granted '
  'on note and angle only, and bucket progress-photos has no UPDATE policy.';

-- The unique index starts with (client_id, taken_on), so it serves everything the old index did: the client_id
-- lookups of the read policy, can_add_progress_photo and the cascade from profiles, and, scanned backwards, the
-- gallery order (client_id = $1 order by taken_on desc). A deferrable unique index is still an ordinary btree
-- for scans. Keeping both would only cost every upload.
drop index public.progress_photos_client_id_taken_on_idx;

comment on function private.can_add_progress_photo(date) is
  'Policy helper: whether the caller may upload a photo for this date now. A set is the photos of one taken_on '
  'date, one per angle (R82, decisions Q64). A Free client starts at most the plan''s number of new sets per '
  'calendar month of upload in their time zone; missing angles of a set started this month are free, while a '
  'retake or a missing angle in a set from an earlier month starts this month''s set. Premium, or a live pair '
  '(trial or active) with a trainer on a paid plan, lifts the limit.';

-- replace_progress_photo: a retake (R82). It deletes the old row and inserts the new one in one transaction,
-- as the caller: the delete policy (own photos), the insert policy (own row, Free limit) and the column grants
-- apply unchanged, so no policy gets wider. If the insert is refused, the delete rolls back with it and the old
-- photo stays. The new row keeps the client, date and angle of the old one. The app uploads the new object
-- first and removes the old object only after this call succeeds: whichever step fails, no photo is lost, and
-- an object without a row stays visible to its owner only (R83).
create function public.replace_progress_photo(
  p_photo_id     uuid,
  p_new_id       uuid,
  p_storage_path text,
  p_face_blurred boolean,
  p_blur_method  text,
  p_width        integer,
  p_height       integer,
  p_note         text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_old public.progress_photos;
begin
  delete from public.progress_photos p
  where p.id = p_photo_id and p.client_id = (select auth.uid())
  returning p.* into v_old;
  if v_old.id is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'only the client replaces their own photo';
  end if;

  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method,
                                      width, height, note)
  values (p_new_id, v_old.client_id, v_old.angle, v_old.taken_on, p_storage_path, p_face_blurred, p_blur_method,
          p_width, p_height, p_note);
  return p_new_id;
end $$;

comment on function public.replace_progress_photo(uuid, uuid, text, boolean, text, integer, integer, text) is
  'Retake of a progress photo (R82, decisions Q64): deletes the caller''s photo and inserts the new one with the '
  'same date and angle in one transaction, under the caller''s policies. Returns the new id.';
revoke all on function public.replace_progress_photo(uuid, uuid, text, boolean, text, integer, integer, text)
  from public, anon;
grant execute on function public.replace_progress_photo(uuid, uuid, text, boolean, text, integer, integer, text)
  to authenticated;

-- set_progress_photo_angle: moves the caller's photo to another angle of its date. When another photo of that
-- date holds the angle, the two swap in one UPDATE; the deferrable unique constraint checks the result at the
-- end of the statement. Runs as the caller under the update policy and the (note, angle) column grant. A plain
-- UPDATE of angle still works when the angle is free.
create function public.set_progress_photo_angle(p_photo_id uuid, p_angle public.photo_angle)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_photo public.progress_photos;
begin
  select p.* into v_photo
  from public.progress_photos p
  where p.id = p_photo_id and p.client_id = (select auth.uid())
  for update;
  if v_photo.id is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'only the client changes the angle of their own photo';
  end if;

  update public.progress_photos p
  set angle = case when p.id = v_photo.id then p_angle else v_photo.angle end
  where p.client_id = v_photo.client_id and p.taken_on = v_photo.taken_on
    and (p.id = v_photo.id or p.angle = p_angle);
end $$;

comment on function public.set_progress_photo_angle(uuid, public.photo_angle) is
  'Sets the angle of the caller''s progress photo; a photo of the same date that holds that angle takes the old '
  'one, so two angles swap in one statement (R82, decisions Q64).';
revoke all on function public.set_progress_photo_angle(uuid, public.photo_angle) from public, anon;
grant execute on function public.set_progress_photo_angle(uuid, public.photo_angle) to authenticated;

-- trainer_profiles.is_public: the trainer's own switch. R16 adds a rule that nothing enforces yet: the later
-- public get_trainer_showcase must also hide the showcase of a rejected trainer.
comment on column public.trainer_profiles.is_public is
  'The trainer''s own switch for the public showcase /trainers/<slug>. A rejected verification hides the '
  'showcase too (R16, decisions Q60). Nothing reads this column yet: the later public get_trainer_showcase must '
  'answer unavailable when is_public is false or verification_status is rejected. Not submitted or pending '
  '(also after documents are sent again) shows the showcase without the badge. Client links, codes and trial '
  'links keep working after a rejection, without the badge.';

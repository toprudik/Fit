-- Owner decisions of 15.10.2026 (decisions §12, Q60-Q65; data-model §2.1.0 R16, R44, R50, R58, R82, R91). The
-- product owner delegated six open questions to Claude. Two of them touch the schema:
--   * R82 (Q64): a progress photo set is the photos of one taken_on date, at most one per angle, on every plan.
--     The unique constraint below enforces it; a retake replaces the photo by delete and insert (see below).
--   * R16 (Q60): a rejected verification hides the public showcase. Nothing reads is_public yet, so only its
--     comment changes; the later public get_trainer_showcase(slug) must answer "unavailable" for a rejected
--     trainer.
-- R44 (Q61), R50 (Q62), R58 (Q63) and R91 (Q65) confirm what the wave 1 migrations already do.
-- Production has no progress_photos rows yet, so the constraint needs no backfill.

-- progress_photos: one photo per client, date and angle (R82).
alter table public.progress_photos
  add constraint progress_photos_client_id_taken_on_angle_key unique (client_id, taken_on, angle);

comment on constraint progress_photos_client_id_taken_on_angle_key on public.progress_photos is
  'A set is the photos of one date, at most one per angle (R82, decisions Q64). A retake replaces the photo: the '
  'client deletes the old row and its object, then inserts the new row. UPDATE cannot do it: only note and '
  'angle are granted, and bucket progress-photos has no UPDATE policy.';

-- The unique index starts with (client_id, taken_on), so it serves everything the old index did: the client_id
-- lookups of the read policy, can_add_progress_photo and the cascade from profiles, and, scanned backwards, the
-- gallery order (client_id = $1 order by taken_on desc). Keeping both would only cost every upload.
drop index public.progress_photos_client_id_taken_on_idx;

comment on function private.can_add_progress_photo(date) is
  'Policy helper: whether the caller may upload a photo for this date now. A set is the photos of one taken_on '
  'date, one per angle (R82, decisions Q64). A Free client starts at most the plan''s number of new sets per '
  'calendar month of upload in their time zone; missing angles of a set started this month are free. Premium, '
  'or a live pair (trial or active) with a trainer on a paid plan, lifts the limit.';

-- trainer_profiles.is_public: the trainer's own switch; a rejected verification also hides the showcase (R16).
comment on column public.trainer_profiles.is_public is
  'The trainer''s own switch for the public showcase /trainers/<slug>. A rejected verification hides the '
  'showcase too (R16, decisions Q60): get_trainer_showcase answers unavailable while verification_status is '
  'rejected. Not submitted or pending shows it without the badge. Client links, codes and trial links keep '
  'working after a rejection, without the badge.';

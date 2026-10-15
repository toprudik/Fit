-- Storage buckets and their storage.objects policies (data-model §1.10, contract §1.5 file 27).
-- Object names never include the bucket; the first folder is the owner's user id (exercise-media: custom/<id>/).
-- Folder names are compared as text with auth.uid()::text and never cast to uuid, so a malformed name
-- simply matches nothing. Size and MIME limits are enforced by the Storage API from the bucket rows.
-- Public buckets serve reads through public URLs without RLS; their SELECT policies cover only the owner's
-- own folder, which upsert and remove need. Private buckets are read through signed URLs, which the Storage
-- API issues only when the SELECT policy below lets the caller see the object.
-- Every policy is to authenticated: anon has no policy, so it can only fetch public URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',         'avatars',         true,  2097152,  array['image/webp', 'image/jpeg', 'image/png']),
  ('certificates',    'certificates',    false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('progress-photos', 'progress-photos', false, 5242880,  array['image/webp', 'image/jpeg']),
  ('exercise-media',  'exercise-media',  true,  2097152,  array['image/webp', 'image/jpeg', 'image/png']),
  ('feedback',        'feedback',        false, 5242880,  array['image/webp', 'image/jpeg', 'image/png']),
  ('exports',         'exports',         false, 52428800, array['application/zip'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- avatars: <user_id>/<uuid>.webp, public read. Only the owner writes; no broad SELECT, so nobody can list
-- other users' folders (the unguessable name is the only way in).

create policy "avatars: owner reads own folder"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "avatars: owner reads own folder" on storage.objects is
  'The owner sees their own avatar objects (needed for upsert and remove); others use the public URL.';

create policy "avatars: owner uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "avatars: owner uploads" on storage.objects is 'A user uploads avatars into their own folder only.';

create policy "avatars: owner updates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "avatars: owner updates" on storage.objects is
  'A user overwrites their own avatar objects and cannot move them out of their folder.';

create policy "avatars: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "avatars: owner deletes" on storage.objects is 'A user removes their own avatar objects.';

-- certificates: <trainer_id>/<certificate_id>.<ext>, private. The trainer uploads; the trainer and admins
-- read (verification). No UPDATE: a replaced file gets a new name.

create policy "certificates: owner or admin reads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'certificates'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );

comment on policy "certificates: owner or admin reads" on storage.objects is
  'The trainer reads their own certificate files; admins read them to decide verification.';

create policy "certificates: trainer uploads own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_trainer())
  );

comment on policy "certificates: trainer uploads own" on storage.objects is
  'Only a trainer uploads certificate files, into their own folder.';

create policy "certificates: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "certificates: owner deletes" on storage.objects is 'The trainer removes their own certificate files.';

-- progress-photos: <client_id>/<photo_id>.webp, private, already blurred on the device. Only the client
-- writes. Others read an object only through a progress_photos row with that storage_path that their row
-- policy lets them see (private.can_view(client_id, 'photos'): a sharing trainer of a live pair, or an admin
-- with a live break-glass grant for photos). Objects without a row stay hidden from everyone but the owner (R83).

create policy "progress-photos: owner or photo viewers read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.progress_photos p where p.storage_path = objects.name)
    )
  );

comment on policy "progress-photos: owner or photo viewers read" on storage.objects is
  'The client reads own photos; others only through a progress_photos row their row policy shows them.';

create policy "progress-photos: owner uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "progress-photos: owner uploads" on storage.objects is 'A client uploads photos into their own folder only.';

create policy "progress-photos: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "progress-photos: owner deletes" on storage.objects is 'A client removes their own photo objects.';

-- exercise-media: wger/<wger_id>/... (written by the import with the secret key) and custom/<owner_id>/<uuid>.webp,
-- public read. A trainer manages only their own custom folder.

create policy "exercise-media: trainer reads own custom"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = 'custom'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_trainer())
  );

comment on policy "exercise-media: trainer reads own custom" on storage.objects is
  'A trainer sees their own custom exercise media (needed for upsert and remove); others use the public URL.';

create policy "exercise-media: trainer uploads own custom"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = 'custom'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_trainer())
  );

comment on policy "exercise-media: trainer uploads own custom" on storage.objects is
  'A trainer uploads media for own exercises under custom/<own id>/; wger media is server only.';

create policy "exercise-media: trainer updates own custom"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = 'custom'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_trainer())
  )
  with check (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = 'custom'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_trainer())
  );

comment on policy "exercise-media: trainer updates own custom" on storage.objects is
  'A trainer overwrites own custom exercise media and cannot move it out of their folder.';

create policy "exercise-media: trainer deletes own custom"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = 'custom'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_trainer())
  );

comment on policy "exercise-media: trainer deletes own custom" on storage.objects is
  'A trainer removes own custom exercise media.';

-- feedback: <user_id>/<feedback_id>/<n>.webp, private. The author uploads screenshots; the author and admins
-- read them. No UPDATE or DELETE: screenshots stay with the message (the account cleanup uses the secret key).

create policy "feedback: author or admin reads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );

comment on policy "feedback: author or admin reads" on storage.objects is
  'The author reads their own screenshots; admins read them with the feedback message.';

create policy "feedback: author uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "feedback: author uploads" on storage.objects is 'A user uploads feedback screenshots into their own folder only.';

-- exports: <user_id>/<export_id>.zip, private. The export job writes with the secret key; the owner reads
-- through a 15-minute signed URL (R54).

create policy "exports: owner reads"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on policy "exports: owner reads" on storage.objects is 'Only the owner reads their data export archive.';

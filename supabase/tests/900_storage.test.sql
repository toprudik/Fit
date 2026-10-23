-- Storage buckets and storage.objects policies of migration 20261015125200_storage.sql (contract §1.5 file 27,
-- §6 900_storage; data-model §1.10). Objects are inserted straight into storage.objects, the way the Storage
-- API does for a signed-in user. Size and MIME limits are enforced by the Storage API, so only the bucket rows
-- are checked for them. The progress-photos read rule goes through public.progress_photos and its row policy
-- (20261015123800_progress_policies.sql).
begin;
\ir _helpers.psql
select plan(84);

-- Fixtures: C has live pairs to A and B, D a live pair to A. Photos are not shared by default.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');

-- Direct deletes from storage tables are refused unless this is set (the Storage API sets it).
select set_config('storage.allow_delete_query', 'true', true);

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to anon, authenticated, service_role;
insert into tests.ids values ('photo_1', gen_random_uuid()), ('photo_orphan', gen_random_uuid()), ('fb_c', gen_random_uuid());

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;

-- Object name inside the user's folder: <user id>/<rest>.
create function tests.p(p_handle text, p_rest text) returns text language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)::text || '/' || p_rest
$$;

-- The helpers below run as the caller (security invoker), so storage.objects RLS applies to the current role.
create function tests.put(p_bucket text, p_name text) returns void language plpgsql set search_path = '' as $$
begin
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name);
end;
$$;

create function tests.visible(p_bucket text, p_name text) returns boolean language plpgsql set search_path = '' as $$
begin
  return exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_name);
end;
$$;

-- Updates metadata (and the name when p_new_name is given); returns the number of rows changed.
create function tests.touch(p_bucket text, p_name text, p_new_name text default null) returns integer
language plpgsql set search_path = '' as $$
declare
  v integer;
begin
  update storage.objects o set metadata = '{"touched": true}', name = coalesce(p_new_name, o.name)
  where o.bucket_id = p_bucket and o.name = p_name;
  get diagnostics v = row_count;
  return v;
end;
$$;

create function tests.remove(p_bucket text, p_name text) returns integer language plpgsql set search_path = '' as $$
declare
  v integer;
begin
  delete from storage.objects o where o.bucket_id = p_bucket and o.name = p_name;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Server-side object (the Storage API with the secret key, or a job).
create function tests.server_put(p_bucket text, p_name text) returns void language plpgsql set search_path = '' as $$
begin
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Buckets and the policy set

select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets
     where id in ('avatars', 'certificates', 'progress-photos', 'exercise-media', 'feedback', 'exports') order by id $$,
  $$ values
       ('avatars',         true,  2097152::bigint,  array['image/webp', 'image/jpeg', 'image/png']),
       ('certificates',    false, 10485760::bigint, array['image/jpeg', 'image/png', 'application/pdf']),
       ('exercise-media',  true,  2097152::bigint,  array['image/webp', 'image/jpeg', 'image/png']),
       ('exports',         false, 52428800::bigint, array['application/zip', 'text/csv', 'image/png']),
       ('feedback',        false, 5242880::bigint,  array['image/webp', 'image/jpeg', 'image/png']),
       ('progress-photos', false, 5242880::bigint,  array['image/webp', 'image/jpeg']) $$,
  'the six buckets have the expected visibility, size limit and MIME types'
);

-- One policy per (bucket, command), all for authenticated only.
select results_eq(
  $$ select split_part(p.polname::text, ':', 1) collate "default", p.polcmd::text, p.polroles = array['authenticated'::regrole::oid]
     from pg_policy p
     where p.polrelid = 'storage.objects'::regclass
       and split_part(p.polname::text, ':', 1) in ('avatars', 'certificates', 'progress-photos', 'exercise-media', 'feedback', 'exports')
     order by 1, 2 $$,
  $$ values
       ('avatars', 'a', true), ('avatars', 'd', true), ('avatars', 'r', true), ('avatars', 'w', true),
       ('certificates', 'a', true), ('certificates', 'd', true), ('certificates', 'r', true),
       ('exercise-media', 'a', true), ('exercise-media', 'd', true), ('exercise-media', 'r', true), ('exercise-media', 'w', true),
       ('exports', 'a', true), ('exports', 'r', true),
       ('feedback', 'a', true), ('feedback', 'r', true),
       ('progress-photos', 'a', true), ('progress-photos', 'd', true), ('progress-photos', 'r', true) $$,
  'storage.objects has exactly the planned policies, each for authenticated only'
);

-- ---------------------------------------------------------------------------------------------------------
-- avatars: public bucket, owner-only writes, own-folder SELECT only

select tests.authenticate_as('client_c');
select lives_ok(format($$ select tests.put('avatars', %L) $$, tests.p('client_c', 'a1.webp')), 'C uploads an avatar into own folder');
select throws_ok(
  format($$ select tests.put('avatars', %L) $$, tests.p('client_d', 'a1.webp')),
  '42501', 'new row violates row-level security policy for table "objects"',
  'C cannot upload into D''s folder'
);
select throws_ok(
  $$ select tests.put('avatars', 'a1.webp') $$,
  '42501', null,
  'C cannot upload outside any user folder'
);
select ok(tests.visible('avatars', tests.p('client_c', 'a1.webp')), 'C sees own avatar object (needed for upsert)');
select is(tests.touch('avatars', tests.p('client_c', 'a1.webp')), 1, 'C overwrites own avatar');
select throws_ok(
  format($$ select tests.touch('avatars', %L, %L) $$, tests.p('client_c', 'a1.webp'), tests.p('client_d', 'moved.webp')),
  '42501', null,
  'C cannot move own avatar into D''s folder'
);

select tests.authenticate_as('client_d');
select ok(not tests.visible('avatars', tests.p('client_c', 'a1.webp')), 'D cannot list C''s avatar object');
select is(tests.touch('avatars', tests.p('client_c', 'a1.webp')), 0, 'D cannot overwrite C''s avatar');
select is(tests.remove('avatars', tests.p('client_c', 'a1.webp')), 0, 'D cannot delete C''s avatar');

select tests.authenticate_as('trainer_a');
select ok(not tests.visible('avatars', tests.p('client_c', 'a1.webp')), 'C''s trainer cannot list C''s avatar object either');

select tests.authenticate_as_anon();
select throws_ok(
  format($$ select tests.put('avatars', %L) $$, tests.p('client_c', 'anon.webp')),
  '42501', null,
  'anon cannot upload'
);
select ok(not tests.visible('avatars', tests.p('client_c', 'a1.webp')), 'anon cannot list objects (public URLs only)');

select tests.authenticate_as('client_c');
select is(tests.remove('avatars', tests.p('client_c', 'a1.webp')), 1, 'C deletes own avatar');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- certificates: private; a trainer uploads, the trainer and admins read; no UPDATE

select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select tests.put('certificates', %L) $$, tests.p('trainer_a', 'cert1.pdf')), 'A uploads a certificate');
select throws_ok(
  format($$ select tests.put('certificates', %L) $$, tests.p('trainer_b', 'cert1.pdf')),
  '42501', null,
  'A cannot upload into B''s folder'
);
select ok(tests.visible('certificates', tests.p('trainer_a', 'cert1.pdf')), 'A reads own certificate');
select is(tests.touch('certificates', tests.p('trainer_a', 'cert1.pdf')), 0, 'A cannot overwrite a certificate (no UPDATE)');

select tests.authenticate_as('client_c');
select throws_ok(
  format($$ select tests.put('certificates', %L) $$, tests.p('client_c', 'cert1.pdf')),
  '42501', null,
  'C (not a trainer) cannot upload a certificate'
);
select ok(not tests.visible('certificates', tests.p('trainer_a', 'cert1.pdf')), 'A''s client cannot read A''s certificate');

select tests.authenticate_as('trainer_b');
select ok(not tests.visible('certificates', tests.p('trainer_a', 'cert1.pdf')), 'B cannot read A''s certificate');
select is(tests.remove('certificates', tests.p('trainer_a', 'cert1.pdf')), 0, 'B cannot delete A''s certificate');

select tests.authenticate_as('admin_x');
select ok(tests.visible('certificates', tests.p('trainer_a', 'cert1.pdf')), 'the admin reads A''s certificate');
select is(tests.remove('certificates', tests.p('trainer_a', 'cert1.pdf')), 0, 'the admin cannot delete it');

select tests.authenticate_as('trainer_a');
select is(tests.remove('certificates', tests.p('trainer_a', 'cert1.pdf')), 1, 'A deletes own certificate');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- progress-photos: private; only the client writes; others read through a visible progress_photos row

create function tests.photo_name(p_name text) returns text language sql stable set search_path = '' as $$
  select tests.p('client_c', tests.i(p_name)::text || '.webp')
$$;

-- The row as the client would insert it after the upload.
create function tests.add_photo_row() returns void language plpgsql set search_path = '' as $$
begin
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  values (tests.i('photo_1'), tests.user_id('client_c'), 'front', current_date, tests.photo_name('photo_1'), true, 'auto', 900, 1200);
end;
$$;

select tests.authenticate_as('client_c');
select lives_ok(format($$ select tests.put('progress-photos', %L) $$, tests.photo_name('photo_1')), 'C uploads a photo into own folder');
select lives_ok(format($$ select tests.put('progress-photos', %L) $$, tests.photo_name('photo_orphan')), 'C uploads a second object');
select throws_ok(
  format($$ select tests.put('progress-photos', %L) $$, tests.p('client_d', tests.i('photo_1')::text || '.webp')),
  '42501', null,
  'C cannot upload into D''s folder'
);
select ok(tests.visible('progress-photos', tests.photo_name('photo_1')), 'C reads own photo object');
select is(tests.touch('progress-photos', tests.photo_name('photo_1')), 0, 'C cannot overwrite a photo (no UPDATE)');

select tests.authenticate_as('trainer_a');
select throws_ok(
  format($$ select tests.put('progress-photos', %L) $$, tests.p('client_c', 'by-trainer.webp')),
  '42501', null,
  'C''s trainer cannot upload into C''s folder'
);
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'A cannot read C''s photo object before the row exists');

select tests.clear_authentication();
select tests.add_photo_row();
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'A cannot read it while photos are not shared');

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'photos', true);
select tests.authenticate_as('trainer_a');
select ok(tests.visible('progress-photos', tests.photo_name('photo_1')), 'A reads C''s photo object once the row exists and photos are shared');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_orphan')), 'an object without a row stays hidden from A (R83)');
select is(tests.remove('progress-photos', tests.photo_name('photo_1')), 0, 'A cannot delete C''s photo object');

select tests.authenticate_as('trainer_b');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'B (C''s other trainer, no share) cannot read it');
select tests.authenticate_as('client_d');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'D (another client of A) cannot read it');
select tests.authenticate_as('stranger_s');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'an unrelated user cannot read it');

-- The photo row goes away (the client deleted the photo): the object is hidden again.
select tests.clear_authentication();
delete from public.progress_photos where id = tests.i('photo_1');
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'A cannot read the object once its row is gone');
select tests.clear_authentication();
select tests.add_photo_row();

-- Admins: nothing without break-glass, nothing with a grant for another category, nothing once expired.
select tests.authenticate_as('admin_x');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'the admin without break-glass cannot read the photo');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{measurements}');
select tests.create_break_glass('admin_y', 'client_c', '{photos}', now() - interval '1 minute', now() - interval '61 minutes');
select tests.authenticate_as('admin_x');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'a measurements-only grant does not open photos');
select tests.authenticate_as('admin_y');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'an expired photos grant opens nothing');
select tests.clear_authentication();
select tests.create_break_glass('admin_x', 'client_c', '{photos}');
select tests.authenticate_as('admin_x');
select ok(tests.visible('progress-photos', tests.photo_name('photo_1')), 'a live photos grant lets the admin read the photo (ADM-15)');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_orphan')), 'but not an object without a row');
select tests.clear_authentication();

-- The pair ends: personal data closes for the trainer.
update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_a', 'client_c');
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('progress-photos', tests.photo_name('photo_1')), 'A cannot read C''s photo after the pair ends');

select tests.authenticate_as('client_c');
select ok(tests.visible('progress-photos', tests.photo_name('photo_orphan')), 'C still reads own objects without a row');
select is(tests.remove('progress-photos', tests.photo_name('photo_orphan')), 1, 'C deletes own photo object');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- exercise-media: public; trainers manage only custom/<own id>/; wger/ is server only

select tests.authenticate_as('trainer_a');
select lives_ok(
  format($$ select tests.put('exercise-media', %L) $$, 'custom/' || tests.p('trainer_a', 'm1.webp')),
  'A uploads media under custom/<A>/'
);
select throws_ok(
  $$ select tests.put('exercise-media', 'wger/123/m1.webp') $$,
  '42501', null,
  'A cannot write under wger/'
);
select throws_ok(
  format($$ select tests.put('exercise-media', %L) $$, 'custom/' || tests.p('trainer_b', 'm1.webp')),
  '42501', null,
  'A cannot write under custom/<B>/'
);
select throws_ok(
  format($$ select tests.put('exercise-media', %L) $$, tests.p('trainer_a', 'm1.webp')),
  '42501', null,
  'A cannot write into a bare user folder of this bucket'
);
select ok(tests.visible('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 'A sees own custom media');
select is(tests.touch('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 1, 'A overwrites own custom media');
select throws_ok(
  format($$ select tests.touch('exercise-media', %L, %L) $$,
    'custom/' || tests.p('trainer_a', 'm1.webp'), 'wger/123/m1.webp'),
  '42501', null,
  'A cannot move own media under wger/'
);

select tests.authenticate_as('client_c');
select throws_ok(
  format($$ select tests.put('exercise-media', %L) $$, 'custom/' || tests.p('client_c', 'm1.webp')),
  '42501', null,
  'C (not a trainer) cannot upload exercise media'
);

select tests.clear_authentication();
select tests.server_put('exercise-media', 'wger/123/m1.webp');
select tests.authenticate_as('trainer_b');
select ok(not tests.visible('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 'B cannot list A''s custom media');
select is(tests.touch('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 0, 'B cannot overwrite A''s custom media');
select is(tests.remove('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 0, 'B cannot delete A''s custom media');
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('exercise-media', 'wger/123/m1.webp'), 'wger objects are not listed to trainers');
select is(tests.remove('exercise-media', 'wger/123/m1.webp'), 0, 'A cannot delete wger media');
select is(tests.remove('exercise-media', 'custom/' || tests.p('trainer_a', 'm1.webp')), 1, 'A deletes own custom media');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- feedback: private; the author uploads, the author and admins read; no UPDATE or DELETE

create function tests.fb_name() returns text language sql stable set search_path = '' as $$
  select tests.p('client_c', tests.i('fb_c')::text || '/1.webp')
$$;

select tests.authenticate_as('client_c');
select lives_ok(format($$ select tests.put('feedback', %L) $$, tests.fb_name()), 'C uploads a feedback screenshot');
select throws_ok(
  format($$ select tests.put('feedback', %L) $$, tests.p('client_d', tests.i('fb_c')::text || '/1.webp')),
  '42501', null,
  'C cannot upload into D''s folder'
);
select ok(tests.visible('feedback', tests.fb_name()), 'C reads own screenshot');
select is(tests.touch('feedback', tests.fb_name()), 0, 'C cannot overwrite a screenshot');
select is(tests.remove('feedback', tests.fb_name()), 0, 'C cannot delete a screenshot');

select tests.authenticate_as('admin_x');
select ok(tests.visible('feedback', tests.fb_name()), 'the admin reads the screenshot');
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('feedback', tests.fb_name()), 'C''s trainer cannot read the screenshot');
select tests.authenticate_as('client_d');
select ok(not tests.visible('feedback', tests.fb_name()), 'another user cannot read the screenshot');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- exports: private; written by the export job, read by the owner only

select tests.server_put('exports', tests.p('client_c', 'e1.zip'));
select tests.server_put('exports', tests.p('client_d', 'e1.zip'));

select tests.authenticate_as('client_c');
select ok(tests.visible('exports', tests.p('client_c', 'e1.zip')), 'C reads own export');
select ok(not tests.visible('exports', tests.p('client_d', 'e1.zip')), 'C cannot read D''s export');
select throws_ok(
  format($$ select tests.put('exports', %L) $$, tests.p('client_c', 'e2.zip')),
  '42501', null,
  'C cannot write an export'
);
select is(tests.remove('exports', tests.p('client_c', 'e1.zip')), 0, 'C cannot delete own export (the job expires it)');
select lives_ok(format($$ select tests.put('exports', %L) $$, tests.p('client_c', 'csv/c1.csv')),
  'C puts a CSV copy into own csv folder (20261023022417_csv_downloads.sql)');
select ok(tests.visible('exports', tests.p('client_c', 'csv/c1.csv')), 'C reads own CSV copy (for the signed link)');
select throws_ok(format($$ select tests.put('exports', %L) $$, tests.p('client_d', 'csv/c1.csv')), '42501', null,
  'C cannot put a CSV copy into D''s folder');
select throws_ok(format($$ select tests.put('exports', %L) $$, tests.p('client_c', 'c2.csv')), '42501', null,
  'C cannot put a CSV outside the csv folder');
select throws_ok(format($$ select tests.put('exports', %L) $$, tests.p('client_c', 'csv/deep/c3.csv')), '42501', null,
  'C cannot put a CSV into a folder below csv');
select throws_ok(format($$ select tests.put('exports', %L) $$, tests.p('client_c', 'csv/c4.zip')), '42501', null,
  'C cannot put another kind of file into the csv folder');
select is(tests.remove('exports', tests.p('client_c', 'csv/c1.csv')), 0, 'C cannot delete own CSV copy (the privacy route does)');

select tests.authenticate_as('admin_x');
select ok(not tests.visible('exports', tests.p('client_c', 'e1.zip')), 'the admin cannot read C''s export');
select tests.authenticate_as('trainer_a');
select ok(not tests.visible('exports', tests.p('client_d', 'e1.zip')), 'D''s trainer cannot read D''s export');
select tests.clear_authentication();

select * from finish();
rollback;

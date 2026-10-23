-- QR copies for Telegram's download dialog (20261023041613_qr_downloads.sql): a trainer puts a PNG into their own
-- qr folder only, CSV copies still go into csv/, and stale_csv_downloads lists both kinds once they are 30 minutes old.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');

select tests.authenticate_as('trainer_a');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                       tests.user_id('trainer_a')::text || '/qr/q1.png'),
  'A puts a QR copy into own qr folder');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                       tests.user_id('trainer_a')::text || '/csv/c1.csv'),
  'A still puts a CSV copy into own csv folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                        tests.user_id('trainer_b')::text || '/qr/q1.png'), '42501', null,
  'A cannot put a QR copy into B''s folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                        tests.user_id('trainer_a')::text || '/qr/q2.svg'), '42501', null,
  'A cannot put another kind of file into the qr folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                        tests.user_id('trainer_a')::text || '/csv/q3.png'), '42501', null,
  'A cannot put a PNG into the csv folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('exports', %L) $$,
                        tests.user_id('trainer_a')::text || '/qr/deep/q4.png'), '42501', null,
  'A cannot put a QR copy into a folder below qr');
select tests.clear_authentication();

select is((select allowed_mime_types from storage.buckets where id = 'exports'),
  array['application/zip', 'text/csv', 'image/png'], 'exports takes PNG copies too');

insert into storage.objects (bucket_id, name, created_at) values
  ('exports', tests.user_id('trainer_b')::text || '/qr/old.png', now() - interval '31 minutes'),
  ('exports', tests.user_id('trainer_b')::text || '/csv/old.csv', now() - interval '32 minutes'),
  ('exports', tests.user_id('trainer_b')::text || '/old.zip', now() - interval '2 days');
select tests.authenticate_as_service_role();
select results_eq($$ select public.stale_csv_downloads(10) $$,
  array[tests.user_id('trainer_b')::text || '/csv/old.csv', tests.user_id('trainer_b')::text || '/qr/old.png'],
  'stale_csv_downloads: old CSV and QR copies, oldest first, no archives');
select tests.clear_authentication();

select * from finish();
rollback;

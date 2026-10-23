-- The printed QR of a location saved through Telegram's download dialog (QA 23.10: «Сохранить для печати» on
-- /trainer/checkin-qr does nothing in the Mini App, whose WebView ignores <a download>). Like the CSV copies of
-- 20261023022417_csv_downloads.sql, the trainer's own session puts a PNG at exports/<user_id>/qr/<uuid>.png and
-- Telegram gets a short signed link; the privacy route removes each copy 30 minutes after upload.

update storage.buckets
set allowed_mime_types = array['application/zip', 'text/csv', 'image/png']
where id = 'exports';

-- One insert policy for the bucket (900_storage checks one per command): a CSV into csv/, a PNG into qr/.
drop policy "exports: owner uploads csv" on storage.objects;

create policy "exports: owner uploads a download copy"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and pg_catalog.array_length(storage.foldername(name), 1) = 2
    and (((storage.foldername(name))[2] = 'csv' and name like '%.csv')
         or ((storage.foldername(name))[2] = 'qr' and name like '%.png'))
  );

comment on policy "exports: owner uploads a download copy" on storage.objects is
  'A user puts a copy for Telegram''s download dialog into their own folder only: a CSV into csv/, a QR PNG into '
  'qr/. The privacy route removes it.';

-- The body of 20261023022417_csv_downloads.sql, plus the QR copies.
create or replace function public.stale_csv_downloads(p_limit integer)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'exports'
    and (storage.foldername(o.name))[2] in ('csv', 'qr')
    and o.created_at < pg_catalog.now() - interval '30 minutes'
  order by o.created_at
  limit p_limit
$$;

comment on function public.stale_csv_downloads(integer) is
  'Service role: download copies in exports/<user_id>/csv/ and qr/ older than 30 minutes, for the privacy route to '
  'remove.';

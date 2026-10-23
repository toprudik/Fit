-- CSV files of «Аналитика» saved through Telegram's download dialog (QA 22.10: the Mini App's WebView on Android
-- ignores <a download>). Telegram fetches the file itself, without the app's cookies, so the export route puts a
-- copy at exports/<user_id>/csv/<uuid>.csv with the trainer's own session and hands Telegram a short signed link.
-- The privacy route removes each copy 30 minutes after upload, so none lives longer than an hour.

update storage.buckets
set allowed_mime_types = array['application/zip', 'text/csv']
where id = 'exports';

create policy "exports: owner uploads csv"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'csv'
    and pg_catalog.array_length(storage.foldername(name), 1) = 2
    and name like '%.csv'
  );

comment on policy "exports: owner uploads csv" on storage.objects is
  'A user puts a CSV copy for Telegram''s download dialog into their own csv folder only; the privacy route removes it.';

-- What the privacy route removes: CSV copies older than 30 minutes, oldest first.
create function public.stale_csv_downloads(p_limit integer)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'exports'
    and (storage.foldername(o.name))[2] = 'csv'
    and o.created_at < pg_catalog.now() - interval '30 minutes'
  order by o.created_at
  limit p_limit
$$;

comment on function public.stale_csv_downloads(integer) is
  'Service role: CSV copies in exports/<user_id>/csv/ older than 30 minutes, for the privacy route to remove.';
revoke all on function public.stale_csv_downloads(integer) from public, anon, authenticated;
grant execute on function public.stale_csv_downloads(integer) to service_role;

-- The body of 20261021010217_retention.sql, plus the CSV copies.
create or replace function private.dispatch_privacy()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.data_exports e where e.status = 'queued'
                   or (e.status = 'processing' and e.updated_at < pg_catalog.now() - interval '15 minutes')
                   or (e.status = 'ready' and e.expires_at <= pg_catalog.now()))
     and not exists (select 1 from public.account_deletions d where d.cancelled_at is null and d.scheduled_for <= pg_catalog.now())
     and not exists (select 1 from public.health_erasures h where h.done_at is null and h.scheduled_for <= pg_catalog.now())
     and not exists (select 1 from public.retention_due_files(1))
     and not exists (select 1 from public.stale_csv_downloads(1))
  then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := pg_catalog.regexp_replace(v_url, '/api/cron/notifications$', '/api/cron/privacy'),
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000);
end $$;

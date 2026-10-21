-- Retention with automatic clean-up (legal item 8, Б10; privacy policy §5.1 rows 9, 10, 15, 16, 18). Periods:
-- * app_opens: 13 months after the opening (row 18);
-- * admin_audit_log: 3 years after the action (row 16);
-- * feedback: 3 years after it was sent, screenshots included (row 15);
-- * reports: 3 years after the decision, with their appeals; open ones stay until decided (row 15);
-- * trainer_certificates: 1 year after the admin's decision on the submission they belonged to, files included (row 9);
-- * notification_outbox: failed and stuck rows 90 days after they were due (row 10; handled rows already go after
--   90 days, 20261015220000_notification_dispatch.sql).
-- Rows go by a daily pg_cron job. Rows with Storage files (feedback screenshots, certificates) go through the web
-- privacy route, which removes the files first: Storage objects are deleted through the Storage API only.

-- The audit log stays append-only, except that the retention job may delete rows older than three years. The flag
-- is transaction-local and set only by private.purge_expired_rows; even with it, a younger row cannot be deleted.
create function private.audit_log_retention_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('private.retention', true) = 'on'
     and old.created_at < pg_catalog.now() - interval '3 years' then
    return old;
  end if;
  raise exception 'append_only' using errcode = 'P0001',
    detail = pg_catalog.format('rows of %I.%I cannot be deleted', tg_table_schema, tg_table_name);
end $$;

comment on function private.audit_log_retention_delete() is
  'Trigger: admin_audit_log rows are deleted only by the retention job, and only when older than three years.';
revoke all on function private.audit_log_retention_delete() from public;

drop trigger admin_audit_log_append_only on public.admin_audit_log;
create trigger admin_audit_log_append_only
  before update on public.admin_audit_log
  for each row execute function private.enforce_append_only();
create trigger admin_audit_log_retention_delete
  before delete on public.admin_audit_log
  for each row execute function private.audit_log_retention_delete();

create index feedback_created_at_idx on public.feedback (created_at);
create index reports_resolved_at_idx on public.reports (resolved_at) where resolved_at is not null;

-- Rows with files ---------------------------------------------------------------------------------------------------

-- Certificates due: the admin decided on the submission at least a year ago (the first decision after the upload).
create function private.certificate_due(p_trainer_id uuid, p_uploaded_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select v.created_at < pg_catalog.now() - interval '1 year'
    from public.trainer_verifications v
    where v.trainer_id = p_trainer_id and v.decision in ('verified', 'rejected') and v.created_at >= p_uploaded_at
    order by v.created_at
    limit 1
  ), false)
$$;

comment on function private.certificate_due(uuid, timestamptz) is
  'Whether a certificate uploaded at the given moment is past its year after the admin''s decision (retention).';
revoke all on function private.certificate_due(uuid, timestamptz) from public;

-- What the privacy route removes: feedback with screenshots older than three years and due certificates, oldest
-- first. kind says which table, bucket and paths which Storage objects go before the row.
create function public.retention_due_files(p_limit integer)
returns table (kind text, id uuid, bucket text, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  (select 'feedback', f.id, 'feedback', f.attachment_paths
   from public.feedback f
   where f.created_at < pg_catalog.now() - interval '3 years' and pg_catalog.cardinality(f.attachment_paths) > 0
   order by f.created_at
   limit p_limit)
  union all
  (select 'certificate', c.id, 'certificates', array[c.storage_path]
   from public.trainer_certificates c
   where private.certificate_due(c.trainer_id, c.created_at)
   order by c.created_at
   limit p_limit)
$$;

comment on function public.retention_due_files(integer) is
  'Service role: feedback with screenshots and certificates past their retention, with the Storage objects to '
  'remove before the row (privacy route).';
revoke all on function public.retention_due_files(integer) from public, anon, authenticated;
grant execute on function public.retention_due_files(integer) to service_role;

-- Deletes the row once its files are gone, if it is still due. True when a row went.
create function public.retention_forget(p_kind text, p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind = 'feedback' then
    delete from public.feedback f where f.id = p_id and f.created_at < pg_catalog.now() - interval '3 years';
  elsif p_kind = 'certificate' then
    delete from public.trainer_certificates c where c.id = p_id and private.certificate_due(c.trainer_id, c.created_at);
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  return found;
end $$;

comment on function public.retention_forget(text, uuid) is
  'Service role: deletes a feedback row or certificate past its retention after the privacy route removed its files.';
revoke all on function public.retention_forget(text, uuid) from public, anon, authenticated;
grant execute on function public.retention_forget(text, uuid) to service_role;

-- Rows without files -------------------------------------------------------------------------------------------------

create function private.purge_expired_rows()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_opens bigint;
  v_outbox bigint;
  v_reports bigint;
  v_feedback bigint;
  v_audit bigint;
begin
  delete from public.app_opens o where o.opened_at < pg_catalog.now() - interval '13 months';
  get diagnostics v_opens = row_count;

  delete from public.notification_outbox o
  where o.status in ('pending', 'processing', 'failed') and o.deliver_after < pg_catalog.now() - interval '90 days';
  get diagnostics v_outbox = row_count;

  -- An appeal goes with the report it appeals (on delete cascade), so a report waits for its appeals too.
  delete from public.reports r
  where r.resolved_at < pg_catalog.now() - interval '3 years'
    and not exists (select 1 from public.reports a where a.appeal_of = r.id
                    and (a.resolved_at is null or a.resolved_at >= pg_catalog.now() - interval '3 years'));
  get diagnostics v_reports = row_count;

  -- Feedback with screenshots waits for the privacy route, which removes the files first.
  delete from public.feedback f
  where f.created_at < pg_catalog.now() - interval '3 years' and pg_catalog.cardinality(f.attachment_paths) = 0;
  get diagnostics v_feedback = row_count;

  perform pg_catalog.set_config('private.retention', 'on', true);
  delete from public.admin_audit_log a where a.created_at < pg_catalog.now() - interval '3 years';
  get diagnostics v_audit = row_count;
  perform pg_catalog.set_config('private.retention', 'off', true);

  return pg_catalog.jsonb_build_object('app_opens', v_opens, 'notification_outbox', v_outbox, 'reports', v_reports,
                                       'feedback', v_feedback, 'admin_audit_log', v_audit);
end $$;

comment on function private.purge_expired_rows() is
  'pg_cron job body: deletes app_opens, stuck notifications, reports, feedback without screenshots and admin log '
  'rows past their retention (privacy policy §5.1). Returns the counts.';
revoke all on function private.purge_expired_rows() from public;

select cron.schedule('retention', '41 3 * * *', 'select private.purge_expired_rows()');

-- The privacy route also runs when files are due (body from 20261020162057_health_data_erasure.sql).
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

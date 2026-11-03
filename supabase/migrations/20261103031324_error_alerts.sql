-- Error alerts in the team's Telegram chat (ADR 0017). The free Sentry plan sends alerts by email only, so the web
-- app asks Sentry itself: every five minutes pg_cron calls POST /api/cron/errors through pg_net with the dispatcher's
-- secret from Vault. The route reads the issues Sentry first saw in the last day, keeps those this table has not
-- seen and posts one short message per new issue to TELEGRAM_ADMIN_CHAT_ID. The table holds Sentry issue ids only,
-- for 90 days.

create table private.error_alerts (
  issue_id    text primary key check (issue_id ~ '^[0-9]{1,20}$'),
  notified_at timestamptz not null default pg_catalog.now()
);

comment on table private.error_alerts is
  'Sentry issues already posted to the team chat, so each new issue is posted once. Ids only; kept 90 days.';
revoke all on table private.error_alerts from public;

-- Claims the ids not posted yet and returns them; the route posts exactly those. Old rows go here too: an issue
-- first seen more than 90 days ago is outside the route's one-day window, so forgetting it posts nothing again.
create function public.claim_error_alerts(p_issue_ids text[])
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.error_alerts a where a.notified_at < pg_catalog.now() - interval '90 days';
  return query
    insert into private.error_alerts (issue_id)
    select distinct i from pg_catalog.unnest(p_issue_ids) as i where i ~ '^[0-9]{1,20}$'
    on conflict (issue_id) do nothing
    returning issue_id;
end $$;

comment on function public.claim_error_alerts(text[]) is
  'Service role: records Sentry issue ids for the team chat and returns those not recorded before.';
revoke all on function public.claim_error_alerts(text[]) from public, anon, authenticated;
grant execute on function public.claim_error_alerts(text[]) to service_role;

create function private.dispatch_error_alerts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := pg_catalog.regexp_replace(v_url, '/api/cron/notifications$', '/api/cron/errors'),
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000);
end $$;

comment on function private.dispatch_error_alerts() is
  'Asks POST /api/cron/errors to post new Sentry issues to the team chat. Returns the pg_net request id, or null '
  'while the dispatcher URL or secret is not in Vault.';
revoke all on function private.dispatch_error_alerts() from public;

-- cron.schedule with a name replaces a job of the same name, so re-running this file is harmless.
select cron.schedule('error-alerts', '*/5 * * * *', 'select private.dispatch_error_alerts()');

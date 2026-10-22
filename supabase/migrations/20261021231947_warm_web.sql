-- Keep the web function warm. On the Hobby plan an idle Vercel function goes cold after about ten minutes, and the
-- next Mini App launch waits for it: QA measured 4.3 s cold against 1.7-2.1 s warm (TTFB 1.36 s against 0.25 s).
-- Every three minutes pg_cron asks GET /api/warm through pg_net. The request passes the proxy and lands in the same
-- function as the pages and the sign-in route; it reads nothing and writes nothing. About 14,400 calls a month, well
-- inside the Hobby allowance of 1,000,000 invocations.
create or replace function private.warm_web()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  -- The site's address comes from the dispatcher URL already in Vault; without it (local, CI) nothing is sent.
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  if v_url is null then
    return null;
  end if;

  return net.http_get(
    url := pg_catalog.regexp_replace(v_url, '/api/cron/notifications$', '/api/warm'),
    timeout_milliseconds := 10000);
end $$;

comment on function private.warm_web() is
  'Asks GET /api/warm so the Vercel function of the web app stays warm. Returns the pg_net request id, or null '
  'while the dispatcher URL is not in Vault.';
revoke all on function private.warm_web() from public;

-- cron.schedule with a name replaces a job of the same name, so re-running this file is harmless.
select cron.schedule('web-warm', '*/3 * * * *', 'select private.warm_web()');

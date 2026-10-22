-- Warm-up job of migration 20261021231947_warm_web.sql: it runs every three minutes and asks GET /api/warm on the
-- site named by the dispatcher URL in Vault, and does nothing while that URL is not set.
begin;
\ir _helpers.psql
select plan(4);

select is(
  (select j.schedule || ' ' || j.command from cron.job j where j.jobname = 'web-warm'),
  '*/3 * * * * select private.warm_web()',
  'cron: the warm-up runs every three minutes');
select is(private.warm_web(), null, 'warm: does nothing while the dispatcher URL is not in Vault');

select private.configure_notification_dispatch('https://dafit.example/api/cron/notifications', repeat('a', 40));
select isnt(private.warm_web(), null, 'warm: with the URL set, it queues a request');
select is(
  (select r.method || ' ' || r.url || ' ' || coalesce(r.headers ->> 'Authorization', 'no-auth')
     from net.http_request_queue r order by r.id desc limit 1),
  'GET https://dafit.example/api/warm no-auth',
  'warm: a plain GET to /api/warm, without the cron secret');

select * from finish();
rollback;

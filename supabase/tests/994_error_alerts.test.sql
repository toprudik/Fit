-- Error alerts of migration 20261102233059_error_alerts.sql: pg_cron asks POST /api/cron/errors every five
-- minutes, and public.claim_error_alerts returns each Sentry issue id once, to the service role only.
begin;
\ir _helpers.psql
select plan(11);

select is(
  (select j.schedule || ' ' || j.command from cron.job j where j.jobname = 'error-alerts'),
  '*/5 * * * * select private.dispatch_error_alerts()',
  'cron: error alerts run every five minutes');
select is(private.dispatch_error_alerts(), null, 'dispatch: does nothing while the dispatcher URL is not in Vault');

select private.configure_notification_dispatch('https://dafit.example/api/cron/notifications', repeat('a', 40));
select isnt(private.dispatch_error_alerts(), null, 'dispatch: with the URL set, it queues a request');
select is(
  (select r.method || ' ' || r.url || ' ' || (r.headers ->> 'Authorization')
     from net.http_request_queue r order by r.id desc limit 1),
  'POST https://dafit.example/api/cron/errors Bearer ' || repeat('a', 40),
  'dispatch: a POST to /api/cron/errors with the cron secret');

select is(
  (select array_agg(i order by i) from public.claim_error_alerts(array['101', '102', '101']) as c(i)),
  array['101', '102'],
  'claim: new ids come back once each');
select is(
  (select array_agg(i order by i) from public.claim_error_alerts(array['102', '103']) as c(i)),
  array['103'],
  'claim: an id already posted does not come back');
select is(
  (select count(*)::int from public.claim_error_alerts(array['x; drop', '']::text[]) as c(i)),
  0,
  'claim: anything but a numeric Sentry id is ignored');

update private.error_alerts set notified_at = now() - interval '91 days' where issue_id = '101';
select is(
  (select array_agg(i) from public.claim_error_alerts(array['104']) as c(i)),
  array['104'],
  'claim: returns the new id');
select ok(
  not exists (select 1 from private.error_alerts where issue_id = '101'),
  'claim: rows older than 90 days are deleted');

select ok(
  not has_function_privilege('authenticated', 'public.claim_error_alerts(text[])', 'execute')
    and not has_function_privilege('anon', 'public.claim_error_alerts(text[])', 'execute'),
  'claim: signed-in users and anon cannot run it');
select ok(
  not has_table_privilege('authenticated', 'private.error_alerts', 'select'),
  'table: users cannot read it');

select * from finish();
rollback;

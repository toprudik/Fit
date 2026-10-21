-- Health data erasure, migration 20261020162057_health_data_erasure.sql (право 5): withdrawing pd_health schedules
-- it in 30 days, giving the consent again cancels it, and purge_health_data erases only a due one.
begin;
\ir _helpers.psql
select plan(13);

select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_trainer('trainer_t');
select tests.create_pair('trainer_t', 'client_e');

-- E gives the consent and keeps a weight and a day of steps.
select tests.authenticate_as('client_e');
insert into public.consents (user_id, kind, version) values (tests.user_id('client_e'), 'pd_health', '2026-11');
select tests.authenticate_as_service_role();
insert into public.measurements (client_id, kind, value, measured_at, local_date)
values (tests.user_id('client_e'), 'weight', 70, '2026-11-02 08:00+00', '2026-11-02');
insert into public.activity_entries (client_id, local_date, metric, value)
values (tests.user_id('client_e'), '2026-11-02', 'steps', 8000);
insert into public.ingest_tokens (user_id, token_hash) values (tests.user_id('client_e'), '\x01');

select tests.authenticate_as('client_e');
update public.consents set revoked_at = pg_catalog.now()
where user_id = tests.user_id('client_e') and kind = 'pd_health' and revoked_at is null;

select results_eq(
  $$ select (scheduled_for - revoked_at = interval '30 days'), done_at is null from public.health_erasures $$,
  $$ values (true, true) $$,
  'withdrawing the consent schedules the erasure 30 days ahead, and E reads it'
);
select tests.authenticate_as_service_role();
select results_eq(
  $$ select nutrition or measurements or photos or steps or intake or workouts, intake_decided_at is null from public.data_shares
     where coaching_id = tests.pair_id('trainer_t', 'client_e') $$,
  $$ values (false, true) $$,
  'the trainer loses every category at once, and the client chooses them again after a new consent'
);
select is_empty(
  $$ select 1 from public.ingest_tokens where user_id = tests.user_id('client_e') $$,
  'the iOS Shortcuts token stops taking steps at once'
);
select tests.authenticate_as('client_f');
select is_empty($$ select 1 from public.health_erasures $$, 'F does not see the erasure of E');
select throws_ok(
  $$ select public.purge_health_data(tests.user_id('client_e')) $$,
  '42501', null,
  'a signed-in user cannot run the erasure'
);
select throws_ok(
  $$ insert into public.health_erasures (user_id) values (tests.user_id('client_f')) $$,
  '42501', null,
  'a user cannot write an erasure'
);

select tests.authenticate_as_service_role();
select is(public.purge_health_data(tests.user_id('client_e')), false, 'nothing is erased before the 30 days pass');
select is((select pg_catalog.count(*)::int from public.measurements where client_id = tests.user_id('client_e')), 1, 'so the weight stays');

update public.health_erasures set revoked_at = pg_catalog.now() - interval '31 days', scheduled_for = pg_catalog.now() - interval '1 day'
where user_id = tests.user_id('client_e');
select is(public.purge_health_data(tests.user_id('client_e')), true, 'a due erasure runs');
select is(
  (select pg_catalog.count(*)::int from public.measurements where client_id = tests.user_id('client_e'))
    + (select pg_catalog.count(*)::int from public.activity_entries where client_id = tests.user_id('client_e')),
  0,
  'the measurements and the steps are gone'
);
select isnt((select done_at from public.health_erasures where user_id = tests.user_id('client_e')), null, 'the erasure is marked done');
select is(public.purge_health_data(tests.user_id('client_e')), false, 'a done erasure does not run again');

-- F withdraws and gives the consent again within the 30 days: nothing is erased.
select tests.authenticate_as('client_f');
insert into public.consents (user_id, kind, version) values (tests.user_id('client_f'), 'pd_health', '2026-11');
update public.consents set revoked_at = pg_catalog.now()
where user_id = tests.user_id('client_f') and kind = 'pd_health' and revoked_at is null;
insert into public.consents (user_id, kind, version) values (tests.user_id('client_f'), 'pd_health', '2026-11');
select tests.authenticate_as_service_role();
select is_empty(
  $$ select 1 from public.health_erasures where user_id = tests.user_id('client_f') $$,
  'giving the consent again cancels the pending erasure'
);

select * from finish();
rollback;

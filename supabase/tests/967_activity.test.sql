-- Activity (migration 20261017081700_activity.sql, PRD wave-2 §4): steps, water and sleep of the client's day,
-- the shares that hide them from the trainer, and the iOS Shortcuts token (4.1–4.7).
begin;
\ir _helpers.psql
select plan(34);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
update public.user_settings set time_zone = 'UTC' where user_id = tests.user_id('client_c');
select (now() at time zone 'UTC')::date as today \gset

-- =========================================================================================================
-- The client's writes

select tests.authenticate_as_anon();
select throws_ok(format('select public.add_water(%L, 250)', :'today'), '42501', null, 'anon cannot write');

select tests.authenticate_as('client_c');
select lives_ok(format('select public.set_activity(%L, ''steps'', 9000)', :'today'), 'steps: typed for today');
select throws_ok(
  format('select public.set_activity(%L, ''steps'', 1)', :'today'::date + 1), 'P0001', 'bad_day', 'steps: not for tomorrow'
);
select throws_ok(
  format('select public.set_activity(%L, ''steps'', 100001)', :'today'), '23514', null, 'steps: up to 100 000'
);
select throws_ok(
  format('select public.set_activity(%L, ''water'', 250)', :'today'), '22023', null, 'set_activity: not for water'
);
select lives_ok(format('select public.set_activity(%L, ''steps'', 9500)', :'today'), 'steps: typed again');
select is(
  (select array_agg(value) from public.activity_entries where metric = 'steps'), '{9500}'::int[],
  'steps: one manual value a day, the latest'
);
select lives_ok(
  format('select public.set_activity(%L, ''sleep'', 450, 4::smallint)', :'today'), 'sleep: 7:30 with quality 4'
);
select results_eq(
  $$ select value, sleep_quality::int from public.activity_entries where metric = 'sleep' $$,
  $$ values (450, 4) $$,
  'sleep: kept with its quality'
);
select public.add_water(:'today', 250);
select tests.clear_authentication();
update public.activity_entries set recorded_at = now() - interval '1 minute' where metric = 'water';
select tests.authenticate_as('client_c');
select public.add_water(:'today', 500);
select is(
  (select sum(value)::int from public.activity_entries where metric = 'water'), 750, 'water: the day sums its glasses'
);
select is(public.undo_water(:'today'), 500, 'water: undo takes back the latest glass');
select is(
  (select sum(value)::int from public.activity_entries where metric = 'water'), 250, 'water: 250 left'
);
select throws_ok(
  format('insert into public.activity_entries (client_id, local_date, metric, value) values (%L, %L, ''water'', 1)',
         tests.user_id('client_c'), :'today'),
  '42501', null, 'no direct writes'
);

-- =========================================================================================================
-- iOS Shortcuts (4.1–4.6)

select public.issue_ingest_token() as token1 \gset
select ok(:'token1' like 'dft\_%', 'token: issued with its prefix');
select results_eq(
  $$ select count(*)::int, count(*) filter (where revoked_at is null)::int from public.ingest_tokens $$,
  $$ values (1, 1) $$,
  'token: the client sees when it was made'
);
select throws_ok('select token_hash from public.ingest_tokens', '42501', null, 'token: the hash is not readable');
select throws_ok(
  format('select public.ingest_steps(%L, 8500)', :'token1'), '42501', null, 'ingest: only the server route calls it'
);

select tests.clear_authentication();
set local role service_role;
select is(public.ingest_steps(:'token1', 8500), 'ok', 'ingest: steps for today (4.2)');
select is(public.ingest_steps(:'token1', 8700), 'ok', 'ingest: again the same day');
select is(public.ingest_steps(:'token1', 150000), 'too_many_steps', 'ingest: 150 000 refused (4.5)');
select is(public.ingest_steps('dft_wrong', 100), 'bad_token', 'ingest: an unknown token');
select is(public.ingest_steps(:'token1', 100, :'today'::date + 1), 'bad_day', 'ingest: not for tomorrow');
reset role;
select results_eq(
  $$ select source::text, value from public.activity_entries where metric = 'steps' order by source $$,
  $$ values ('ios_shortcut', 8700), ('manual', 9500) $$,
  'ingest: the iOS value is overwritten, the manual one stays (4.2, 4.6)'
);

select tests.authenticate_as('client_c');
select public.issue_ingest_token() as token2 \gset
select tests.clear_authentication();
set local role service_role;
select is(public.ingest_steps(:'token1', 100), 'bad_token', 'token: reissuing revokes the old one at once (4.3)');
select is(public.ingest_steps(:'token2', 9100), 'ok', 'token: the new one works');
reset role;

update public.ingest_tokens set window_start = now(), window_count = 60 where revoked_at is null;
set local role service_role;
select is(public.ingest_steps(:'token2', 9200), 'rate_limited', 'ingest: 60 requests an hour');
reset role;

select tests.authenticate_as('client_c');
select public.revoke_ingest_token();
select tests.clear_authentication();
set local role service_role;
select is(public.ingest_steps(:'token2', 1), 'bad_token', 'token: a revoked token gets nothing (4.3)');
reset role;

-- =========================================================================================================
-- Who sees what (4.7)

select tests.set_share('trainer_a', 'client_c', 'steps', false);
select tests.set_share('trainer_a', 'client_c', 'nutrition', true);
select tests.authenticate_as('trainer_a');
select is(
  (select array_agg(distinct metric::text) from public.activity_entries), '{water}'::text[],
  'trainer: with "питание" and without "шаги" sees only water'
);
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'steps', true);
select tests.set_share('trainer_a', 'client_c', 'nutrition', false);
select tests.authenticate_as('trainer_a');
select is(
  (select array_agg(distinct metric::text order by metric::text) from public.activity_entries), '{sleep,steps}'::text[],
  'trainer: with "шаги" sees steps and sleep, not water'
);
select is((select count(*)::int from public.ingest_tokens), 0, 'trainer: no tokens of the client');
select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.activity_entries), 0, 'stranger: nothing');
select is(public.undo_water(:'today'), 0, 'stranger: undo touches nobody else''s water');

select tests.authenticate_as('client_c');
select lives_ok(format('select public.set_activity(%L, ''steps'', null)', :'today'), 'steps: clearing the typed value');
select is(
  (select array_agg(source::text) from public.activity_entries where metric = 'steps'), '{ios_shortcut}'::text[],
  'steps: the iOS value shows again'
);

select * from finish();
rollback;

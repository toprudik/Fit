-- Separate consents, migration 20261020102047_separate_consents.sql (legal А1, А2): the new kinds, the text hash
-- the user writes with each consent and what it accepts.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_user('client_c');
select tests.create_user('client_d');

select ok(
  array['terms', 'pd_general', 'pd_health', 'age_confirmed']::text[]
    <@ (select pg_catalog.array_agg(e::text) from pg_catalog.unnest(pg_catalog.enum_range(null::public.consent_kind)) e),
  'consent_kind has terms, pd_general, pd_health and age_confirmed'
);

select tests.authenticate_as('client_c');
select results_eq(
  $$ insert into public.consents (user_id, kind, version, text_hash)
     values (tests.user_id('client_c'), 'pd_general', '2026-11', pg_catalog.repeat('ab', 32))
     returning kind::text, version $$,
  $$ values ('pd_general', '2026-11') $$,
  'C gives the personal data consent with the hash of the text shown'
);
select lives_ok(
  $$ insert into public.consents (user_id, kind, version) values (tests.user_id('client_c'), 'age_confirmed', '2026-11') $$,
  'the 18+ statement has no document, so no hash'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version, text_hash)
     values (tests.user_id('client_c'), 'terms', '2026-11', 'not-a-hash') $$,
  '23514', null,
  'a hash that is not 64 hex characters is refused'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version, text_hash)
     values (tests.user_id('client_d'), 'pd_health', '2026-11', pg_catalog.repeat('0', 64)) $$,
  '42501', 'new row violates row-level security policy for table "consents"',
  'C cannot give a consent for D'
);
select throws_ok(
  $$ insert into public.consents (user_id, kind, version) values (tests.user_id('client_c'), 'pd_general', '2026-11') $$,
  '23505', null,
  'a second personal data consent of the same version raises 23505'
);
select throws_ok(
  $$ update public.consents set text_hash = pg_catalog.repeat('cd', 32) where user_id = tests.user_id('client_c') $$,
  '42501', null,
  'the hash cannot be changed afterwards'
);
select is(
  (select pg_catalog.array_agg(kind::text order by kind::text) from public.consents where user_id = tests.user_id('client_c')),
  array['age_confirmed', 'pd_general'],
  'C reads back their consents'
);
select throws_ok(
  $$ select text_hash from public.consents where user_id = tests.user_id('client_c') $$,
  '42501', null,
  'the hash is written but not read back'
);
select tests.clear_authentication();

select * from finish();
rollback;

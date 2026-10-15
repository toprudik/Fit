-- Base migration: domains, immutable helpers and generic trigger functions (contract §1.3 file 1).
begin;
\ir _helpers.psql
select plan(47);

-- Domains. Values go through a table column, as in real writes (an explicit ::char(3) cast would truncate).
create table tests.domain_probe (tz public.iana_tz, cur public.currency_code);

select lives_ok($$ insert into tests.domain_probe (tz) values ('Europe/Moscow') $$, 'iana_tz accepts Europe/Moscow');
select throws_ok($$ insert into tests.domain_probe (tz) values ('Mars/Phobos') $$, '23514', null, 'iana_tz rejects Mars/Phobos');
select throws_ok($$ insert into tests.domain_probe (tz) values ('europe/moscow') $$, '23514', null, 'iana_tz is case-sensitive');
select lives_ok($$ insert into tests.domain_probe (tz) values (null) $$, 'iana_tz lets NULL through like any CHECK');
select throws_ok($$ insert into tests.domain_probe (tz) values ('MSK') $$, '23514', null,
  'iana_tz rejects a zone abbreviation');
select throws_ok($$ insert into tests.domain_probe (tz) values ('UTC+3') $$, '23514', null,
  'iana_tz rejects a POSIX offset');
select is(private.is_valid_tz(null), false, 'is_valid_tz(NULL) is false, not NULL');
select is(
  array(select z.name from pg_catalog.pg_timezone_names z where not private.is_valid_tz(z.name) order by 1),
  '{}'::text[],
  'is_valid_tz knows every zone of pg_timezone_names'
);
-- The check runs on every sign-in and profile write, so it must not scan the zone files (about 17 ms a call):
-- 2000 checks fit easily into the time limit, where the old scan needed more than 30 seconds.
set local statement_timeout = '3s';
select lives_ok(
  $$ select count(*) from generate_series(1, 2000) g where private.is_valid_tz(case when g > 0 then 'Europe/Moscow' end) $$,
  'is_valid_tz is a constant lookup: 2000 checks take well under 3 seconds'
);
set local statement_timeout = 0;

select lives_ok($$ insert into tests.domain_probe (cur) values ('RUB') $$, 'currency_code accepts RUB');
select throws_ok($$ insert into tests.domain_probe (cur) values ('rub') $$, '23514', null, 'currency_code rejects lower case');
select throws_ok($$ insert into tests.domain_probe (cur) values ('RU') $$, '23514', null, 'currency_code rejects two letters');
select throws_ok($$ insert into tests.domain_probe (cur) values ('RUBL') $$, '22001', null, 'currency_code rejects four letters');

-- Reminder offsets.
select is(private.valid_reminder_offsets('{1440,60}'), true, 'offsets {1440,60} are valid');
select is(private.valid_reminder_offsets('{}'), true, 'no offsets is valid');
select is(private.valid_reminder_offsets('{60,60}'), false, 'duplicate offsets are invalid');
select is(private.valid_reminder_offsets('{60,NULL}'), false, 'a NULL offset is invalid');
select is(private.valid_reminder_offsets('{1,60}'), false, 'an offset under 5 minutes is invalid');
select is(private.valid_reminder_offsets('{20000}'), false, 'an offset over 7 days is invalid');
select is(private.valid_reminder_offsets('{5,10,15,20}'), false, 'more than 3 offsets is invalid');
select is(private.valid_reminder_offsets(null), false, 'NULL offsets are invalid, not unknown');

-- PAR-Q.
select is(private.parq_any_yes('{"q1":false,"q2":true}'), true, 'parq_any_yes finds a yes');
select is(private.parq_any_yes('{}'), false, 'parq_any_yes on an empty object is false');
select is(private.parq_any_yes('[]'), false, 'parq_any_yes on an array is false');
select is(private.parq_any_yes('{"q1":"true"}'), false, 'parq_any_yes ignores the string "true"');

-- Mandatory notification types.
select is(private.notification_type_is_optional('contact_request'), false, 'contact_request is mandatory');
select is(private.notification_type_is_optional('booking_created'), true, 'booking_created is optional');

-- Storage paths.
select is(private.all_paths_under('{u/f/1.webp,u/f/2.webp}', 'u/f/'), true, 'paths under the prefix pass');
select is(private.all_paths_under('{}', 'u/f/'), true, 'no paths pass');
select is(private.all_paths_under('{u/f/../g/1.webp}', 'u/f/'), false, 'a path with .. fails');
select is(private.all_paths_under('{v/f/1.webp}', 'u/f/'), false, 'a path outside the prefix fails');

select is(
  (select p.provolatile::text from pg_catalog.pg_proc p where p.oid = 'private.deleted_client_id()'::regprocedure),
  'i',
  'deleted_client_id() is immutable'
);

-- enforce_append_only on throwaway tables: free column, clear-only column (an author FK with set null),
-- cascade deletes.
create table tests.ao_parent (id integer primary key);
create table tests.ao_author (id integer primary key);
create table tests.ao_child (
  id        integer primary key,
  parent_id integer references tests.ao_parent (id) on delete cascade,
  free_col  text,
  fixed_col text,
  clear_col integer references tests.ao_author (id) on delete set null
);
create trigger ao_child_append_only
  before update or delete on tests.ao_child
  for each row execute function private.enforce_append_only('{free_col}', '{clear_col}', 'true');
insert into tests.ao_parent values (1), (2);
insert into tests.ao_author values (1), (2), (3);
insert into tests.ao_child values (1, 1, 'a', 'a', 1), (2, 2, 'b', 'b', 2);

select lives_ok($$ update tests.ao_child set free_col = 'changed' where id = 1 $$, 'append-only: a free column may change');
select throws_ok($$ update tests.ao_child set fixed_col = 'changed' where id = 1 $$, 'P0001', 'append_only',
  'append-only: any other column may not change');
select throws_ok($$ update tests.ao_child set clear_col = 3 where id = 1 $$, 'P0001', 'append_only',
  'append-only: a clear-only column may not get a new value');
select throws_ok($$ update tests.ao_child set clear_col = null where id = 1 $$, 'P0001', 'append_only',
  'append-only: a clear-only column is not cleared directly, not even by the owner');
select lives_ok($$ delete from tests.ao_author where id = 1 $$, 'append-only: deleting the author clears the column (FK set null)');
select is((select clear_col from tests.ao_child where id = 1), null::integer, 'append-only: the set-null cleared it');
select throws_ok($$ delete from tests.ao_child where id = 1 $$, 'P0001', 'append_only', 'append-only: a direct delete raises');
select lives_ok($$ delete from tests.ao_parent where id = 2 $$, 'append-only: a cascade delete passes');
select is((select count(*)::integer from tests.ao_child where id = 2), 0, 'append-only: the cascade removed the row');

create trigger ao_child_no_truncate
  before truncate on tests.ao_child
  for each statement execute function private.forbid_truncate();
select throws_ok($$ truncate tests.ao_child $$, 'P0001', 'append_only', 'forbid_truncate blocks truncate');

-- stamp_actor: a signed-in insert is stamped with auth.uid(); service_role keeps the value it sent.
select tests.create_user('stamp_user');
select tests.create_user('other_user');
create table tests.stamp_probe (id integer primary key, actor uuid);
create trigger stamp_probe_stamp_actor
  before insert on tests.stamp_probe
  for each row execute function private.stamp_actor('actor');
grant select, insert on tests.stamp_probe to authenticated, service_role;

select tests.authenticate_as('stamp_user');
select lives_ok(
  format('insert into tests.stamp_probe values (1, %L)', tests.user_id('other_user')),
  'a signed-in user inserts with someone else''s id'
);
select tests.authenticate_as_service_role();
select lives_ok(
  format('insert into tests.stamp_probe values (2, %L)', tests.user_id('other_user')),
  'service_role inserts with a chosen id'
);
select tests.clear_authentication();

select is((select actor from tests.stamp_probe where id = 1), tests.user_id('stamp_user'), 'stamp_actor writes auth.uid()');
select is((select actor from tests.stamp_probe where id = 2), tests.user_id('other_user'), 'stamp_actor keeps the value without a JWT');

-- set_claims keeps the role and sets auth.uid().
select tests.set_claims('stamp_user');
select is(current_user::text || ' ' || auth.uid()::text, 'postgres ' || tests.user_id('stamp_user')::text,
  'set_claims sets auth.uid() and keeps role postgres');
select tests.clear_authentication();

select * from finish();
rollback;

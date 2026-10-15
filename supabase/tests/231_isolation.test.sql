-- The triggers that lock a parent row and then count (seats, pass balance, certificates, Free clients) are
-- correct only in READ COMMITTED or SERIALIZABLE. Under REPEATABLE READ the count after the lock still uses the
-- transaction's old snapshot, so two writers could both pass: an overbooked session, an overdrawn pass. Such a
-- transaction is refused with unsupported_isolation. PostgREST, RPCs and pg_cron run in READ COMMITTED.
-- This whole file runs in REPEATABLE READ; fixtures avoid the four guarded writes.
begin isolation level repeatable read;
\ir _helpers.psql
select plan(5);

select is(current_setting('transaction_isolation'), 'repeatable read', 'this file runs in repeatable read');

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
insert into tests.ids values
  ('pair', tests.pair_id('trainer_a', 'client_c')),
  ('session', tests.create_session('trainer_a', now() + interval '1 day', 'group', 5));
insert into public.passes (id, coaching_id, title, sessions_total, price_minor, currency, starts_on)
values (gen_random_uuid(), tests.i('pair'), 'Five', 5, 0, 'RUB', current_date);
insert into tests.ids select 'pass', id from public.passes where title = 'Five';

select throws_ok(
  $$ select tests.create_booking(tests.i('session'), 'trainer_a', 'client_c') $$,
  'P0001', 'unsupported_isolation', 'a booking that takes a seat is refused under repeatable read'
);
select throws_ok(
  $$ insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, occurred_at)
     values (tests.i('pair'), 'grant', tests.i('pass'), 5, now()) $$,
  'P0001', 'unsupported_isolation', 'a ledger row is refused under repeatable read'
);
select throws_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.user_id('trainer_a'), 'Diploma', tests.user_id('trainer_a')::text || '/diploma.pdf') $$,
  'P0001', 'unsupported_isolation', 'a certificate is refused under repeatable read'
);
select throws_ok(
  $$ select private.assert_can_add_client(tests.user_id('trainer_a')) $$,
  'P0001', 'unsupported_isolation', 'the Free client limit check is refused under repeatable read'
);

select * from finish();
rollback;

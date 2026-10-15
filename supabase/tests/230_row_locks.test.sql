-- Row locks of the invariant triggers that serialize parallel writers (bookings capacity, ledger validation,
-- the certificate cap and the Free client limit). By the time an AFTER trigger runs, the foreign key check
-- already holds FOR KEY SHARE on the parent row; FOR UPDATE conflicts with KEY SHARE, so two parallel writers
-- deadlocked instead of waiting for each other. FOR NO KEY UPDATE conflicts with itself and with UPDATE (so
-- the writers still serialize) but not with KEY SHARE. pgrowlocks shows the mode each trigger left behind.
begin;
\ir _helpers.psql
create extension if not exists pgrowlocks with schema extensions;
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
-- Lock modes held on one row of a table, as pgrowlocks reports them.
create function tests.row_lock_modes(p_table regclass, p_id_column text, p_id uuid) returns text[]
language plpgsql set search_path = '' as $$
declare
  v_modes text[];
begin
  execute format(
    'select r.modes from extensions.pgrowlocks(%L) r join %s t on t.ctid = r.locked_row where t.%I = $1',
    p_table::text, p_table, p_id_column)
  into v_modes using p_id;
  return v_modes;
end $$;

insert into tests.ids values
  ('session', tests.create_session('trainer_a', now() - interval '1 day', 'group', 5)),
  ('pass', tests.create_pass('trainer_a', 'client_c', 5));
insert into tests.ids values ('booking', tests.create_booking(tests.i('session'), 'trainer_a', 'client_c', 'attended'));
select is(
  tests.row_lock_modes('public.sessions', 'id', tests.i('session')), array['For No Key Update'],
  'bookings_check_capacity locks the session FOR NO KEY UPDATE, which does not conflict with FK KEY SHARE'
);

insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, sessions_delta, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_c'), 'charge', tests.i('pass'), tests.i('booking'), -1, 'attended',
        (select starts_at from public.sessions where id = tests.i('session')));
select is(
  tests.row_lock_modes('public.passes', 'id', tests.i('pass')), array['For No Key Update'],
  'ledger_entries_validate locks the pass FOR NO KEY UPDATE'
);

insert into public.trainer_certificates (trainer_id, title, storage_path)
values (tests.user_id('trainer_a'), 'Diploma', tests.user_id('trainer_a')::text || '/diploma.pdf');
select is(
  tests.row_lock_modes('public.trainer_profiles', 'user_id', tests.user_id('trainer_a')), array['For No Key Update'],
  'trainer_certificates_limit locks the trainer profile FOR NO KEY UPDATE'
);

select tests.create_trainer('trainer_b');
select private.assert_can_add_client(tests.user_id('trainer_b'));
select is(
  tests.row_lock_modes('public.trainer_profiles', 'user_id', tests.user_id('trainer_b')), array['For No Key Update'],
  'assert_can_add_client locks the trainer profile FOR NO KEY UPDATE'
);

select * from finish();
rollback;

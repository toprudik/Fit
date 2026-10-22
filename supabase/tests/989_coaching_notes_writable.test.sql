-- Migration 20261022043117_coaching_notes_writable.sql (QA B9): whether the caller can add a note to a pair now.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('owner_a');
select tests.create_trainer('helper_h');
select tests.create_trainer('stranger_t');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('helper_h'));

create table tests.invites (name text primary key, token text not null);
grant select, insert on tests.invites to authenticated;
create table tests.pair (id uuid);
grant select on tests.pair to authenticated;
insert into tests.pair select tests.pair_id('owner_a', 'client_c');
select tests.authenticate_as('owner_a');
insert into tests.invites select 'a', token from public.create_delegation('assistant', null, '{notes}', true);
select tests.authenticate_as('helper_h');
select public.accept_delegation((select token from tests.invites where name = 'a'));

select is(public.coaching_notes_writable((select id from tests.pair)), false,
  'B9: the assistant can''t write while the owner has not accepted the agreement');
select tests.authenticate_as('owner_a');
select is(public.coaching_notes_writable((select id from tests.pair)), false, 'nor can the owner');

select tests.clear_authentication();
insert into public.consents (user_id, kind, version) values (tests.user_id('owner_a'), 'trainer_dpa', '2026-10-18');
select tests.authenticate_as('helper_h');
select is(public.coaching_notes_writable((select id from tests.pair)), true, 'after the agreement the assistant can write');
select tests.authenticate_as('stranger_t');
select is(public.coaching_notes_writable((select id from tests.pair)), false, 'another trainer can''t');

select tests.authenticate_as('owner_a');
select public.revoke_delegation((select id from public.delegations where kind = 'assistant'));
select tests.authenticate_as('helper_h');
select is(public.coaching_notes_writable((select id from tests.pair)), false, 'B9: a revoked assistant can''t');

select tests.clear_authentication();
set local role anon;
select throws_ok($$ select public.coaching_notes_writable(gen_random_uuid()) $$, '42501', null, 'anon can''t call it');

select * from finish();
rollback;

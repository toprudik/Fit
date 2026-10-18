-- The data processing agreement for trainers, migration 20261020104113_trainer_dpa.sql: no client card without an
-- account and no note before the pair's trainer accepts it; an assistant writes notes under the trainer's acceptance.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_trainer('assistant_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.grant_plan('trainer_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('trainer_a'), tests.user_id('assistant_x'));

create table tests.invites (token text not null);
grant select, insert on tests.invites to authenticated;
select tests.authenticate_as('trainer_a');
insert into tests.invites select token from public.create_delegation('assistant', null, '{notes}', true);
select tests.authenticate_as('assistant_x');
select public.accept_delegation((select token from tests.invites));
select tests.clear_authentication();

create table tests.pair as select tests.pair_id('trainer_a', 'client_c') as id;
grant select on tests.pair to authenticated;

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.create_managed_client('Аня') $$, 'P0001', 'dpa_required',
  'no card without an account before the agreement');
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body)
     values ((select id from tests.pair), tests.user_id('trainer_a'), 'Колено') $$,
  '42501', null, 'no note before the agreement');
select is((select count(*)::integer from public.profiles where managed_by_trainer_id = tests.user_id('trainer_a')), 0,
  'the refused card left nothing behind');

select tests.authenticate_as('assistant_x');
select throws_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body)
     values ((select id from tests.pair), tests.user_id('assistant_x'), 'Колено') $$,
  '42501', null, 'nor from the assistant while the trainer has not accepted');

select tests.authenticate_as('trainer_a');
select lives_ok($$ insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18') $$,
  'the trainer accepts the agreement');
select isnt(public.create_managed_client('Аня'), null, 'then adds a card');
select lives_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body)
     values ((select id from tests.pair), tests.user_id('trainer_a'), 'Колено') $$,
  'and writes notes');

select tests.authenticate_as('assistant_x');
select lives_ok(
  $$ insert into public.coaching_notes (coaching_id, author_id, body)
     values ((select id from tests.pair), tests.user_id('assistant_x'), 'Плечо') $$,
  'the assistant writes notes under the trainer''s acceptance');

select tests.authenticate_as('trainer_a');
update public.consents set revoked_at = now() where kind = 'trainer_dpa';
select throws_ok($$ select public.create_managed_client('Борис') $$, 'P0001', 'dpa_required',
  'a revoked agreement closes cards again');

select * from finish();
rollback;

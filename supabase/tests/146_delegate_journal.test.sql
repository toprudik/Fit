-- Migration 20261017131427_delegate_journal.sql (PRD wave-3 §1 rule 8, 1.9): the owner's journal lists the notes,
-- homework and personal sessions a delegate made or cancelled, for one pair or all of them.
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
select tests.authenticate_as('owner_a');
insert into tests.invites select 'a', token from public.create_delegation('assistant', null, '{schedule,notes,homework}', true);
-- The owner's own homework does not show. Homework is written by functions only: the inserts below keep the
-- caller's claims and drop the role, as save_homework does.
reset role;
insert into public.homework (coaching_id, title, due_date) values (tests.pair_id('owner_a', 'client_c'), 'Owner plank', current_date + 1);
select tests.authenticate_as('owner_a');
select tests.authenticate_as('helper_h');
select public.accept_delegation((select token from tests.invites where name = 'a'));
select public.cancel_session(
  (select session_id from public.create_session(tests.pair_id('owner_a', 'client_c'),
     date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline')),
  'Перенос');
reset role;
insert into public.homework (coaching_id, title, due_date) values (tests.pair_id('owner_a', 'client_c'), 'Plank', current_date + 1);
select tests.clear_authentication();
insert into public.coaching_notes (coaching_id, author_id, body)
values (tests.pair_id('owner_a', 'client_c'), tests.user_id('helper_h'), 'Колено лучше');

select is((select created_by from public.homework where title = 'Plank'), tests.user_id('helper_h'),
  'homework records who assigned it');

select tests.authenticate_as('owner_a');
select set_eq($$ select action from public.delegate_journal() $$,
  $$ values ('session:created'), ('session:cancelled'), ('booking:cancelled'), ('note'), ('homework') $$,
  '1.9: the journal lists the delegate''s sessions, bookings, note and homework, not the owner''s own');
select is((select count(*)::int from public.delegate_journal() where delegate_name is null or owner_name is null), 0,
  '1.9: every entry names both trainers');
select is((select count(*)::int from public.delegate_journal(tests.pair_id('owner_a', 'client_c'))), 5,
  'the journal of one pair');

select tests.authenticate_as('helper_h');
select is((select count(*)::int from public.delegate_journal()), 0, 'the delegate does not read the owner''s journal');
select tests.clear_authentication();
create table tests.pair (id uuid);
grant select on tests.pair to authenticated;
insert into tests.pair select tests.pair_id('owner_a', 'client_c');
select tests.authenticate_as('stranger_t');
select is((select count(*)::int from public.delegate_journal((select id from tests.pair))), 0,
  'another trainer reads nothing');

select * from finish();
rollback;

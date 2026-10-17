-- delegated_session of migration 20261017101423_delegated_session.sql (PRD wave-3 §1): the substitute reads its
-- session with the participants' names until the session ends; other trainers read nothing.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_trainer('other_o');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now() where user_id = tests.user_id('sub_s');

create table tests.ids (name text primary key, id uuid not null, token text);
grant select, insert on tests.ids to authenticated;
insert into tests.ids (name, id) values ('session', tests.create_session('owner_a', date_trunc('hour', now()) + interval '1 day'));
select tests.create_booking((select id from tests.ids where name = 'session'), 'owner_a', 'client_c');

select tests.authenticate_as('other_o');
select is((select count(*)::int from public.delegated_session((select id from tests.ids where name = 'session'))), 0,
  'another trainer reads nothing');

select tests.authenticate_as('owner_a');
insert into tests.ids select 'delegation', delegation_id, token
from public.create_delegation('substitute', (select id from tests.ids where name = 'session'));
select is((select jsonb_array_length(participants) from public.delegated_session((select id from tests.ids where name = 'session'))), 1,
  'the owner reads the session with its participant');

select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.delegated_session((select id from tests.ids where name = 'session'))), 0,
  'before acceptance the substitute reads nothing');
select public.accept_delegation((select token from tests.ids where name = 'delegation'));
select is((select participants->0->>'name' from public.delegated_session((select id from tests.ids where name = 'session'))), 'client_c',
  'the substitute reads the participant''s name');

select tests.clear_authentication();
update public.sessions set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
where id = (select id from tests.ids where name = 'session');
select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.delegated_session((select id from tests.ids where name = 'session'))), 0,
  '1.5: after the session the substitute reads nothing');

select * from finish();
rollback;

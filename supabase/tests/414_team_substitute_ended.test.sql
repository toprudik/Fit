-- «Команда» shows a substitute as ended once nobody can take it or its session was cancelled
-- (20261103123617_team_substitute_ended.sql, QA bug 34).
begin;
\ir _helpers.psql
select plan(1);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');

create table tests.ids (name text primary key, id uuid not null);
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('s_started', tests.create_session('trainer_a', now() - interval '10 minutes')),
  ('s_ahead', tests.create_session('trainer_a', now() + interval '1 day')),
  ('s_cancelled', tests.create_session('trainer_a', now() + interval '2 days'));
update public.sessions set status = 'cancelled', cancelled_at = now() where id = tests.i('s_cancelled');

insert into public.delegations (owner_trainer_id, kind, session_id, scopes, created_at) values
  (tests.user_id('trainer_a'), 'substitute', tests.i('s_started'), '{schedule}', now() - interval '4 minutes'),
  (tests.user_id('trainer_a'), 'substitute', tests.i('s_ahead'), '{schedule}', now() - interval '3 minutes');
insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, status, accepted_at, created_at) values
  (tests.user_id('trainer_a'), tests.user_id('trainer_b'), 'substitute', tests.i('s_cancelled'), '{schedule}', 'active', now(), now() - interval '2 minutes'),
  (tests.user_id('trainer_a'), tests.user_id('trainer_b'), 'substitute', tests.i('s_started'), '{schedule}', 'active', now(), now() - interval '1 minute');

select tests.authenticate_as('trainer_a');
select is(
  array(select x.status::text from public.my_delegations() x order by x.created_at),
  array['expired', 'pending', 'expired', 'active'],
  'my_delegations: a pending substitute of a started session and an accepted one of a cancelled session are ended');
select tests.clear_authentication();

select * from finish();
rollback;

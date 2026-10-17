-- Declining a delegation invite, migration 20261017205611_decline_delegation_check.sql (PRD wave-3 §1 rule 2): the
-- invited trainer says no, the invite is closed and the owner is told.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('sub_s'));

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;
create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
insert into tests.ids values ('session', tests.create_session('owner_a', date_trunc('hour', now()) + interval '1 day', 'group', 4));

select tests.authenticate_as('owner_a');
insert into tests.tokens select 'sub', token
from public.create_delegation('substitute', (select id from tests.ids where name = 'session'));

select tests.authenticate_as('sub_s');
select lives_ok($$ select public.decline_delegation((select token from tests.tokens where name = 'sub')) $$,
  'the invited trainer declines');
select throws_ok($$ select public.accept_delegation((select token from tests.tokens where name = 'sub')) $$,
  'P0002', 'invite_not_found', 'a declined link no longer works');

select tests.clear_authentication();
select results_eq($$ select status::text, delegate_trainer_id from public.delegations $$,
  $$ values ('declined', null::uuid) $$, 'the invite is declined and has no delegate');
select is((select count(*)::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'declined' and user_id = tests.user_id('owner_a')), 1,
  'the owner is told');

select tests.authenticate_as('owner_a');
select lives_ok($$ select * from public.create_delegation('substitute', (select id from tests.ids where name = 'session')) $$,
  'the owner can ask someone else for the same session');

select * from finish();
rollback;

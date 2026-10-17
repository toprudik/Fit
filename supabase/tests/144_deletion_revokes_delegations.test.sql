-- Migration 20261017120713_deletion_revokes_delegations.sql: a deletion request revokes the delegations the
-- trainer gave and took, and frees the session it was to run.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('owner_a');
select tests.create_trainer('owner_b');
select tests.create_trainer('helper_h');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.create_pair('owner_b', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
select tests.grant_plan('owner_b', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('owner_b'), tests.user_id('helper_h'));

create table tests.invites (name text primary key, token text not null);
grant select, insert on tests.invites to authenticated;
create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
insert into tests.ids values ('session', tests.create_session('owner_b', date_trunc('hour', now()) + interval '2 days', 'group', 4));
select tests.create_booking((select id from tests.ids where name = 'session'), 'owner_b', 'client_c');

select tests.authenticate_as('owner_a');
insert into tests.invites select 'assistant', token from public.create_delegation('assistant', null, '{schedule}', true);
insert into tests.invites select 'pending', token from public.create_delegation('assistant', null, '{notes}', true);
select tests.authenticate_as('owner_b');
insert into tests.invites select 'sub', token
from public.create_delegation('substitute', (select id from tests.ids where name = 'session'));
select tests.authenticate_as('helper_h');
select public.accept_delegation((select token from tests.invites where name = 'assistant'));
select public.accept_delegation((select token from tests.invites where name = 'sub'));
select tests.clear_authentication();
select is((select count(*)::int from public.delegations where status = 'active'), 2, 'two delegations are live');

-- An invite nobody accepted can be revoked.
select tests.authenticate_as('owner_b');
insert into tests.invites select 'unused', token from public.create_delegation('assistant', null, '{notes}', true);
select ok(public.revoke_delegation((select id from public.delegations
                                    where owner_trainer_id = tests.user_id('owner_b') and delegate_trainer_id is null)),
  'the owner revokes an invite nobody accepted');

-- The owner asks to delete: what it gave ends, the other owner's stays.
select tests.authenticate_as('owner_a');
select public.request_account_deletion();
select tests.clear_authentication();
select is((select count(*)::int from public.delegations where owner_trainer_id = tests.user_id('owner_a') and status = 'revoked'), 2,
  'a deleting owner''s delegations are revoked, accepted or not');
select is((select status::text from public.delegations where owner_trainer_id = tests.user_id('owner_b') and kind = 'substitute'), 'active',
  'other owners'' delegations stay');

-- The delegate asks to delete: what it took ends and the session is free again.
select tests.authenticate_as('helper_h');
select public.request_account_deletion();
select tests.clear_authentication();
select is((select status::text from public.delegations where owner_trainer_id = tests.user_id('owner_b') and kind = 'substitute'), 'revoked',
  'a deleting delegate''s delegations are revoked');
select is((select conducted_by from public.sessions where id = (select id from tests.ids where name = 'session')), null,
  'the session no longer names the deleting substitute');
select tests.authenticate_as('helper_h');
select is((select count(*)::int from public.bookings where session_id = (select id from tests.ids where name = 'session')), 0,
  'the deleting delegate reads nothing of the session');

select * from finish();
rollback;

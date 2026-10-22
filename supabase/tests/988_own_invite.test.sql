-- Migration 20261022214917_own_invite.sql (QA 22.10): delegation_invite says whether the caller made the invite.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('owner_a');
select tests.create_trainer('helper_h');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('helper_h'));

create table tests.invites (token text not null);
grant select, insert on tests.invites to authenticated;
select tests.authenticate_as('owner_a');
insert into tests.invites select token from public.create_delegation('assistant', null, '{notes}', true);

select is((select own from public.delegation_invite((select token from tests.invites))), true,
  'the trainer who made the invite sees it as their own');
select tests.authenticate_as('helper_h');
select is((select own from public.delegation_invite((select token from tests.invites))), false,
  'the invited trainer sees it as an offer');
select is((select kind::text from public.delegation_invite((select token from tests.invites))), 'assistant',
  'the rest of the invite is as before');

select * from finish();
rollback;

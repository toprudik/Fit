-- Invite a delegate by search (migration 20261017175137_delegate_search.sql, PRD wave-3 §1 rule 1): the owner finds
-- a verified trainer among their contacts and sends them the invite by the bot; the invite works like the link.
begin;
\ir _helpers.psql
select plan(18);

select tests.create_trainer('owner_a');
select tests.create_trainer('colleague_b');
select tests.create_trainer('hidden_h');
select tests.create_trainer('partner_p');
select tests.create_trainer('novice_n');
select tests.create_trainer('blocked_x');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('colleague_b'), tests.user_id('hidden_h'),
                  tests.user_id('partner_p'), tests.user_id('blocked_x'));
update public.trainer_profiles set is_public = false where user_id in (tests.user_id('hidden_h'), tests.user_id('partner_p'));
update public.profiles set first_name = 'Ольга', last_name = 'Тренерова', username = 'olga_fit' where id = tests.user_id('colleague_b');
update public.profiles set first_name = 'Ольга', last_name = 'Скрытная' where id = tests.user_id('hidden_h');
update public.profiles set first_name = 'Ольга', last_name = 'Напарница' where id = tests.user_id('partner_p');
update public.profiles set first_name = 'Ольга', last_name = 'Новенькая' where id = tests.user_id('novice_n');
update public.profiles set first_name = 'Ольга', last_name = 'Заблокированная', blocked_at = now(), blocked_reason = 'spam' where id = tests.user_id('blocked_x');
-- partner_p once had owner_a as a substitute: a contact even with a closed showcase.
insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, scopes, status, accepted_at, revoked_at)
values (tests.user_id('partner_p'), tests.user_id('owner_a'), 'assistant', '{schedule}', 'revoked', now() - interval '2 days', now() - interval '1 day');

create table tests.vals (name text primary key, val text not null);
grant select, insert on tests.vals to authenticated;
create function tests.val(p_name text) returns text language sql stable set search_path = '' as $$
  select val from tests.vals where name = p_name
$$;

-- Search ------------------------------------------------------------------------------------------------------
select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.search_delegate_trainers('Ольга') $$, '42501', 'forbidden', 'only a trainer searches');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.search_delegate_trainers('Ольга') $$, '42501', null, 'anon cannot search');

select tests.authenticate_as('owner_a');
select is((select count(*)::int from public.search_delegate_trainers('О')), 0, 'one character finds nobody');
select results_eq(
  $$ select name from public.search_delegate_trainers('ольга') $$,
  $$ values ('Ольга Напарница'::text), ('Ольга Тренерова'::text) $$,
  'verified contacts only: a public showcase or a past delegation; not hidden, unverified or blocked trainers');
select results_eq(
  $$ select trainer_id, username from public.search_delegate_trainers('@olga_') $$,
  $$ values (tests.user_id('colleague_b'), 'olga_fit'::text) $$,
  'by @username');
select results_eq(
  $$ select name from public.search_delegate_trainers('Тренерова Ольга') $$,
  $$ values ('Ольга Тренерова'::text) $$,
  'by last name first');
select is((select count(*)::int from public.search_delegate_trainers('%%')), 0, 'wildcards are taken as text');
select tests.authenticate_as('colleague_b');
select is((select count(*)::int from public.search_delegate_trainers('Тренерова')), 0, 'a trainer does not find themselves');

-- Invite ------------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner_a');
insert into tests.vals select 'delegation', delegation_id::text from public.create_delegation('assistant', p_scopes => '{schedule}', p_all_clients => true);
select throws_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('hidden_h')),
  'P0002', 'trainer_not_found', 'a trainer outside the contacts cannot be invited');
select throws_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('novice_n')),
  'P0002', 'trainer_not_found', 'an unverified trainer cannot be invited');
select tests.authenticate_as('colleague_b');
select throws_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('colleague_b')),
  'P0002', 'not_found', 'only the owner sends their delegation');
select tests.authenticate_as('owner_a');
select lives_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('colleague_b')),
  'the owner invites a colleague found by search');
select tests.clear_authentication();

select results_eq(
  $$ select user_id, payload ->> 'event', payload ->> 'delegation_id', payload ->> 'owner_name'
     from public.notification_outbox where type = 'delegation' $$,
  format($$ values (%L::uuid, 'invited'::text, %L::text, 'owner_a'::text) $$, tests.user_id('colleague_b'), tests.val('delegation')),
  'the colleague gets the invite by the bot');
select is((select invited_trainer_id from public.delegations where id = tests.val('delegation')::uuid), tests.user_id('colleague_b'),
  'the delegation remembers whom it was sent to');
insert into tests.vals select 'token', payload ->> 'token' from public.notification_outbox where type = 'delegation';

-- A second invite replaces the token: the first one stops working.
select tests.authenticate_as('owner_a');
select lives_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('partner_p')),
  'the owner can send it to someone else instead');
select tests.clear_authentication();
insert into tests.vals select 'token_p', payload ->> 'token' from public.notification_outbox
where type = 'delegation' and user_id = tests.user_id('partner_p');

select tests.authenticate_as('colleague_b');
select throws_ok(format('select public.accept_delegation(%L)', tests.val('token')),
  'P0002', 'invite_not_found', 'the replaced invite no longer opens');
select tests.authenticate_as('partner_p');
select lives_ok(format('select public.accept_delegation(%L)', tests.val('token_p')), 'the invited trainer accepts');
select tests.authenticate_as('owner_a');
select throws_ok(format('select public.invite_delegate(%L, %L)', tests.val('delegation'), tests.user_id('colleague_b')),
  'P0001', 'not_pending', 'an accepted delegation is not sent again');
select tests.clear_authentication();

select * from finish();
rollback;

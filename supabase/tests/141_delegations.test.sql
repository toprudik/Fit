-- Delegation of migration 20261017090713_delegations.sql (PRD wave-3 §1, criteria 1.1-1.10): a substitute for
-- one session and an assistant for chosen clients, both acting only within what the owner delegated.
begin;
\ir _helpers.psql
select plan(31);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_trainer('helper_h');
select tests.create_trainer('unverified_u');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('owner_a', 'client_c');
select tests.create_pair('owner_a', 'client_d');
select tests.set_share('owner_a', 'client_c', 'measurements', true);
select tests.set_share('owner_a', 'client_d', 'measurements', false);
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('sub_s'), tests.user_id('helper_h'));

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.token(p_name text) returns text language sql stable set search_path = '' as $$
  select token from tests.tokens where name = p_name
$$;

insert into tests.ids values ('pair_c', tests.pair_id('owner_a', 'client_c')), ('pair_d', tests.pair_id('owner_a', 'client_d'));
insert into tests.ids values ('pass_c', tests.create_pass('owner_a', 'client_c', 5, 500000));
insert into tests.ids values ('session', tests.create_session('owner_a', date_trunc('hour', now()) + interval '1 day', 'group', 4));
insert into tests.ids values ('b_c', tests.create_booking(tests.id('session'), 'owner_a', 'client_c'));
insert into tests.ids values ('b_d', tests.create_booking(tests.id('session'), 'owner_a', 'client_d'));
insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
select tests.user_id(c), 'weight', 70, now(), current_date, tests.user_id(c) from unnest(array['client_c', 'client_d']) c;

-- Gates -------------------------------------------------------------------------------------------------------

select tests.authenticate_as('sub_s');
select throws_ok(format($$ select * from public.create_delegation('substitute', %L) $$, tests.id('session')),
  'P0001', 'plan_required', 'a trainer without trainer.delegation cannot delegate');

select tests.authenticate_as('owner_a');
select throws_ok($$ select * from public.create_delegation('substitute', gen_random_uuid()) $$,
  'P0001', 'session_not_found', 'a substitute needs a future session of the owner');
select throws_ok($$ select * from public.create_delegation('assistant', null, '{passes,payments}', true) $$,
  '22023', 'invalid_scopes', 'passes and payments are never delegated');
insert into tests.tokens select 'sub', token from public.create_delegation('substitute', tests.id('session'));
select throws_ok(format($$ select * from public.create_delegation('substitute', %L) $$, tests.id('session')),
  'P0001', 'already_delegated', 'one live substitute per session');

-- 1.10: an unverified trainer cannot accept.
select tests.authenticate_as('unverified_u');
select throws_ok(format($$ select public.accept_delegation(%L) $$, tests.token('sub')), 'P0001', 'not_verified',
  '1.10: an unverified trainer cannot become a delegate');
select tests.authenticate_as('owner_a');
select throws_ok(format($$ select public.accept_delegation(%L) $$, tests.token('sub')), 'P0001', 'own_delegation',
  'the owner cannot accept their own invite');

-- Before acceptance the substitute has no access.
select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.bookings where session_id = tests.id('session')), 0,
  'before acceptance the substitute sees no bookings');
select results_eq(format($$ select kind::text, owner_name from public.delegation_invite(%L) $$, tests.token('sub')),
  $$ values ('substitute', 'owner_a') $$,
  'the invite shows the kind and the owner');

-- 1.1: acceptance, conducted_by and the participants' message.
select ok(public.accept_delegation(tests.token('sub')) is not null, '1.1: the substitute accepts');
select throws_ok(format($$ select public.accept_delegation(%L) $$, tests.token('sub')), 'P0002', 'invite_not_found',
  'the link works once');
select is((select count(*)::int from public.bookings where session_id = tests.id('session')), 2,
  'the substitute sees the session''s bookings');
select tests.clear_authentication();
select is((select conducted_by from public.sessions where id = tests.id('session')), tests.user_id('sub_s'),
  '1.1: the session names the substitute');
select is((select count(*)::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'substitute'
             and user_id in (tests.user_id('client_c'), tests.user_id('client_d'))), 2,
  '1.1: both participants are told who runs the session');
select ok((select payload->>'delegate_name' from public.notification_outbox
           where type = 'delegation' and user_id = tests.user_id('client_c') limit 1) is not null,
  '1.1: the message carries the substitute''s name');

-- 1.3: no money for a delegate, in tables and RPCs.
select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.passes), 0, '1.3: the substitute sees no passes');
select is((select count(*)::int from public.payments), 0, '1.3: the substitute sees no payments');
select is((select count(*)::int from public.ledger_entries), 0, '1.3: the substitute sees no ledger rows');
select is((select count(*)::int from public.pass_balances), 0, '1.3: the substitute sees no balances');
select throws_ok(format($$ select public.create_pass(%L, null, 'Pass', 5, 100000) $$, tests.id('pair_c')),
  null, null, '1.3: the substitute cannot sell a pass');

-- 1.4: the client cancels two hours before without a charge.
select tests.clear_authentication();
update public.sessions set starts_at = now() + interval '2 hours', ends_at = now() + interval '3 hours'
where id = tests.id('session');
select tests.authenticate_as('client_d');
select public.cancel_my_booking(tests.id('b_d'));
select is((select status::text from public.bookings where id = tests.id('b_d')), 'cancelled',
  '1.4: the cancellation two hours before a substituted session is free');
select tests.clear_authentication();
select is((select count(*)::int from public.ledger_entries where booking_id = tests.id('b_d')), 0,
  '1.4: nothing is charged');

-- 1.2: the substitute marks a no-show and the owner's pass is charged by the owner's rules.
update public.sessions set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes'
where id = tests.id('session');
select tests.authenticate_as('sub_s');
select is(public.mark_attendance(tests.id('b_c'), 'no_show')::text, 'no_show', '1.2: the substitute marks a no-show');
select tests.clear_authentication();
select is((select count(*)::int from public.ledger_entries
           where booking_id = tests.id('b_c') and entry_type = 'charge' and pass_id = tests.id('pass_c')), 1,
  '1.2: the session is charged to the owner''s pass');

-- 1.9: the journal names both.
select tests.authenticate_as('owner_a');
select results_eq(format($$ select action, delegate_name is not null, owner_name is not null from public.delegate_journal(%L) $$,
                         tests.id('pair_c')),
  $$ values ('booking:no_show', true, true) $$, '1.9: the owner''s journal shows the delegate''s action with both names');

-- 1.5: after the session the substitute loses access.
select tests.clear_authentication();
update public.sessions set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
where id = tests.id('session');
select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.bookings where session_id = tests.id('session')), 0,
  '1.5: after the session the substitute sees nothing of it');

-- 1.6: an assistant with progress sees shared measurements only.
select tests.authenticate_as('owner_a');
insert into tests.tokens select 'helper', token
from public.create_delegation('assistant', null, '{progress,workouts}', true);
select tests.authenticate_as('helper_h');
select public.accept_delegation(tests.token('helper'));
select is((select count(*)::int from public.measurements where client_id = tests.user_id('client_c')), 1,
  '1.6: the assistant sees measurements the client shares with the owner');
select is((select count(*)::int from public.measurements where client_id = tests.user_id('client_d')), 0,
  '1.6: and not those the client keeps from the owner');

-- 1.7: the client switches assistants off.
select tests.authenticate_as('client_c');
select ok(public.set_assistant_progress(tests.id('pair_c'), false), '1.7: the client switches the assistant off');
select tests.authenticate_as('helper_h');
select is((select count(*)::int from public.measurements where client_id = tests.user_id('client_c')), 0,
  '1.7: the assistant stops seeing the measurements at once');
select tests.authenticate_as('client_c');
select public.set_assistant_progress(tests.id('pair_c'), true);

-- 1.8: revocation ends access at once.
select tests.authenticate_as('owner_a');
select ok(public.revoke_delegation((select id from public.delegations where kind = 'assistant')), '1.8: the owner revokes');
select tests.authenticate_as('helper_h');
select is((select count(*)::int from public.measurements where client_id = tests.user_id('client_c')), 0,
  '1.8: after revocation the assistant sees nothing');

select * from finish();
rollback;

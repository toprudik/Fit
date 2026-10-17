-- A substitute for several sessions at once, migration 20261017234317_substitute_sessions.sql (PRD wave-3 §1):
-- one invite covers the chosen sessions, accepting answers for each one still ahead, and revoking or declining
-- keeps the rest consistent.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_trainer('stranger_t');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('sub_s'), tests.user_id('stranger_t'));

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create table tests.tokens (name text primary key, token text not null, lead uuid not null);
grant select, insert on tests.tokens to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.token(p_name text) returns text language sql stable set search_path = '' as $$
  select token from tests.tokens where name = p_name
$$;
create function tests.status(p_session text) returns text language sql stable set search_path = '' as $$
  select d.status::text from public.delegations d where d.session_id = tests.id(p_session) order by d.created_at desc limit 1
$$;

insert into tests.ids select 's' || n, tests.create_session('owner_a', date_trunc('hour', now()) + n * interval '1 day', 'group', 4)
from generate_series(1, 6) n;
insert into tests.ids values ('past', tests.create_session('owner_a', date_trunc('hour', now()) - interval '1 day', 'group', 4));
insert into tests.ids values ('theirs', tests.create_session('stranger_t', date_trunc('hour', now()) + interval '2 days', 'group', 4));
create table tests.starts as select id, starts_at from public.sessions where id in (select id from tests.ids);
grant select on tests.starts to authenticated;
select tests.create_booking(tests.id('s1'), 'owner_a', 'client_c');
select tests.create_booking(tests.id('s2'), 'owner_a', 'client_c');

-- Gates -------------------------------------------------------------------------------------------------------

select tests.authenticate_as('stranger_t');
select throws_ok(format($$ select * from public.create_substitutions(array[%L, %L]::uuid[]) $$, tests.id('theirs'), tests.id('s1')),
  'P0001', 'plan_required', 'a trainer without trainer.delegation cannot ask for a substitute');

select tests.authenticate_as('owner_a');
select throws_ok(format($$ select * from public.create_substitutions(array[%L]::uuid[]) $$, tests.id('s1')),
  '22023', 'invalid_sessions', 'one session goes through create_delegation');
select throws_ok(format($$ select * from public.create_substitutions(array[%L, %L]::uuid[]) $$, tests.id('s1'), tests.id('past')),
  'P0001', 'session_not_found', 'a past session cannot be handed over');
select throws_ok(format($$ select * from public.create_substitutions(array[%L, %L]::uuid[]) $$, tests.id('s1'), tests.id('theirs')),
  'P0001', 'session_not_found', 'nor another trainer''s session');

-- One invite for three sessions --------------------------------------------------------------------------------

insert into tests.tokens select 'three', token, delegation_id
from public.create_substitutions(array[tests.id('s3'), tests.id('s1'), tests.id('s2'), tests.id('s1')]);
select tests.clear_authentication();
select results_eq(
  format($$ select d.session_id, d.lead_id is null, d.invite_hash is not null from public.delegations d
            where d.id = %L or d.lead_id = %L order by d.ends_at $$,
    (select lead from tests.tokens where name = 'three'), (select lead from tests.tokens where name = 'three')),
  format($$ values (%L::uuid, true, true), (%L::uuid, false, false), (%L::uuid, false, false) $$,
    tests.id('s1'), tests.id('s2'), tests.id('s3')),
  'one row per session; the earliest holds the token');

select tests.authenticate_as('owner_a');
select throws_ok(format($$ select * from public.create_substitutions(array[%L, %L]::uuid[]) $$, tests.id('s2'), tests.id('s4')),
  'P0001', 'already_delegated', 'a session already in an invite is not handed over twice');
select throws_ok(format($$ select * from public.create_delegation('substitute', %L) $$, tests.id('s3')),
  'P0001', 'already_delegated', 'nor by a single substitute');

-- Revoking the row with the token hands it on: the link still works for the rest.
select ok(public.revoke_delegation((select lead from tests.tokens where name = 'three')), 'the owner takes the first session back');

select tests.authenticate_as('sub_s');
select results_eq(format($$ select session_starts_at, cardinality(sessions_starts_at) from public.delegation_invite(%L) $$, tests.token('three')),
  format($$ select starts_at, 2 from tests.starts where id = %L $$, tests.id('s2')),
  'the invite now shows the two sessions left, starting with the second');

-- The second session gets cancelled before the answer: accepting takes only what is still ahead.
select tests.clear_authentication();
update public.sessions set status = 'cancelled', cancel_reason = 'Болезнь', cancelled_at = now() where id = tests.id('s2');
select tests.authenticate_as('sub_s');
select ok(public.accept_delegation(tests.token('three')) is not null, 'the substitute accepts the invite');
select tests.clear_authentication();
select results_eq(
  format($$ select tests.status('s1'), tests.status('s2'), tests.status('s3') $$),
  $$ values ('revoked', 'expired', 'active') $$,
  'revoked stays revoked, the cancelled session expires, the session ahead is taken');
select is((select conducted_by from public.sessions where id = tests.id('s3')), tests.user_id('sub_s'),
  'the session ahead names the substitute');
select is((select conducted_by from public.sessions where id = tests.id('s1')), null::uuid,
  'the session taken back does not');
select is((select count(*)::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'accepted' and user_id = tests.user_id('owner_a')), 1,
  'the owner gets one message for the whole invite');
select is((select (payload->>'sessions')::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'accepted' and user_id = tests.user_id('owner_a')), 1,
  'which says how many sessions were taken');

select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.sessions where id in (tests.id('s1'), tests.id('s3'))), 1,
  'the substitute reads only the session it took');

-- Each session can be taken back on its own.
select tests.authenticate_as('owner_a');
select ok(public.revoke_delegation((select id from public.delegations where session_id = tests.id('s3') and status = 'active')),
  'the owner revokes one session of the invite');
select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.sessions where id = tests.id('s3')), 0, 'and its access ends at once');

-- Declining answers for every session of an invite.
select tests.authenticate_as('owner_a');
insert into tests.tokens select 'two', token, delegation_id from public.create_substitutions(array[tests.id('s4'), tests.id('s5')]);
select throws_ok(format($$ select public.invite_delegate(%L, %L) $$,
    (select id from public.delegations where session_id = tests.id('s5') and status = 'pending'), tests.user_id('sub_s')),
  'P0001', 'not_pending', 'only the row with the token is sent by search');
select lives_ok(format($$ select public.invite_delegate(%L, %L) $$, (select lead from tests.tokens where name = 'two'), tests.user_id('sub_s')),
  'the owner sends the invite to a trainer found by search');
select tests.clear_authentication();
select is((select (payload->>'sessions')::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'invited' and user_id = tests.user_id('sub_s')), 2,
  'the trainer''s message says how many sessions the invite covers');
insert into tests.tokens select 'sent', payload->>'token', (payload->>'delegation_id')::uuid from public.notification_outbox
where type = 'delegation' and payload->>'event' = 'invited' and user_id = tests.user_id('sub_s');
select tests.authenticate_as('sub_s');
select public.decline_delegation(tests.token('sent'));
select tests.clear_authentication();
select results_eq($$ select tests.status('s4'), tests.status('s5') $$, $$ values ('declined', 'declined') $$,
  'declining answers for both sessions');
select is((select count(*)::int from public.notification_outbox
           where type = 'delegation' and payload->>'event' = 'declined' and user_id = tests.user_id('owner_a')), 1,
  'and the owner is told once');

-- Once every session has started, the invite has expired.
select tests.authenticate_as('owner_a');
insert into tests.tokens select 'late', token, delegation_id from public.create_substitutions(array[tests.id('s5'), tests.id('s6')]);
select tests.clear_authentication();
update public.sessions set starts_at = now() - interval '10 minutes', ends_at = now() + interval '50 minutes'
where id in (tests.id('s5'), tests.id('s6'));
select tests.authenticate_as('sub_s');
select throws_ok(format($$ select public.accept_delegation(%L) $$, tests.token('late')), 'P0001', 'invite_expired',
  'an invite whose sessions all started has expired');

select * from finish();
rollback;

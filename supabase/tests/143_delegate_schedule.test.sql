-- The assistant's schedule and what a delegate reads, migration 20261017113217_delegate_schedule.sql (PRD wave-3
-- §1, rules 3–4): within its scope a delegate reads the pairs, profiles and sessions it was handed and manages the
-- owner's schedule; another trainer does neither.
begin;
\ir _helpers.psql
select plan(26);

select tests.create_trainer('owner_a');
select tests.create_trainer('helper_all');
select tests.create_trainer('helper_pick');
select tests.create_trainer('helper_notes');
select tests.create_trainer('sub_s');
select tests.create_trainer('stranger_t');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('owner_a', 'client_c');
select tests.create_pair('owner_a', 'client_d');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('helper_all'), tests.user_id('helper_pick'),
                  tests.user_id('helper_notes'), tests.user_id('sub_s'));

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('pair_c', tests.pair_id('owner_a', 'client_c')), ('pair_d', tests.pair_id('owner_a', 'client_d'));
insert into tests.ids values ('group', tests.create_session('owner_a', date_trunc('hour', now()) + interval '3 days', 'group', 4));
insert into tests.ids values ('b_c', tests.create_booking(tests.id('group'), 'owner_a', 'client_c'));

-- The owner hands out three assistants and a substitute; each accepts.
create table tests.invites (name text primary key, token text not null);
grant select, insert on tests.invites to authenticated;
select tests.authenticate_as('owner_a');
insert into tests.invites select 'all', token from public.create_delegation('assistant', null, '{schedule}', true);
insert into tests.invites select 'pick', token
from public.create_delegation('assistant', null, '{schedule}', false, array[tests.id('pair_c')]);
insert into tests.invites select 'notes', token from public.create_delegation('assistant', null, '{notes}', true);
insert into tests.invites select 'sub', token from public.create_delegation('substitute', tests.id('group'));
select tests.authenticate_as('helper_all');
select public.accept_delegation((select token from tests.invites where name = 'all'));
select tests.authenticate_as('helper_pick');
select public.accept_delegation((select token from tests.invites where name = 'pick'));
select tests.authenticate_as('helper_notes');
select public.accept_delegation((select token from tests.invites where name = 'notes'));
select tests.authenticate_as('sub_s');
select public.accept_delegation((select token from tests.invites where name = 'sub'));

-- Reading: pairs, profiles, sessions --------------------------------------------------------------------------

select tests.authenticate_as('helper_pick');
select is((select count(*)::int from public.coachings where id = tests.id('pair_c')), 1,
  'an assistant reads the pair it covers');
select is((select count(*)::int from public.coachings where id = tests.id('pair_d')), 0,
  'an assistant for chosen clients does not read the owner''s other pairs');
select is((select count(*)::int from public.profiles where id = tests.user_id('client_c')), 1,
  'an assistant reads the profile of its client');
select is((select count(*)::int from public.profiles where id = tests.user_id('client_d')), 0,
  'and not of the owner''s other clients');

select tests.authenticate_as('sub_s');
select is((select count(*)::int from public.profiles where id = tests.user_id('client_c')), 1,
  'a substitute reads the profile of a participant');
select is((select count(*)::int from public.sessions where id = tests.id('group')), 1,
  'a substitute reads its session');
select is((select count(*)::int from public.coachings where id = tests.id('pair_d')), 0,
  'a substitute does not read pairs outside its session');

select tests.authenticate_as('stranger_t');
select is((select count(*)::int from public.coachings where id in (tests.id('pair_c'), tests.id('pair_d'))), 0,
  'another trainer reads none of the owner''s pairs');
select is((select count(*)::int from public.profiles where id in (tests.user_id('client_c'), tests.user_id('client_d'))), 0,
  'another trainer reads none of the owner''s clients');

-- Personal sessions for covered clients -----------------------------------------------------------------------

select tests.authenticate_as('helper_pick');
insert into tests.ids select 'personal', session_id
from public.create_session(tests.id('pair_c'), date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline');
select tests.clear_authentication();
select results_eq(
  format($$ select trainer_id, created_by from public.sessions where id = %L $$, tests.id('personal')),
  format($$ values (%L::uuid, %L::uuid) $$, tests.user_id('owner_a'), tests.user_id('helper_pick')),
  'the assistant''s session is the owner''s, made by the assistant');

select tests.authenticate_as('helper_pick');
select is((select count(*)::int from public.sessions where id = tests.id('personal')), 1,
  'an assistant for chosen clients reads its client''s session');
select throws_ok(
  format($$ select * from public.create_session(%L, date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline') $$,
    tests.id('pair_d')),
  '42501', 'not_your_client', 'an assistant cannot schedule a client it does not cover');
select lives_ok(format($$ select public.cancel_session(%L, 'Перенос') $$, tests.id('personal')),
  'an assistant cancels its client''s personal session');
select lives_ok(
  format($$ select * from public.record_past_session(%L, date_trunc('hour', now()) - interval '1 day', 60::smallint, 'offline') $$,
    tests.id('pair_c')),
  'an assistant records a past session of its client');

select tests.authenticate_as('helper_notes');
select throws_ok(
  format($$ select * from public.create_session(%L, date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline') $$,
    tests.id('pair_c')),
  '42501', 'not_your_client', 'an assistant without the schedule scope cannot schedule');

select tests.authenticate_as('stranger_t');
select throws_ok(
  format($$ select * from public.create_session(%L, date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline') $$,
    tests.id('pair_c')),
  '42501', 'not_your_client', 'another trainer cannot schedule the owner''s client');

-- The owner's whole schedule: group sessions, closed days, week template -------------------------------------

select tests.authenticate_as('helper_all');
insert into tests.ids select 'group_new', session_id
from public.create_group_session(date_trunc('hour', now()) + interval '4 days', 60::smallint, 6::smallint, 'Йога',
  'offline', p_trainer_id => tests.user_id('owner_a'));
select is((select trainer_id from public.sessions where id = tests.id('group_new')), tests.user_id('owner_a'),
  'an assistant for all clients adds a group session to the owner''s schedule');
select ok((select count(*) from public.session_conflicts(date_trunc('hour', now()) + interval '4 days',
            date_trunc('hour', now()) + interval '4 days 30 minutes', p_trainer_id => tests.user_id('owner_a'))) = 1,
  'and sees the owner''s overlapping sessions');
select lives_ok(
  format($$ select * from public.close_schedule_days(current_date + 10, current_date + 11, p_trainer_id => %L) $$,
    tests.user_id('owner_a')),
  'an assistant for all clients closes the owner''s days');
select lives_ok(
  format($$ select public.reopen_schedule((select id from public.slots where trainer_id = %L and status = 'closed')) $$,
    tests.user_id('owner_a')),
  'and opens them again');
select lives_ok(
  format($$ select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "11:00", "duration_min": 60}]',
    p_trainer_id => %L) $$, tests.user_id('owner_a')),
  'and edits the owner''s week template');

select tests.authenticate_as('helper_pick');
select throws_ok(
  format($$ select * from public.create_group_session(date_trunc('hour', now()) + interval '4 days', 60::smallint, 6::smallint,
    'Йога', 'offline', p_trainer_id => %L) $$, tests.user_id('owner_a')),
  '42501', 'not_your_schedule', 'an assistant for chosen clients does not run the owner''s whole schedule');

select tests.authenticate_as('stranger_t');
select throws_ok(
  format($$ select * from public.close_schedule_days(current_date + 10, current_date + 11, p_trainer_id => %L) $$,
    tests.user_id('owner_a')),
  '42501', 'not_your_schedule', 'another trainer cannot close the owner''s days');
select is((select count(*)::int from public.session_conflicts(date_trunc('hour', now()) + interval '4 days',
            date_trunc('hour', now()) + interval '4 days 30 minutes', p_trainer_id => tests.user_id('owner_a'))), 0,
  'another trainer sees none of the owner''s sessions');
select tests.clear_authentication();
select is((select count(*)::int from public.week_templates where trainer_id = tests.user_id('stranger_t')), 0,
  'nothing was written to another trainer''s schedule');

-- 1.8: revoking ends the reading at once.
select tests.authenticate_as('owner_a');
select public.revoke_delegation((select id from public.delegations
                                 where delegate_trainer_id = tests.user_id('helper_pick')));
select tests.authenticate_as('helper_pick');
select is((select count(*)::int from public.coachings where id = tests.id('pair_c')), 0,
  '1.8: after a revoke the assistant no longer reads the pair');

select * from finish();
rollback;

-- Migration 20261021225317_delegate_journal_without_client.sql (QA B7): the owner's journal of delegates leaves
-- out what the client did themselves, and still lists what a delegate did.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('owner_a');
select tests.create_trainer('helper_h');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');

-- The client books a personal session (its author is the client) and logs a workout of their own.
create table tests.s (id uuid);
grant select, insert on tests.s to authenticated;
select tests.authenticate_as('owner_a');
insert into tests.s select session_id from public.create_session(tests.pair_id('owner_a', 'client_c'),
  date_trunc('hour', now()) + interval '2 days', 60::smallint, 'offline');
select tests.clear_authentication();
update public.sessions set created_by = tests.user_id('client_c') where id = (select id from tests.s);
insert into public.workout_logs (client_id, coaching_id, performed_at, local_date, created_by)
values (tests.user_id('client_c'), tests.pair_id('owner_a', 'client_c'), now(), current_date, tests.user_id('client_c'));

select tests.authenticate_as('owner_a');
select is((select count(*)::int from public.delegate_journal()), 0, 'B7: the client''s own session and workout are not listed');

-- A delegate's note still shows.
select tests.clear_authentication();
insert into public.coaching_notes (coaching_id, author_id, body)
values (tests.pair_id('owner_a', 'client_c'), tests.user_id('helper_h'), 'Колено лучше');
select tests.authenticate_as('owner_a');
select set_eq($$ select action from public.delegate_journal() $$, $$ values ('note') $$, 'a delegate''s note is listed');
select is((select count(*)::int from public.delegate_journal(tests.pair_id('owner_a', 'client_c'))), 1,
  'the journal of one pair lists the note only');

select * from finish();
rollback;

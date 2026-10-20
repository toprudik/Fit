-- Trainer milestones of migration 20261020162417_trainer_milestones.sql (marketing 14): 5 clients, 100 and 500
-- held sessions, 4 weeks in a row with marks, the first trial client; the bot message and who reads them.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_trainer('trainer_b', 'boris');
select tests.create_user('client_' || n) from generate_series(1, 6) as n;

create function pg_temp.has(p_trainer text, p_kind text) returns boolean language sql as $$
  select exists (select 1 from public.trainer_milestones m where m.trainer_id = tests.user_id(p_trainer) and m.kind::text = p_kind)
$$;
create function pg_temp.messages(p_trainer text, p_kind text) returns integer language sql as $$
  select count(*)::int from public.notification_outbox o
  where o.user_id = tests.user_id(p_trainer) and o.type = 'trainer_milestone' and o.payload ->> 'milestone' = p_kind
$$;

-- =========================================================================================================
-- 5 clients and the first trial client

select tests.create_pair('trainer_a', 'client_' || n) from generate_series(1, 4) as n;
select ok(not pg_temp.has('trainer_a', 'clients_5'), 'clients: 4 active pairs are not yet the milestone');
select tests.create_pair('trainer_a', 'client_5', 'trial', 'trial_link');
select ok(not pg_temp.has('trainer_a', 'clients_5'), 'clients: a trial pair does not count');
select ok(not pg_temp.has('trainer_a', 'first_trial_client'), 'trial: a pair still on trial is not a client yet');
update public.coachings set status = 'active' where id = tests.pair_id('trainer_a', 'client_5');
select ok(pg_temp.has('trainer_a', 'clients_5'), 'clients: the 5th active pair reaches the milestone');
select ok(pg_temp.has('trainer_a', 'first_trial_client'), 'trial: a trial-link pair that became active is the first trial client');
select is(pg_temp.messages('trainer_a', 'clients_5'), 1, 'clients: the trainer gets one bot message');
select is(pg_temp.messages('trainer_a', 'first_trial_client'), 1, 'trial: and one for the trial client');

update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_a', 'client_1');
select tests.create_pair('trainer_a', 'client_6');
select is(pg_temp.messages('trainer_a', 'clients_5'), 1, 'clients: back to 5 after an ended pair sends nothing again');
select ok(pg_temp.has('trainer_a', 'clients_5'), 'clients: the milestone stays when the count drops');

-- =========================================================================================================
-- 100 and 500 held sessions (ended, not cancelled, with a confirmed or attended booking, as in the admin panel)

select tests.create_pair('trainer_b', 'client_1');
create function pg_temp.past_sessions(p_count integer, p_status public.booking_status) returns void language sql as $$
  with made as (
    insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, status, completed_at)
    select tests.user_id('trainer_b'), 'personal', now() - n * interval '2 hours', now() - n * interval '2 hours' + interval '1 hour',
           'offline', 'completed', now()
    from generate_series(1, p_count) as n
    returning id
  )
  select tests.create_booking(made.id, 'trainer_b', 'client_1', p_status) from made
$$;

select pg_temp.past_sessions(99, 'attended');
select pg_temp.past_sessions(3, 'requested');
select tests.create_booking(tests.create_session('trainer_b', now() + interval '1 day'), 'trainer_b', 'client_1', 'confirmed');
insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode, status, cancelled_at)
values (tests.user_id('trainer_b'), 'personal', now() - interval '900 hours', now() - interval '899 hours', 'offline', 'cancelled', now());
select ok(not pg_temp.has('trainer_b', 'sessions_100'), 'sessions: 99 held, requested ones, a future and a cancelled one are not 100');
-- The usual way: the booking is confirmed ahead, the session ends, and complete_sessions completes it.
update public.sessions set starts_at = now() - interval '1000 hours', ends_at = now() - interval '999 hours'
where trainer_id = tests.user_id('trainer_b') and status = 'scheduled';
select ok(not pg_temp.has('trainer_b', 'sessions_100'), 'sessions: an ended session not completed yet is counted on completion');
update public.sessions set status = 'completed', completed_at = now()
where trainer_id = tests.user_id('trainer_b') and status = 'scheduled';
select ok(pg_temp.has('trainer_b', 'sessions_100'), 'sessions: the 100th held session reaches the milestone');
select ok(not pg_temp.has('trainer_b', 'sessions_500'), 'sessions: 100 is not 500');
select pg_temp.past_sessions(400, 'confirmed');
select ok(pg_temp.has('trainer_b', 'sessions_500'), 'sessions: the 500th held session reaches the next one');
select is(pg_temp.messages('trainer_b', 'sessions_100'), 1, 'sessions: one message for 100');

-- =========================================================================================================
-- 4 weeks in a row with marks (Mondays in Moscow: 7, 14, 21 and 28 September 2026)

create function pg_temp.mark(p_day text, p_by text) returns void language plpgsql as $$
declare
  v_session uuid := tests.create_session('trainer_a', (p_day || ' 10:00+03')::timestamptz);
  v_booking uuid := tests.create_booking(v_session, 'trainer_a', 'client_2', 'confirmed');
begin
  update public.bookings
  set status = 'attended', attendance_marked_at = now(),
      attendance_marked_by = case when p_by is null then null else tests.user_id(p_by) end
  where id = v_booking;
end $$;

select pg_temp.mark('2026-09-08', 'trainer_a');
select pg_temp.mark('2026-09-16', 'trainer_a');
select pg_temp.mark('2026-09-30', 'trainer_a');
select pg_temp.mark('2026-10-06', 'trainer_a');
select ok(not pg_temp.has('trainer_a', 'weeks_4'), 'weeks: four weeks with a gap are not in a row');
select pg_temp.mark('2026-09-25', null);
select ok(not pg_temp.has('trainer_a', 'weeks_4'), 'weeks: an automatic mark does not fill the gap');
select pg_temp.mark('2026-09-27', 'trainer_a');
select ok(pg_temp.has('trainer_a', 'weeks_4'), 'weeks: a mark on Sunday of the missing week completes 4 in a row');
select is(pg_temp.messages('trainer_a', 'weeks_4'), 1, 'weeks: one message');

-- =========================================================================================================
-- Who reads them

select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.trainer_milestones), 3, 'read: the trainer sees own milestones');
select tests.authenticate_as('trainer_b');
select is(
  (select count(*)::int from public.trainer_milestones where trainer_id = tests.user_id('trainer_a')), 0,
  'read: another trainer sees none of them'
);
select throws_ok(
  $$ insert into public.trainer_milestones (trainer_id, kind) values (tests.user_id('trainer_b'), 'weeks_4') $$,
  '42501', null, 'write: nobody writes milestones directly'
);
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.trainer_milestones $$, '42501', null, 'read: anon has no access');
select tests.clear_authentication();

select lives_ok(
  $$ insert into public.notification_preferences (user_id, type, enabled) values (tests.user_id('trainer_a'), 'trainer_milestone', false) $$,
  'switch: the trainer can turn the milestone message off in notification settings'
);

select * from finish();
rollback;

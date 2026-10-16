-- end_coaching of migration 20261016190000_end_coaching.sql (PRD wave-1 §2.5, §2.12-5 PRIV-5): either side ends a
-- live pair, future bookings are cancelled without a charge, lone future personal sessions and the pair's
-- repeats stop, and the other side gets coaching_ended.
begin;
\ir _helpers.psql
select plan(26);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_b', 'client_c');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Pairs and sessions by name: a step acting as a user cannot look pairs up with tests.pair_id under RLS.
create table tests.pairs (name text primary key, id uuid not null);
grant select on tests.pairs to anon, authenticated;
insert into tests.pairs values
  ('a_c', tests.pair_id('trainer_a', 'client_c')),
  ('a_d', tests.pair_id('trainer_a', 'client_d')),
  ('b_c', tests.pair_id('trainer_b', 'client_c'));
create function tests.p(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.pairs where name = p_name
$$;

-- Sessions by name, so later checks can find them.
create table tests.s (name text primary key, id uuid not null);
grant select on tests.s to anon, authenticated;

insert into tests.s values
  ('personal', tests.create_session('trainer_a', now() + interval '2 days')),
  ('requested', tests.create_session('trainer_a', now() + interval '3 days')),
  ('group', tests.create_session('trainer_a', now() + interval '4 days', 'group', 5)),
  ('past', tests.create_session('trainer_a', now() - interval '2 days')),
  ('other_trainer', tests.create_session('trainer_b', now() + interval '2 days'));

select tests.create_booking((select id from tests.s where name = 'personal'), 'trainer_a', 'client_c');
select tests.create_booking((select id from tests.s where name = 'requested'), 'trainer_a', 'client_c', 'requested', 'client_slot');
select tests.create_booking((select id from tests.s where name = 'group'), 'trainer_a', 'client_c');
select tests.create_booking((select id from tests.s where name = 'group'), 'trainer_a', 'client_d');
select tests.create_booking((select id from tests.s where name = 'past'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking((select id from tests.s where name = 'other_trainer'), 'trainer_b', 'client_c');

insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
values (tests.u('trainer_a'), tests.p('a_c'), 'FREQ=WEEKLY;BYDAY=MO', now()::timestamp,
        'Europe/Moscow', 60, 'personal');

-- =========================================================================================================
-- Who may end a pair

select tests.authenticate_as_anon();
select throws_ok(
  format('select public.end_coaching(%L)', tests.p('a_c')), '42501', null,
  'anon cannot end a pair'
);
select tests.authenticate_as('stranger_s');
select throws_ok(
  format('select public.end_coaching(%L)', tests.p('a_c')), 'P0001', 'coaching_not_found',
  'a stranger cannot end a pair'
);
select tests.authenticate_as('trainer_b');
select throws_ok(
  format('select public.end_coaching(%L)', tests.p('a_c')), 'P0001', 'coaching_not_found',
  'another trainer of the client cannot end this pair'
);
select tests.authenticate_as('client_d');
select throws_ok(
  format('select public.end_coaching(%L)', tests.p('a_c')), 'P0001', 'coaching_not_found',
  'another client of the trainer cannot end this pair'
);
select tests.authenticate_as('client_c');
select throws_ok(
  format('select public.end_coaching(%L, %L)', tests.p('a_c'), repeat('x', 501)),
  'P0001', 'reason_too_long', 'a reason over 500 characters is refused'
);
select throws_ok(
  $$ update public.coachings set status = 'ended', ended_at = now() where client_id = auth.uid() $$,
  '42501', null, 'the status cannot be changed directly, only through the RPC'
);

-- =========================================================================================================
-- The client ends the pair

select is(
  public.end_coaching(tests.p('a_c'), '  Moving to another city  '), 3,
  'client: three future bookings are cancelled (personal, requested, group)'
);

select tests.clear_authentication();
select results_eq(
  format(
    $$ select status::text, ended_by, end_reason, ended_at is not null from public.coachings where id = %L $$,
    tests.p('a_c')),
  format($$ values ('ended', %L::uuid, 'Moving to another city', true) $$, tests.u('client_c')),
  'client: the pair is ended by the client with the trimmed reason'
);
select results_eq(
  format(
    $$ select s.name, b.status::text, b.cancelled_by_role::text, b.cancel_reason
       from public.bookings b join tests.s s on s.id = b.session_id
       where b.coaching_id = %L order by s.name $$,
    tests.p('a_c')),
  $$ values ('group', 'cancelled', 'client', 'coaching_ended'),
            ('past', 'attended', null, null),
            ('personal', 'cancelled', 'client', 'coaching_ended'),
            ('requested', 'cancelled', 'client', 'coaching_ended') $$,
  'client: future bookings are cancelled by the client role; the attended one stays'
);
select is(
  (select count(*)::int from public.booking_events e
   join public.bookings b on b.id = e.booking_id
   where b.coaching_id = tests.p('a_c') and e.to_status = 'cancelled'
     and e.actor_id = tests.u('client_c') and e.actor_role = 'client' and e.reason = 'coaching_ended'),
  3, 'client: every cancelled booking has its event'
);
select is(
  (select count(*)::int from public.ledger_entries where coaching_id = tests.p('a_c')),
  0, 'client: ending the pair charges nothing'
);
select results_eq(
  $$ select s.name, x.status::text, x.cancel_reason from public.sessions x join tests.s s on s.id = x.id order by s.name $$,
  $$ values ('group', 'scheduled', null),
            ('other_trainer', 'scheduled', null),
            ('past', 'scheduled', null),
            ('personal', 'cancelled', 'coaching_ended'),
            ('requested', 'cancelled', 'coaching_ended') $$,
  'client: lone future personal sessions are cancelled; the group session and the past one stay'
);
select is(
  (select status::text from public.bookings
   where session_id = (select id from tests.s where name = 'group') and client_id = tests.u('client_d')),
  'confirmed', 'client: the other client of the group session keeps the seat'
);
select ok(
  (select ended_at is not null from public.recurrences where coaching_id = tests.p('a_c')),
  'client: the pair repeat stops'
);
select results_eq(
  $$ select status::text from public.bookings where trainer_id = tests.u('trainer_b') $$,
  $$ values ('confirmed') $$,
  'client: the pair with the other trainer is untouched'
);
select is(
  (select status::text from public.coachings where id = tests.p('b_c')), 'active',
  'client: the other pair stays active'
);
select results_eq(
  $$ select user_id, payload ->> 'ended_by', payload ->> 'first_name', (payload ->> 'cancelled')::int
     from public.notification_outbox where type = 'coaching_ended' $$,
  format($$ values (%L::uuid, 'client', 'client_c', 3) $$, tests.u('trainer_a')),
  'client: the trainer gets coaching_ended (Т9) naming the client and the cancelled bookings'
);

select tests.authenticate_as('client_c');
select is(
  public.end_coaching(tests.p('a_c')), 0, 'client: ending an ended pair changes nothing'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'coaching_ended'), 1,
  'client: a second end sends no second message'
);
select is(
  (select end_reason from public.coachings where id = tests.p('a_c')), 'Moving to another city',
  'client: a second end keeps the first reason'
);

-- History stays readable to both sides after the end.
select tests.authenticate_as('client_c');
select is(
  (select count(*)::int from public.bookings where coaching_id = tests.p('a_c')), 4,
  'after the end: the client still sees the bookings of the pair'
);
select tests.authenticate_as('trainer_a');
select is(
  (select count(*)::int from public.coachings where id = tests.p('a_c')), 1,
  'after the end: the trainer still sees the pair'
);

-- =========================================================================================================
-- The trainer ends a pair

select is(
  public.end_coaching(tests.p('a_d'), ''), 1, 'trainer: the one future booking is cancelled'
);
select tests.clear_authentication();
select results_eq(
  format(
    $$ select status::text, ended_by, end_reason from public.coachings where id = %L $$,
    tests.p('a_d')),
  format($$ values ('ended', %L::uuid, null::text) $$, tests.u('trainer_a')),
  'trainer: the pair is ended by the trainer; an empty reason is stored as none'
);
select results_eq(
  format(
    $$ select status::text, cancelled_by_role::text, cancel_reason from public.bookings where coaching_id = %L $$,
    tests.p('a_d')),
  $$ values ('cancelled', 'trainer', 'coaching_ended') $$,
  'trainer: the booking is cancelled by the trainer role, with the mark the trainer cancel check needs'
);
select results_eq(
  $$ select user_id, payload ->> 'ended_by', payload ->> 'first_name'
     from public.notification_outbox where type = 'coaching_ended' and payload ->> 'ended_by' = 'trainer' $$,
  format($$ values (%L::uuid, 'trainer', 'trainer_a') $$, tests.u('client_d')),
  'trainer: the client gets coaching_ended naming the trainer'
);

select * from finish();
rollback;

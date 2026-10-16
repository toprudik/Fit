-- Charges and waivers of migration 20261016225700_charges.sql (PRD wave-1 §2.6.2 rules 7 and 9, §2.6.6,
-- SCHED-11..14; data-model §3.3, §3.4): session end, attendance marks, "Не состоялось", waive_charge with the
-- settlement reversal, record_past_session and adjust_pass.
begin;
\ir _helpers.psql
select plan(40);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.left_on(p_pass uuid) returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(sessions_delta), 0) from public.ledger_entries where pass_id = p_pass
$$;

-- The drop-in price of trainer A: 2 500 ₽ for a personal session.
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to)
values (tests.u('trainer_a'), 'Разовое', 1, 250000, 'RUB', 'personal');

-- Client C has a pass of 3 sessions for 9 000 ₽, valid from ten days ago.
insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 3, 900000));
update public.passes set starts_on = current_date - 10 where id = tests.id('pass_c');

-- Ended sessions: C (confirmed), D (no pass, so debt), E (a free trial). One that has started but not ended, one
-- in the future.
insert into tests.ids values ('s_c', tests.create_session('trainer_a', now() - interval '2 hours'));
insert into tests.ids values ('b_c', tests.create_booking(tests.id('s_c'), 'trainer_a', 'client_c'));
insert into tests.ids values ('s_d', tests.create_session('trainer_a', now() - interval '3 hours'));
insert into tests.ids values ('b_d', tests.create_booking(tests.id('s_d'), 'trainer_a', 'client_d'));
insert into tests.ids values ('s_e', tests.create_session('trainer_a', now() - interval '4 hours'));
insert into tests.ids values ('b_e', tests.create_booking(tests.id('s_e'), 'trainer_a', 'client_e', 'confirmed', 'trial'));
insert into tests.ids values ('s_now', tests.create_session('trainer_a', now() - interval '20 minutes'));
insert into tests.ids values ('b_now', tests.create_booking(tests.id('s_now'), 'trainer_a', 'client_c'));
insert into tests.ids values ('s_next', tests.create_session('trainer_a', now() + interval '1 day'));
insert into tests.ids values ('b_next', tests.create_booking(tests.id('s_next'), 'trainer_a', 'client_c'));

-- =========================================================================================================
-- Session end
-- =========================================================================================================

select is(private.complete_sessions(), 3, 'end: the three ended sessions are completed');
select results_eq(
  $$ select status::text from public.sessions where id in (tests.id('s_c'), tests.id('s_now'), tests.id('s_next'))
     order by starts_at $$,
  $$ values ('completed'::text), ('scheduled'), ('scheduled') $$,
  'end: a session still running and a future one stay scheduled'
);
select results_eq(
  $$ select status::text, attendance_marked_by from public.bookings where id = tests.id('b_c') $$,
  $$ values ('attended'::text, null::uuid) $$,
  'end: a confirmed booking becomes attended, marked by the system'
);
select results_eq(
  $$ select pass_id, amount_minor, currency::text, charge_reason::text, occurred_at
     from public.ledger_entries where booking_id = tests.id('b_c') and entry_type = 'charge' $$,
  $$ select tests.id('pass_c'), 300000::bigint, 'RUB'::text, 'attended'::text,
            (select starts_at from public.sessions where id = tests.id('s_c')) $$,
  'end: the session is taken from the pass at its start, earning a third of the price'
);
select is(tests.left_on(tests.id('pass_c')), 2::bigint, 'end: the pass has 2 sessions left (SCHED-11)');
select results_eq(
  $$ select pass_id, amount_minor, currency::text from public.ledger_entries
     where booking_id = tests.id('b_d') and entry_type = 'charge' $$,
  $$ values (null::uuid, 250000::bigint, 'RUB'::text) $$,
  'end: without a pass the session goes into debt at the drop-in price'
);
select is(
  (select debt_sessions from public.coaching_balances where coaching_id = tests.pair_id('trainer_a', 'client_d')),
  1::bigint, 'end: client D owes one session');
select results_eq(
  $$ select b.status::text, (select count(*) from public.ledger_entries e where e.booking_id = b.id)
     from public.bookings b where b.id = tests.id('b_e') $$,
  $$ values ('attended'::text, 0::bigint) $$,
  'end: a free trial is attended without a ledger row'
);
select is(private.complete_sessions(), 0, 'end: running again finds nothing to do');

-- =========================================================================================================
-- mark_attendance
-- =========================================================================================================

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.mark_attendance(tests.id('b_c'), 'no_show') $$,
  'P0002', 'booking_not_found', 'mark: another trainer cannot see the booking'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.mark_attendance(tests.id('b_next'), 'attended') $$,
  '22023', 'not_started', 'mark: a session that has not started cannot be marked'
);
select throws_ok(
  $$ select public.mark_attendance(tests.id('b_c'), 'late_cancelled') $$,
  '22023', 'invalid_status', 'mark: only attended, no_show or cancelled'
);
select is(public.mark_attendance(tests.id('b_c'), 'no_show')::text, 'no_show', 'mark: attended becomes no_show');
select tests.clear_authentication();
select is(
  (select count(*) from public.ledger_entries where booking_id = tests.id('b_c') and entry_type = 'charge'),
  1::bigint, 'mark: the charge stays one (SCHED-12)');
select is(tests.left_on(tests.id('pass_c')), 2::bigint, 'mark: the pass is not charged again');
select is(
  (select count(*) from public.notification_outbox
   where type = 'charge_posted' and user_id = tests.u('client_c') and payload ->> 'remaining' = '2'),
  1::bigint, 'mark: the client gets К8 with what is left');
select results_eq(
  $$ select from_status::text, to_status::text, actor_role::text from public.booking_events
     where booking_id = tests.id('b_c') order by id desc limit 1 $$,
  $$ values ('attended'::text, 'no_show'::text, 'trainer'::text) $$,
  'mark: the change is in the history (SCHED-22)'
);

select tests.authenticate_as('trainer_a');
select is(public.mark_attendance(tests.id('b_now'), 'attended')::text, 'attended',
  'mark: a running session can be marked attended');
select tests.clear_authentication();
select is(tests.left_on(tests.id('pass_c')), 1::bigint, 'mark: marking a confirmed booking charges it now');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.mark_attendance(tests.id('b_c'), 'cancelled') $$,
  '22023', 'reason_required', 'not held: the reason is required'
);
select is(public.mark_attendance(tests.id('b_c'), 'cancelled', 'Тренер заболел')::text, 'cancelled',
  'not held: the booking is cancelled by the trainer');
select tests.clear_authentication();
select results_eq(
  $$ select amount_minor, note from public.ledger_entries
     where booking_id = tests.id('b_c') and entry_type = 'waiver' $$,
  $$ values (-300000::bigint, 'Тренер заболел'::text) $$,
  'not held: the charge is taken back with the reason (2.6.6-5)'
);
select is(tests.left_on(tests.id('pass_c')), 2::bigint, 'not held: the session returns to the pass');
select results_eq(
  $$ select status::text, cancel_reason from public.sessions where id = tests.id('s_c') $$,
  $$ values ('cancelled'::text, 'Тренер заболел'::text) $$,
  'not held: the personal session is cancelled too'
);

-- =========================================================================================================
-- waive_charge
-- =========================================================================================================

insert into tests.ids
select 'charge_d', id from public.ledger_entries where booking_id = tests.id('b_d') and entry_type = 'charge';

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.waive_charge(tests.id('charge_d')) $$,
  'P0002', 'charge_not_found', 'waive: another trainer cannot forgive it'
);
select tests.authenticate_as('trainer_a');
select lives_ok($$ select public.waive_charge(tests.id('charge_d'), 'Первый раз') $$, 'waive: the trainer forgives a debt');
select throws_ok(
  $$ select public.waive_charge(tests.id('charge_d')) $$,
  '23505', 'already_waived', 'waive: a waiver is final (SCHED-13)'
);
select tests.clear_authentication();
select is(
  (select debt_sessions from public.coaching_balances where coaching_id = tests.pair_id('trainer_a', 'client_d')),
  0::bigint, 'waive: the debt shrinks');
select is(
  (select count(*) from public.notification_outbox where type = 'charge_waived' and user_id = tests.u('client_d')),
  1::bigint, 'waive: the client gets К9');

-- A debt covered later by a pass: forgiving it returns the session to that pass.
select tests.authenticate_as('trainer_a');
insert into tests.ids
select 'past_d', booking_id from public.record_past_session(
  tests.pair_id('trainer_a', 'client_d'), now() - interval '2 days', 60::smallint, 'offline');
insert into tests.ids
select 'pass_d', pass_id from public.create_pass(tests.pair_id('trainer_a', 'client_d'), p_title => '5 занятий',
  p_sessions => 5, p_price_minor => 1000000, p_currency => 'RUB', p_starts_on => current_date);
select tests.clear_authentication();
select is(tests.left_on(tests.id('pass_d')), 4::bigint, 'settled: the new pass covered the recorded session');
insert into tests.ids
select 'charge_past_d', id from public.ledger_entries where booking_id = tests.id('past_d') and entry_type = 'charge';
select tests.authenticate_as('trainer_a');
select lives_ok($$ select public.waive_charge(tests.id('charge_past_d')) $$, 'settled: the trainer forgives it');
select tests.clear_authentication();
select results_eq(
  $$ select entry_type::text, pass_id, sessions_delta, amount_minor from public.ledger_entries
     where related_entry_id = tests.id('charge_past_d') order by entry_type $$,
  $$ values ('waiver'::text, null::uuid, 1, -250000::bigint),
            ('settlement', tests.id('pass_d'), -1, 200000::bigint),
            ('settlement_reversal', tests.id('pass_d'), 1, -200000::bigint) $$,
  'settled: the waiver mirrors the charge and the reversal mirrors the settlement'
);
select is(tests.left_on(tests.id('pass_d')), 5::bigint, 'settled: the session returns to the pass that paid for it');

-- =========================================================================================================
-- record_past_session
-- =========================================================================================================

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select * from public.record_past_session(tests.pair_id('trainer_a', 'client_c'), now() - interval '30 minutes',
       60::smallint, 'offline') $$,
  '22023', 'not_past', 'past: a session that has not ended is not recorded after the fact'
);
select throws_ok(
  $$ select * from public.record_past_session(tests.pair_id('trainer_a', 'client_c'), now() - interval '1 day',
       60::smallint, 'offline', p_status => 'confirmed') $$,
  '22023', 'invalid_status', 'past: only attended or no_show'
);
insert into tests.ids
select 'past_c', booking_id from public.record_past_session(
  tests.pair_id('trainer_a', 'client_c'), now() - interval '1 day', 90::smallint, 'offline', p_status => 'no_show');
select tests.clear_authentication();
select results_eq(
  $$ select b.status::text, s.status::text, e.charge_reason::text, e.pass_id
     from public.bookings b join public.sessions s on s.id = b.session_id
     join public.ledger_entries e on e.booking_id = b.id and e.entry_type = 'charge'
     where b.id = tests.id('past_c') $$,
  $$ values ('no_show'::text, 'completed'::text, 'no_show'::text, tests.id('pass_c')) $$,
  'past: a no-show recorded after the fact is charged from the pass'
);

-- =========================================================================================================
-- adjust_pass
-- =========================================================================================================

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.adjust_pass(tests.id('pass_c'), -1, ' ') $$,
  '22023', 'note_required', 'adjust: the note is required'
);
select lives_ok($$ select public.adjust_pass(tests.id('pass_c'), -1, 'Ошибся с прощением') $$, 'adjust: minus one with a note');
select throws_ok(
  $$ select public.adjust_pass(tests.id('pass_c'), -5, 'Слишком много') $$,
  'P0001', 'pass_overdrawn', 'adjust: a pass never goes below zero'
);
select tests.clear_authentication();
select is(tests.left_on(tests.id('pass_c')), 0::bigint, 'adjust: the pass is corrected');

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.mark_attendance(tests.id('b_now'), 'no_show') $$,
  '42501', null, 'anon cannot mark attendance'
);
select tests.clear_authentication();

select * from finish();
rollback;

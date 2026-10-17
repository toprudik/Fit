-- Client cancellations, reschedules, paid trials and trial pairs of migration 20261017004300_client_cancellations.sql
-- (PRD wave-1 §2.6.5, §2.6.6-2, §2.3-6; data-model §3.3 "Правило дедлайна", §2.1 pair statuses rule 8).
begin;
\ir _helpers.psql
select plan(42);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_user('client_h');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_f', 'trial', 'trial_link');
select tests.create_pair('trainer_a', 'client_g', 'trial', 'trial_link');
select tests.create_pair('trainer_a', 'client_h', 'trial', 'trial_link');

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
create function tests.slot_status(p_slot uuid) returns text language sql stable set search_path = '' as $$
  select coalesce((select s.status::text from public.slots s where s.id = p_slot), 'gone')
$$;
create function tests.add_slot(p_trainer text, p_starts_at timestamptz) returns uuid language sql set search_path = '' as $$
  insert into public.slots (trainer_id, starts_at, ends_at)
  values (tests.user_id(p_trainer), p_starts_at, p_starts_at + interval '1 hour') returning id
$$;

-- Trainer A: free cancellation until 24 h before (the default), a drop-in price of 2 500 ₽.
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to)
values (tests.u('trainer_a'), 'Разовое', 1, 250000, 'RUB', 'personal');
insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 3, 900000));
insert into tests.ids values ('pass_e', tests.create_pass('trainer_a', 'client_e', 1, 300000));

insert into tests.ids values ('slot_3d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '3 days'));
insert into tests.ids values ('slot_4d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '4 days'));
insert into tests.ids values ('slot_5d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '5 days'));
insert into tests.ids values ('slot_6d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '6 days'));
insert into tests.ids values ('slot_5h', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '5 hours'));
insert into tests.ids values ('slot_7h', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '7 hours'));
insert into tests.ids values ('slot_b', tests.add_slot('trainer_b', date_trunc('hour', now()) + interval '5 days'));

-- =========================================================================================================
-- cancel_my_booking: free until the deadline (PRD 2.6.5-1, -2)
-- =========================================================================================================

select tests.authenticate_as('client_c');
insert into tests.ids select 'b_free', booking_id from public.book_slot(tests.id('slot_3d'));
insert into tests.ids select 'b_late', booking_id from public.book_slot(tests.id('slot_5h'));
select tests.clear_authentication();

select tests.authenticate_as('client_e');
select throws_ok(
  format($$ select public.cancel_my_booking(%L) $$, tests.id('b_free')),
  'P0002', 'booking_not_found', 'cancel: another client cannot cancel the booking'
);
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select throws_ok(
  format($$ select public.cancel_my_booking(%L, repeat('x', 501)) $$, tests.id('b_free')),
  '22023', 'invalid_reason', 'cancel: a reason is at most 500 characters'
);
select is(public.cancel_my_booking(tests.id('b_free'), '  Заболел  ')::text, 'cancelled',
  'cancel: before the deadline the booking is cancelled');
select throws_ok(
  format($$ select public.cancel_my_booking(%L) $$, tests.id('b_free')),
  'P0002', 'booking_not_found', 'cancel: a cancelled booking cannot be cancelled again'
);
select tests.clear_authentication();

select results_eq(
  $$ select status::text, cancelled_by_role::text, cancel_reason from public.bookings where id = tests.id('b_free') $$,
  $$ values ('cancelled'::text, 'client'::text, 'Заболел'::text) $$,
  'cancel: the client and the trimmed reason are kept'
);
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_free')), 0::bigint,
  'cancel: a free cancellation takes nothing');
select is(tests.slot_status(tests.id('slot_3d')), 'open', 'cancel: the slot is offered again');
select is(
  (select s.status::text from public.sessions s join public.bookings b on b.session_id = s.id where b.id = tests.id('b_free')),
  'cancelled', 'cancel: the personal session is cancelled');
select results_eq(
  $$ select payload ->> 'late', payload ->> 'reason' from public.notification_outbox
     where type = 'booking_cancelled_by_client' and booking_id = tests.id('b_free') and user_id = tests.u('trainer_a') $$,
  $$ values ('false'::text, 'Заболел'::text) $$,
  'cancel: the trainer gets Т3'
);
select is(
  (select payload ->> 'deadline_hours' from public.booking_events where booking_id = tests.id('b_free') and to_status = 'cancelled'),
  '24', 'cancel: the deadline rule is written to the history');

-- =========================================================================================================
-- cancel_my_booking: a late cancellation takes a session (PRD 2.6.5-3, 2.6.6-2)
-- =========================================================================================================

select tests.authenticate_as('client_c');
select throws_ok(
  format($$ select public.cancel_my_booking(%L) $$, tests.id('b_late')),
  'P0001', 'late_cancel', 'late: without the client''s yes nothing happens'
);
select is((select status::text from public.bookings where id = tests.id('b_late')), 'confirmed',
  'late: the booking stays confirmed');
select is(public.cancel_my_booking(tests.id('b_late'), null, true)::text, 'late_cancelled',
  'late: with the yes the booking is late_cancelled');
select tests.clear_authentication();

select results_eq(
  $$ select pass_id, charge_reason::text, amount_minor from public.ledger_entries
     where booking_id = tests.id('b_late') and entry_type = 'charge' $$,
  $$ select tests.id('pass_c'), 'late_cancel'::text, 300000::bigint $$,
  'late: one session is taken from the pass'
);
select is(tests.left_on(tests.id('pass_c')), 2::bigint, 'late: the pass has 2 sessions left');
select is(
  (select count(*) from public.notification_outbox
   where type = 'charge_posted' and user_id = tests.u('client_c') and payload ->> 'reason' = 'late_cancel'),
  1::bigint, 'late: the client gets К8');
select is(
  (select payload ->> 'late' from public.notification_outbox
   where type = 'booking_cancelled_by_client' and booking_id = tests.id('b_late')),
  'true', 'late: Т3 says it was late');
select is(tests.slot_status(tests.id('slot_5h')), 'open', 'late: the slot is offered again');

-- A group keeps going: one seat more.
insert into tests.ids values ('s_group', tests.create_session('trainer_a', now() + interval '3 days', 'group', 5));
insert into tests.ids values ('b_group', tests.create_booking(tests.id('s_group'), 'trainer_a', 'client_c'));
select tests.authenticate_as('client_c');
select is(public.cancel_my_booking(tests.id('b_group'))::text, 'cancelled', 'group: the client cancels a group booking');
select tests.clear_authentication();
select is((select status::text from public.sessions where id = tests.id('s_group')), 'scheduled',
  'group: the group session stays');

-- =========================================================================================================
-- Reschedule (PRD 2.6.5): before the deadline, to a free slot of the same trainer
-- =========================================================================================================

select tests.authenticate_as('client_e');
insert into tests.ids select 'b_move', booking_id from public.book_slot(tests.id('slot_4d'));
select results_eq(
  $$ select confirmed, pass_title, sessions_left from public.booking_preview(tests.id('slot_5d')) $$,
  $$ values (false, null::text, null::integer) $$,
  'preview: a plain booking would be a request, the only session is reserved'
);
select results_eq(
  $$ select confirmed, pass_title, sessions_left from public.reschedule_preview(tests.id('b_move'), tests.id('slot_5d')) $$,
  $$ values (true, '1 sessions'::text, 0) $$,
  'preview: moving counts the old booking as moved, so the pass covers it'
);
select is((select status::text from public.bookings where id = tests.id('b_move')), 'confirmed',
  'preview: the booking is unchanged');
select throws_ok(
  format($$ select * from public.reschedule_preview(%L, %L) $$, tests.id('b_move'), tests.id('slot_b')),
  'P0001', 'slot_unavailable', 'preview: not to a slot of another trainer'
);
insert into tests.ids select 'b_new', booking_id from public.reschedule_my_booking(tests.id('b_move'), tests.id('slot_5d'));
select tests.clear_authentication();

select results_eq(
  $$ select status::text, rescheduled_to_id, cancelled_by_role::text from public.bookings where id = tests.id('b_move') $$,
  $$ select 'rescheduled'::text, tests.id('b_new'), 'client'::text $$,
  'move: the old booking is rescheduled to the new one'
);
select results_eq(
  $$ select b.status::text, b.reserved_pass_id, s.starts_at from public.bookings b join public.sessions s on s.id = b.session_id
     where b.id = tests.id('b_new') $$,
  $$ select 'confirmed'::text, tests.id('pass_e'), date_trunc('hour', now()) + interval '5 days' $$,
  'move: the new booking is confirmed on the pass at the new time'
);
select is(tests.slot_status(tests.id('slot_4d')), 'open', 'move: the old slot is offered again');
select is(tests.slot_status(tests.id('slot_5d')), 'booked', 'move: the new slot is booked');
select results_eq(
  $$ select type::text, (payload ->> 'rescheduled_from')::timestamptz from public.notification_outbox
     where user_id = tests.u('trainer_a') and booking_id = tests.id('b_new') $$,
  $$ values ('booking_rescheduled'::text, date_trunc('hour', now()) + interval '4 days') $$,
  'move: the trainer gets one message about the move'
);
select is((select count(*) from public.ledger_entries where booking_id in (tests.id('b_move'), tests.id('b_new'))),
  0::bigint, 'move: a move takes nothing');

select tests.authenticate_as('client_e');
select throws_ok(
  format($$ select * from public.reschedule_my_booking(%L, %L) $$, tests.id('b_move'), tests.id('slot_6d')),
  'P0002', 'booking_not_found', 'move: a moved booking cannot be moved again'
);
select tests.clear_authentication();
select tests.authenticate_as('client_c');
insert into tests.ids select 'b_soon', booking_id from public.book_slot(tests.id('slot_7h'));
select throws_ok(
  format($$ select * from public.reschedule_my_booking(%L, %L) $$, tests.id('b_soon'), tests.id('slot_6d')),
  'P0001', 'deadline_passed', 'move: not after the deadline'
);
select tests.clear_authentication();

-- =========================================================================================================
-- Trials: a free one takes nothing even with a pass, a paid one is charged from a drop-in pass
-- =========================================================================================================

with l as (
  insert into public.trial_links (trainer_id, title, price_minor, currency)
  values (tests.u('trainer_a'), 'Пробное за 1 500', 150000, 'RUB') returning id)
insert into tests.ids select 'link_paid', id from l;
update public.coachings set trial_link_id = tests.id('link_paid')
where id in (tests.pair_id('trainer_a', 'client_f'), tests.pair_id('trainer_a', 'client_g'));

insert into tests.ids values ('s_trial_f', tests.create_session('trainer_a', now() - interval '3 hours', 'trial'));
update public.sessions set trial_link_id = tests.id('link_paid') where id = tests.id('s_trial_f');
insert into tests.ids values ('b_trial_f', tests.create_booking(tests.id('s_trial_f'), 'trainer_a', 'client_f', 'confirmed', 'trial'));
insert into tests.ids values ('s_trial_g', tests.create_session('trainer_a', now() - interval '4 hours', 'trial'));
insert into tests.ids values ('b_trial_g', tests.create_booking(tests.id('s_trial_g'), 'trainer_a', 'client_g', 'confirmed', 'trial'));
insert into tests.ids values ('s_trial_h', tests.create_session('trainer_a', now() - interval '5 hours', 'trial'));
insert into tests.ids values ('b_trial_h', tests.create_booking(tests.id('s_trial_h'), 'trainer_a', 'client_h', 'confirmed', 'trial'));

select tests.authenticate_as('trainer_a');
select is(public.mark_attendance(tests.id('b_trial_g'), 'no_show')::text, 'no_show', 'trial: the trainer marks a no-show');
select tests.clear_authentication();
select is((select status::text from public.coachings where id = tests.pair_id('trainer_a', 'client_g')), 'trial',
  'trial: a no-show keeps the pair in trial, its drop-in pass does not count as a sale');
select results_eq(
  $$ select p.is_drop_in, p.price_minor, p.title, e.amount_minor, e.charge_reason::text
     from public.ledger_entries e join public.passes p on p.id = e.pass_id
     where e.booking_id = tests.id('b_trial_g') and e.entry_type = 'charge' $$,
  $$ values (true, 150000::bigint, 'Пробное за 1 500'::text, 150000::bigint, 'no_show'::text) $$,
  'trial: a paid trial is charged from a drop-in pass at the link''s price'
);

insert into tests.ids values ('pass_h', tests.create_pass('trainer_a', 'client_h', 5));
select is((select status::text from public.coachings where id = tests.pair_id('trainer_a', 'client_h')), 'active',
  'pair: a pass sale makes a trial pair active');

select ok(private.complete_sessions() >= 2, 'trial: the ended trials are completed');
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_trial_h')), 0::bigint,
  'trial: a free trial never takes a session from a pass');
select is(tests.left_on(tests.id('pass_h')), 5::bigint, 'trial: the pass keeps its 5 sessions');
select results_eq(
  $$ select p.is_drop_in, e.amount_minor, e.charge_reason::text, (select coalesce(sum(x.sessions_delta), 0) from public.ledger_entries x where x.pass_id = p.id)
     from public.ledger_entries e join public.passes p on p.id = e.pass_id
     where e.booking_id = tests.id('b_trial_f') and e.entry_type = 'charge' $$,
  $$ values (true, 150000::bigint, 'attended'::text, 0::bigint) $$,
  'trial: an attended paid trial uses up its drop-in pass'
);
select is((select status::text from public.coachings where id = tests.pair_id('trainer_a', 'client_f')), 'active',
  'pair: an attended trial makes the pair active');
select is(
  (select count(*) from public.passes p join public.pass_balances pb on pb.pass_id = p.id
   where p.coaching_id = tests.pair_id('trainer_a', 'client_f') and pb.unpaid_minor = 150000),
  1::bigint, 'trial: the drop-in pass waits for its payment');

select * from finish();
rollback;

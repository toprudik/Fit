-- Debt limit for self-booking (migration 20261018194117_debt_limit_one_session.sql, docs/decisions.md Q22): a
-- client allowed to book in debt holds at most one unpaid session by default, counting future booked sessions that
-- no pass covers; the trainer books in debt with no limit.
begin;
\ir _helpers.psql
select plan(13);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_user('client_h');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_a', 'client_f');
select tests.create_pair('trainer_a', 'client_g');
select tests.create_pair('trainer_a', 'client_h');
select tests.pair_id('trainer_a', 'client_c') as pair_ac, tests.pair_id('trainer_a', 'client_d') as pair_ad \gset

create function tests.next_day(p_isodow int) returns date language sql stable set search_path = '' as $$
  select d::date from pg_catalog.generate_series((now() at time zone 'Europe/Moscow')::date + 7,
    (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d where extract(isodow from d) = p_isodow
$$;
create function tests.at(p_day date, p_time time) returns timestamptz language sql stable set search_path = '' as $$
  select (p_day + p_time) at time zone 'Europe/Moscow'
$$;
create function tests.slot(p_time time) returns uuid language sql stable set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.starts_at = tests.at(tests.next_day(2), p_time) and s.status <> 'closed'
$$;
create function tests.slot4(p_time time) returns uuid language sql stable set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.starts_at = tests.at(tests.next_day(4), p_time) and s.status <> 'closed'
$$;

select is((select debt_limit_sessions from public.coachings where id = :'pair_ac'), 1::smallint,
  'a new pair allows one unpaid session by default');

select tests.authenticate_as('trainer_a');
select public.save_week_template(
  '[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60},
    {"iso_weekday": 4, "start_time": "09:00", "end_time": "14:00", "duration_min": 60}]');
select tests.clear_authentication();
update public.coachings set self_book_on_debt = true where trainer_id = tests.user_id('trainer_a');

-- Client C: no pass, no debt. The first session is confirmed in debt, the second goes to the trainer.
select tests.authenticate_as('client_c');
select is((select status::text from public.book_slot(tests.slot('09:00'))), 'confirmed',
  'the first session without a pass is confirmed in debt');
select is((select confirmed from public.booking_preview(tests.slot('10:00'))), false,
  'the preview says the next one needs the trainer');
select is((select status::text from public.book_slot(tests.slot('10:00'))), 'requested',
  'the second unpaid session comes to the trainer as a request');
select tests.clear_authentication();

-- Client D already owes a charged session: they cannot book in debt on their own.
select tests.create_session('trainer_a', now() - interval '2 days') as past \gset
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (:'pair_ad', 'charge', -1, tests.create_booking(:'past', 'trainer_a', 'client_d', 'attended'), 'attended',
        now() - interval '2 days');
select tests.authenticate_as('client_d');
select is((select status::text from public.book_slot(tests.slot('11:00'))), 'requested',
  'a client with a charged debt session books only by request');
select tests.clear_authentication();

-- The trainer books the same client in debt with no limit, by confirming a request or by scheduling.
select b.id as request_d from public.bookings b join public.sessions s on s.id = b.session_id
where s.slot_id = tests.slot('11:00') \gset
select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.decide_booking(%L, true) $$, :'request_d'), 'the trainer confirms the request');
select lives_ok(format($$ select * from public.create_session(%L, %L, 60::smallint, 'offline') $$,
  :'pair_ad', tests.at(tests.next_day(3), '10:00')), 'the trainer schedules another session');
select tests.clear_authentication();
select is((select count(*)::integer from public.bookings
           where coaching_id = :'pair_ad' and status = 'confirmed' and reserved_pass_id is null), 2,
  'both trainer bookings are confirmed in debt');

-- A pass covers the next session again.
select tests.create_pass('trainer_a', 'client_c', 5, 500000);
select tests.authenticate_as('client_c');
select is((select status::text from public.book_slot(tests.slot('12:00'))), 'confirmed',
  'with a pass the client books on their own again');
select tests.clear_authentication();

-- A session reserved against a pass is paid, so it does not count toward the limit.
select tests.create_pass('trainer_a', 'client_e', 1, 100000);
select tests.authenticate_as('client_e');
select (select status::text from public.book_slot(tests.slot4('09:00'))) as e_first \gset
select is((select status::text from public.book_slot(tests.slot4('10:00'))), 'confirmed',
  'a session covered by the pass leaves room for one session in debt');
select tests.clear_authentication();

-- A trial is paid on its own terms and does not count either.
select tests.create_session('trainer_a', now() + interval '3 days') as trial_session \gset
select tests.create_booking(:'trial_session', 'trainer_a', 'client_f', 'confirmed') as trial_booking \gset
update public.bookings set source = 'trial' where id = :'trial_booking';
select tests.authenticate_as('client_f');
select is((select status::text from public.book_slot(tests.slot4('11:00'))), 'confirmed',
  'a confirmed trial leaves room for one session in debt');
select tests.clear_authentication();

-- A check-in before the session is not charged yet, but it is still an unpaid session.
select tests.create_session('trainer_a', now() + interval '15 minutes') as soon \gset
select tests.create_booking(:'soon', 'trainer_a', 'client_g', 'attended');
select tests.authenticate_as('client_g');
select is((select status::text from public.book_slot(tests.slot4('12:00'))), 'requested',
  'a checked-in session not charged yet counts toward the limit');
select tests.clear_authentication();

-- A charged session counts once: with a limit of 2 and one charged, the client books one more.
update public.coachings set debt_limit_sessions = 2 where id = tests.pair_id('trainer_a', 'client_h');
select tests.create_session('trainer_a', now() - interval '3 days') as past_h \gset
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_h'), 'charge', -1,
        tests.create_booking(:'past_h', 'trainer_a', 'client_h', 'attended'), 'attended', now() - interval '3 days');
select tests.authenticate_as('client_h');
select is((select status::text from public.book_slot(tests.slot4('13:00'))), 'confirmed',
  'a charged session is not counted twice');
select tests.clear_authentication();

select * from finish();
rollback;

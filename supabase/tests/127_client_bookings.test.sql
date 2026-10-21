-- Client bookings of migration 20261016221900_client_bookings.sql (PRD wave-1 §2.6.4, §2.6.5-6, data-model
-- §3.5): booking_auto_confirm, booking_preview, book_slot, decide_booking, withdraw_booking_request and the
-- request expiry job.
begin;
\ir _helpers.psql
select plan(51);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_d');
select tests.pair_id('trainer_a', 'client_c') as pair_ac \gset

-- The day of the given ISO weekday 7 to 13 days ahead in Moscow, and an instant on it.
create function tests.next_day(p_isodow int) returns date language sql stable set search_path = '' as $$
  select d::date from pg_catalog.generate_series((now() at time zone 'Europe/Moscow')::date + 7,
    (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d where extract(isodow from d) = p_isodow
$$;
create function tests.at(p_day date, p_time time) returns timestamptz language sql stable set search_path = '' as $$
  select (p_day + p_time) at time zone 'Europe/Moscow'
$$;
create function tests.slot(p_day date, p_time time) returns uuid language sql stable set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.starts_at = tests.at(p_day, p_time) and s.status <> 'closed'
$$;
create function tests.slot_status(p_slot uuid) returns text language sql stable set search_path = '' as $$
  select coalesce((select s.status::text from public.slots s where s.id = p_slot), 'gone')
$$;

select tests.authenticate_as('trainer_a');
select public.save_week_template(
  '[{"iso_weekday": 2, "start_time": "09:00", "end_time": "13:00", "duration_min": 60},
    {"iso_weekday": 4, "start_time": "09:00", "end_time": "11:00", "duration_min": 60, "mode": "online",
     "meeting_url": "https://meet.example/a"}]');
select tests.clear_authentication();
select tests.slot(tests.next_day(2), '09:00') as slot9, tests.slot(tests.next_day(2), '10:00') as slot10,
       tests.slot(tests.next_day(2), '11:00') as slot11, tests.slot(tests.next_day(2), '12:00') as slot12,
       tests.slot(tests.next_day(4), '09:00') as slot_online \gset

-- =========================================================================================================
-- Who may book (PRD 2.6.4-1): only a client of a live pair with the trainer, only a free slot past the notice

select tests.authenticate_as('client_d');
select throws_ok(format($$ select * from public.booking_preview(%L) $$, :'slot10'), 'P0001', 'slot_unavailable',
  'preview: not for a client of another trainer');
select throws_ok(format($$ select * from public.book_slot(%L) $$, :'slot10'), 'P0001', 'slot_unavailable',
  'book: not for a client of another trainer');
select tests.clear_authentication();

insert into public.slots (trainer_id, starts_at, ends_at) values
  (tests.user_id('trainer_a'), now() + interval '1 hour', now() + interval '2 hours')
returning id as slot_soon \gset
select tests.authenticate_as('client_c');
select throws_ok(format($$ select * from public.book_slot(%L) $$, :'slot_soon'), 'P0001', 'too_late',
  'book: not sooner than the trainer''s booking notice');
select throws_ok($$ select * from public.book_slot(gen_random_uuid()) $$, 'P0001', 'slot_unavailable', 'book: an unknown slot');

-- =========================================================================================================
-- No pass: a request that holds the slot (2.6.4-2, 2.6.4-4)

select is((select row(confirmed, pass_title, sessions_left)::text from public.booking_preview(:'slot10')),
  row(false, null::text, null::int)::text, 'preview: without a pass the booking is a request');
select is((select status::text from public.book_slot(:'slot10')), 'requested', 'book: a request');
select is((select count(*)::int from public.slots s where s.id = :'slot10'), 0, 'book: other clients no longer see the slot');
select throws_ok(format($$ select * from public.book_slot(%L) $$, :'slot10'), 'P0001', 'slot_unavailable',
  'book: a held slot cannot be booked again');
select tests.clear_authentication();

select is(tests.slot_status(:'slot10'), 'booked', 'book: the slot is booked');
select b.id as request1 from public.bookings b join public.sessions s on s.id = b.session_id where s.slot_id = :'slot10' \gset
select is(
  (select row(s.kind, s.status, s.trainer_id = tests.user_id('trainer_a'), s.ends_at - s.starts_at)::text
   from public.sessions s where s.slot_id = :'slot10'),
  row('personal'::public.session_kind, 'scheduled'::public.session_status, true, interval '1 hour')::text,
  'book: a personal session on the slot');
select is(
  (select row(b.status, b.source, b.requested_at is not null, b.confirmed_at is null, b.reserved_pass_id is null)::text
   from public.bookings b where b.id = :'request1'),
  row('requested'::public.booking_status, 'client_slot'::public.booking_source, true, true, true)::text,
  'book: the booking is a request from a slot');
select is(
  (select row(e.to_status, e.actor_role)::text from public.booking_events e where e.booking_id = :'request1'),
  row('requested'::public.booking_status, 'client'::public.actor_role)::text, 'book: the request has its history row');
select is(
  (select row(o.user_id = tests.user_id('trainer_a'), o.booking_id = :'request1', o.payload ? 'first_name',
              o.payload ->> 'debt')::text
   from public.notification_outbox o where o.type = 'booking_requested'),
  row(true, true, true, 'false')::text, 'book: the trainer gets Т2 naming the client');

-- withdraw_booking_request (2.6.5-6)
select tests.authenticate_as('client_d');
select throws_ok(format($$ select public.withdraw_booking_request(%L) $$, :'request1'), 'P0001', 'request_not_found',
  'withdraw: only the client''s own request');
select tests.authenticate_as('client_c');
select lives_ok(format($$ select public.withdraw_booking_request(%L) $$, :'request1'), 'withdraw: the client takes it back');
select throws_ok(format($$ select public.withdraw_booking_request(%L) $$, :'request1'), 'P0001', 'request_not_found',
  'withdraw: only while it is a request');
select tests.clear_authentication();
select is(
  (select row(b.status, b.cancelled_by_role)::text from public.bookings b where b.id = :'request1'),
  row('cancelled'::public.booking_status, 'client'::public.actor_role)::text, 'withdraw: the booking is cancelled by the client');
select is((select s.status::text from public.sessions s join public.bookings b on b.session_id = s.id where b.id = :'request1'),
  'cancelled', 'withdraw: its session is cancelled');
select is(tests.slot_status(:'slot10'), 'open', 'withdraw: the slot is free again');
select is(
  (select o.payload ->> 'request' from public.notification_outbox o where o.type = 'booking_cancelled_by_client'),
  'true', 'withdraw: the trainer is told');

-- decide_booking: decline (2.6.4)
select tests.authenticate_as('client_c');
select (select booking_id from public.book_slot(:'slot10')) as request2 \gset
select throws_ok(format($$ select public.decide_booking(%L, false) $$, :'request2'), 'P0001', 'request_not_found',
  'decide: not the client');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select public.decide_booking(%L, true) $$, :'request2'), 'P0001', 'request_not_found',
  'decide: not another trainer');
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(:'request2', false, ' Этот час занят '), 'declined'::public.booking_status,
  'decide: the trainer declines');
select throws_ok(format($$ select public.decide_booking(%L, true) $$, :'request2'), 'P0001', 'request_not_found',
  'decide: only once');
select tests.clear_authentication();
select is(
  (select row(b.cancel_reason, b.decided_by = tests.user_id('trainer_a'))::text from public.bookings b where b.id = :'request2'),
  row('Этот час занят', true)::text, 'decide: the decline keeps the reason');
select is(tests.slot_status(:'slot10'), 'open', 'decide: a declined request frees the slot');
select is(
  (select row(o.user_id = tests.user_id('client_c'), o.payload ->> 'reason', o.payload ? 'first_name')::text
   from public.notification_outbox o where o.type = 'booking_declined'),
  row(true, 'Этот час занят', true)::text, 'decide: the client gets К3 with the reason');

-- decide_booking: confirm without a pass goes to debt when charged (2.6.4-6)
select tests.authenticate_as('client_c');
select (select booking_id from public.book_slot(:'slot11')) as request3 \gset
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(:'request3', true), 'confirmed'::public.booking_status, 'decide: the trainer confirms');
select tests.clear_authentication();
select is(
  (select row(b.status, b.confirmed_at is not null, b.reserved_pass_id is null)::text from public.bookings b where b.id = :'request3'),
  row('confirmed'::public.booking_status, true, true)::text, 'decide: confirmed without a pass');
select is(tests.slot_status(:'slot11'), 'booked', 'decide: the slot stays booked');
select is((select count(*)::int from public.notification_outbox o where o.type = 'booking_confirmed' and o.booking_id = :'request3'),
  1, 'decide: the client gets К2');

-- =========================================================================================================
-- Auto-confirmation (2.6.4-2, data-model §3.5)

select tests.create_pass('trainer_a', 'client_c', 1) as pass1 \gset
select tests.authenticate_as('client_c');
select is((select row(confirmed, pass_title, sessions_left)::text from public.booking_preview(:'slot12')),
  row(true, '1 sessions', 0)::text, 'preview: a pass with a free session confirms, none left after');
select is((select status::text from public.book_slot(:'slot12')), 'confirmed', 'book: confirmed against the pass');
select tests.clear_authentication();
select is(
  (select row(b.reserved_pass_id = :'pass1', b.source)::text from public.bookings b
   join public.sessions s on s.id = b.session_id where s.slot_id = :'slot12'),
  row(true, 'client_slot'::public.booking_source)::text, 'book: the booking is reserved against the pass');
select is(
  (select row(o.user_id = tests.user_id('trainer_a'), o.payload ->> 'debt')::text from public.notification_outbox o
   where o.type = 'booking_created'),
  row(true, 'false')::text, 'book: the trainer gets Т1');
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(2), '09:00'))),
  false, 'auto: a pass with every session reserved does not confirm');

-- Passes that do not fit: frozen on the day, expired before the start, for group sessions only, not started yet.
select tests.create_pass('trainer_a', 'client_c', 5) as pass_frozen \gset
insert into public.pass_freezes (pass_id, period) values
  (:'pass_frozen', daterange(tests.next_day(2), tests.next_day(2) + 1));
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(2), '09:00'))),
  false, 'auto: a pass frozen on the session date does not confirm');
select is((select pass_id = :'pass_frozen' from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  true, 'auto: the same pass confirms on another day');
select set_config('fit.change_reason', 'test', true);
update public.passes set expires_at = now() + interval '2 days' where id = :'pass_frozen';
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  false, 'auto: a pass expiring before the session does not confirm');
update public.passes set expires_at = null, applies_to = 'group' where id = :'pass_frozen';
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  false, 'auto: a group pass does not confirm a personal session');
update public.passes set applies_to = 'any', starts_on = tests.next_day(4) + 1 where id = :'pass_frozen';
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  false, 'auto: a pass sold after the session date does not confirm');
update public.passes set status = 'cancelled', cancelled_at = now() where id = :'pass_frozen';

-- Debt allowed by the trainer (§2.8-9), up to the limit. The confirmed request above is one unpaid session already,
-- so the limit is raised to 2 here; the default of 1 is covered in 979_debt_limit.
update public.coachings set self_book_on_debt = true, debt_limit_sessions = 2 where id = :'pair_ac';
select is((select row(confirmed, pass_id)::text from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  row(true, null::uuid)::text, 'auto: allowed debt confirms without a pass');
select tests.create_session('trainer_a', now() - interval '2 days') as past \gset
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (:'pair_ac', 'charge', -1, tests.create_booking(:'past', 'trainer_a', 'client_c', 'attended'), 'attended', now() - interval '2 days');
update public.coachings set debt_limit_sessions = 1 where id = :'pair_ac';
select is((select confirmed from private.booking_auto_confirm(:'pair_ac', 'personal', tests.at(tests.next_day(4), '09:00'))),
  false, 'auto: not past the debt limit');

-- =========================================================================================================
-- Online slots take the template link; unanswered requests expire (2.6.4-5)

-- Without the permission a client holds one unpaid session at a time: clear the two above first.
update public.coachings set self_book_on_debt = false where id = :'pair_ac';
select private.waive_entry(e.id, 'QA') from public.ledger_entries e where e.coaching_id = :'pair_ac' and e.entry_type = 'charge';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = tests.user_id('trainer_a'), cancelled_by_role = 'trainer', cancel_reason = 'QA' where id = :'request3';
select tests.authenticate_as('client_c');
select (select booking_id from public.book_slot(:'slot_online')) as request4 \gset
select tests.clear_authentication();
select is(
  (select row(s.mode, s.meeting_url)::text from public.sessions s join public.bookings b on b.session_id = s.id where b.id = :'request4'),
  row('online'::public.session_mode, 'https://meet.example/a')::text, 'book: an online session gets the template link');

select is(private.expire_booking_requests(), 0, 'expire: nothing before the start');
update public.sessions s set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes'
from public.bookings b where b.session_id = s.id and b.id = :'request4';
select is(private.expire_booking_requests(), 1, 'expire: a request unanswered at the start');
select is(
  (select row(b.status, s.status)::text from public.bookings b join public.sessions s on s.id = b.session_id where b.id = :'request4'),
  row('expired'::public.booking_status, 'cancelled'::public.session_status)::text, 'expire: the booking expires and the session goes');
select is((select o.user_id = tests.user_id('client_c') from public.notification_outbox o where o.type = 'booking_expired'),
  true, 'expire: the client gets К4');
select is((select count(*)::int from cron.job where jobname = 'booking-requests-expire'), 1, 'expire: the job is scheduled');

-- =========================================================================================================
-- Privileges

select ok(not has_function_privilege('anon', 'public.book_slot(uuid)', 'execute'), 'privileges: anon cannot book');
select ok(not has_function_privilege('authenticated', 'private.booking_auto_confirm(uuid, public.session_kind, timestamptz)', 'execute'),
  'privileges: the auto-confirm rule is not an RPC');

select * from finish();
rollback;

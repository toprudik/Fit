-- Trial booking of migration 20261016225300_trial_booking.sql (PRD wave-1 §2.3 rules 4–6, SHOP-5..6, R23, R39):
-- get_trial_slots for anyone, book_trial, "never twice", and decide_booking not reserving a pass for a trial.
begin;
\ir _helpers.psql
select plan(35);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('new_n');
select tests.create_user('client_c');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');

-- The day of the given ISO weekday 7 to 13 days ahead in Moscow, and a slot of trainer_a on it.
create function tests.next_day(p_isodow int) returns date language sql stable set search_path = '' as $$
  select d::date from pg_catalog.generate_series((now() at time zone 'Europe/Moscow')::date + 7,
    (now() at time zone 'Europe/Moscow')::date + 13, interval '1 day') d where extract(isodow from d) = p_isodow
$$;
create function tests.slot(p_trainer text, p_day date, p_time time) returns uuid language sql stable set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id(p_trainer) and s.starts_at = (p_day + p_time) at time zone 'Europe/Moscow'
    and s.status <> 'closed'
$$;
create function tests.slot_status(p_slot uuid) returns text language sql stable set search_path = '' as $$
  select coalesce((select s.status::text from public.slots s where s.id = p_slot), 'gone')
$$;

select tests.authenticate_as('trainer_a');
select public.save_week_template(
  '[{"iso_weekday": 2, "start_time": "09:00", "end_time": "12:00", "duration_min": 60},
    {"iso_weekday": 4, "start_time": "09:00", "end_time": "10:00", "duration_min": 60, "mode": "online",
     "meeting_url": "https://meet.example/a"}]');
insert into public.trial_links (trainer_id, title, duration_min, currency)
values (tests.user_id('trainer_a'), 'Знакомство', 45, 'RUB');
insert into public.trial_links (trainer_id, title, duration_min, currency, mode)
values (tests.user_id('trainer_a'), 'Онлайн', 60, 'RUB', 'online');
insert into public.trial_links (trainer_id, title, duration_min, currency)
values (tests.user_id('trainer_a'), 'Длинное', 90, 'RUB');
select tests.authenticate_as('trainer_b');
select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "10:00", "duration_min": 60}]');
select tests.clear_authentication();

select token as free, id as free_id from public.trial_links where title = 'Знакомство' \gset
select token as online from public.trial_links where title = 'Онлайн' \gset
select token as long from public.trial_links where title = 'Длинное' \gset
select tests.slot('trainer_a', tests.next_day(2), '09:00') as slot9, tests.slot('trainer_a', tests.next_day(2), '10:00') as slot10,
       tests.slot('trainer_a', tests.next_day(2), '11:00') as slot11, tests.slot('trainer_a', tests.next_day(4), '09:00') as slot_online,
       tests.slot('trainer_b', tests.next_day(2), '09:00') as slot_b \gset

-- =========================================================================================================
-- get_trial_slots: anyone sees the free slots the trial fits in (R23)

select tests.authenticate_as_anon();
select is(
  (select ends_at - starts_at from public.get_trial_slots(:'free') where slot_id = :'slot9'), interval '45 minutes',
  'slots: anyone sees a free slot, ending after the trial length');
select ok((select count(*) from public.get_trial_slots(:'free')) >= 4, 'slots: offline and online slots for a link without a format');
select ok(
  (select bool_and(mode = 'online') and count(*) > 0 from public.get_trial_slots(:'online')),
  'slots: a link set to online lists only online slots');
select is((select count(*)::int from public.get_trial_slots(:'long')), 0, 'slots: none shorter than the trial');
select is((select count(*)::int from public.get_trial_slots('nope')), 0, 'slots: none for an unknown token');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), '42501', null,
  'book: anon cannot book');

select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.get_trial_slots(:'free')), 0, 'slots: none on the trainer''s own link');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), 'P0001', 'own_invite',
  'book: not on the trainer''s own link');

select tests.authenticate_as('client_c');
select is((select count(*)::int from public.get_trial_slots(:'free')), 0, 'slots: none for an existing client');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), 'P0001', 'already_client',
  'book: an existing client gets no trial');

-- Wrong slots
select tests.authenticate_as('stranger_s');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot_b'), 'P0001', 'slot_unavailable',
  'book: not a slot of another trainer');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'online', :'slot9'), 'P0001', 'slot_unavailable',
  'book: not a slot in another format than the link''s');
select tests.clear_authentication();
update public.slots set allow_trial = false where id = :'slot11';
insert into public.slots (trainer_id, starts_at, ends_at) values
  (tests.user_id('trainer_a'), now() + interval '1 hour', now() + interval '2 hours');
select s.id as slot_soon from public.slots s where s.trainer_id = tests.user_id('trainer_a') and s.starts_at < now() + interval '1 day' \gset
select tests.authenticate_as('stranger_s');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot11'), 'P0001', 'slot_unavailable',
  'book: not a slot closed to trials');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot_soon'), 'P0001', 'too_late',
  'book: not sooner than the trainer''s booking notice');
select is((select count(*)::int from public.coachings), 0, 'book: a failed booking makes no pair');

-- =========================================================================================================
-- book_trial: a new person becomes a trial client with a request (SHOP-5, PRD 2.3-5)

select tests.authenticate_as('new_n');
select lives_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), 'book: a new person books a trial');
select tests.clear_authentication();

select tests.pair_id('trainer_a', 'new_n') as pair_n \gset
select b.id as trial1 from public.bookings b where b.coaching_id = :'pair_n' \gset
select is(
  (select row(c.status, c.source, c.trial_link_id = :'free_id')::text from public.coachings c where c.id = :'pair_n'),
  row('trial'::public.coaching_status, 'trial_link'::public.coaching_source, true)::text,
  'book: the pair starts in status trial from the link');
select is((select uses_count from public.trial_links where id = :'free_id'), 1, 'book: the link counts the use');
select is(
  (select row(s.kind, s.title, s.ends_at - s.starts_at, s.trial_link_id = :'free_id')::text
   from public.sessions s where s.slot_id = :'slot9'),
  row('trial'::public.session_kind, 'Знакомство'::text, interval '45 minutes', true)::text,
  'book: a trial session with the link''s title and length');
select is(tests.slot_status(:'slot9'), 'booked', 'book: the slot is booked');
select is(
  (select row(b.status, b.source, b.reserved_pass_id is null)::text from public.bookings b where b.id = :'trial1'),
  row('requested'::public.booking_status, 'trial'::public.booking_source, true)::text,
  'book: never confirmed on its own, always a request');
select is(
  (select row(o.user_id = tests.user_id('trainer_a'), o.payload ->> 'trial')::text
   from public.notification_outbox o where o.type = 'booking_requested' and o.booking_id = :'trial1'),
  row(true, 'true')::text, 'book: the trainer gets Т2 marked as a trial');

-- One live trial per pair (R39)
select tests.authenticate_as('new_n');
select is((select count(*)::int from public.get_trial_slots(:'free')), 0, 'slots: none while a trial request is live');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot10'), 'P0001', 'trial_used',
  'book: one live trial request per pair');

-- A declined trial frees the slot and may be asked again
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(:'trial1', false, 'Занят'), 'declined'::public.booking_status, 'decline: the trainer declines');
select tests.clear_authentication();
select is(tests.slot_status(:'slot9'), 'open', 'decline: the slot is free again');
select is((select status::text from public.coachings where id = :'pair_n'), 'trial', 'decline: the pair stays a trial pair');

select tests.authenticate_as('new_n');
select ok((select count(*) from public.get_trial_slots(:'free')) > 0, 'slots: after a declined trial the person may ask again');
select lives_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot10'), 'book: a second request after a decline');
select tests.clear_authentication();
select is((select uses_count from public.trial_links where id = :'free_id'), 1, 'book: the same pair counts the use once');
select b.id as trial2 from public.bookings b where b.coaching_id = :'pair_n' and b.status = 'requested' \gset

-- A confirmed trial reserves no pass, even when one fits
select tests.create_pass('trainer_a', 'new_n', 5);
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(:'trial2', true), 'confirmed'::public.booking_status, 'confirm: the trainer confirms the trial');
select tests.clear_authentication();
select ok((select reserved_pass_id is null from public.bookings where id = :'trial2'), 'confirm: a trial reserves no pass');

select tests.authenticate_as('new_n');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), 'P0001', 'trial_used',
  'book: never twice once a trial is confirmed');

-- A pair made by "Стать клиентом" on a trial landing may still book its trial
select tests.authenticate_as('stranger_s');
select public.join_by_trial_link(:'free');
select ok((select count(*) from public.get_trial_slots(:'free')) > 0, 'slots: a client who joined through the trial link may book it');

-- A switched-off link books nothing
select tests.authenticate_as('trainer_a');
update public.trial_links set is_enabled = false where id = :'free_id';
select tests.authenticate_as('stranger_s');
select throws_ok(format($$ select * from public.book_trial(%L, %L) $$, :'free', :'slot9'), 'P0001', 'invite_invalid',
  'book: not through a switched-off link');

select * from finish();
rollback;

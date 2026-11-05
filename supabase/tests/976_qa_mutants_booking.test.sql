-- Booking branches that the pre-beta mutation run (04.11) broke without any test noticing: the trainer's seat over
-- the group size, which pass kind a preview counts, a move into debt, quiet hours at their very end, a past session
-- shorter than 15 minutes, a refund next to a payment report, and «Занятие перенесено» for a client who left a group.
begin;
\ir _helpers.psql
select plan(15);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_d', 'client_g', 'client_p', 'client_q', 'client_r',
  'client_s', 'client_w', 'client_x']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d', 'client_g', 'client_p', 'client_q',
  'client_r', 'client_s', 'client_w', 'client_x']) h;
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.slot(p_days int) returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.slots s
  where s.trainer_id = tests.user_id('trainer_a') and s.starts_at = date_trunc('hour', now()) + pg_catalog.make_interval(days => p_days)
$$;
grant execute on function tests.slot(int) to authenticated;
insert into public.slots (trainer_id, starts_at, ends_at)
select tests.user_id('trainer_a'), date_trunc('hour', now()) + make_interval(days => d),
       date_trunc('hour', now()) + make_interval(days => d, hours => 1)
from generate_series(8, 20) d;

-- =========================================================================================================
-- add_group_participant_extra

insert into tests.ids values
  ('expired_offer', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '1 day', 'group', 2)),
  ('own_offer', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days', 'group', 2)),
  ('started', tests.create_session('trainer_a', now() - interval '10 minutes', 'group', 5)),
  ('hundred', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '3 days', 'group', 100));
select tests.create_booking(tests.id(s), 'trainer_a', 'client_c') from unnest(array['expired_offer', 'own_offer']) s;
-- The free seat of the first group was offered to client_w, but the offer ran out; the seat of the second is on offer to them now.
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id, status, offered_at, offer_expires_at)
values (tests.id('expired_offer'), tests.pair_id('trainer_a', 'client_w'), tests.user_id('client_w'), tests.user_id('trainer_a'),
        'offered', now() - interval '1 hour', now() - interval '40 minutes'),
       (tests.id('own_offer'), tests.pair_id('trainer_a', 'client_w'), tests.user_id('client_w'), tests.user_id('trainer_a'),
        'offered', now(), now() + interval '20 minutes');
-- The group of 100 is full.
select tests.create_user('crowd_' || n) from generate_series(1, 100) n;
select tests.create_pair('trainer_a', 'crowd_' || n) from generate_series(1, 100) n;
select tests.create_booking(tests.id('hundred'), 'trainer_a', 'crowd_' || n) from generate_series(1, 100) n;

select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('expired_offer'),
  tests.pair_id('trainer_a', 'client_x')), 'extra seat: the trainer adds a client next to an expired offer');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('own_offer'),
  tests.pair_id('trainer_a', 'client_w')), 'extra seat: the trainer adds the client the queue offered a seat');
select throws_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('started'),
  tests.pair_id('trainer_a', 'client_x')), 'P0001', 'session_not_found', 'extra seat: not in a session that has begun');
select throws_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('hundred'),
  tests.pair_id('trainer_a', 'client_x')), 'P0001', 'session_full', 'extra seat: a group of 100 does not grow further');
select tests.clear_authentication();
select is((select capacity::int from public.sessions where id = tests.id('expired_offer')), 2,
  'extra seat: an expired offer holds no seat, so the group keeps its size');
select is((select status::text from public.waitlist_entries where session_id = tests.id('own_offer')), 'accepted',
  'extra seat: the queue entry of the added client is closed as accepted');

-- =========================================================================================================
-- Previews count the pass of the right kind and refuse a move into debt

insert into tests.ids values ('g_pass', tests.create_pass('trainer_a', 'client_g', 5));
update public.passes set applies_to = 'group' where id = tests.id('g_pass');
insert into tests.ids values ('p_pass', tests.create_pass('trainer_a', 'client_p', 5));
update public.passes set applies_to = 'personal' where id = tests.id('p_pass');
insert into tests.ids values ('open_group', tests.create_session('trainer_a', now() + interval '12 days 3 hours', 'group', 5));
update public.sessions set open_for_booking = true where id = tests.id('open_group');

select tests.authenticate_as('client_g');
select is((select row(confirmed, pass_title)::text from public.booking_preview(tests.slot(8))), row(false, null::text)::text,
  'preview: a group-only pass does not cover a personal slot');
select tests.authenticate_as('client_p');
select is((select row(confirmed, pass_title)::text from public.group_booking_preview(tests.id('open_group'))),
  row(false, null::text)::text, 'preview: a personal-only pass does not cover a group session');
select tests.clear_authentication();

-- client_r has no pass and no debt: the move of a request shows no unpaid pass.
select tests.authenticate_as('client_r');
select b.booking_id as booking_r from public.book_slot(tests.slot(9)) b \gset
select tests.authenticate_as('trainer_a');
select public.decide_booking(:'booking_r', true);
select tests.authenticate_as('client_r');
select is((select row(confirmed, pass_title, pass_unpaid)::text from public.reschedule_preview(:'booking_r', tests.slot(10))),
  row(false, null::text, false)::text, 'move preview: without a pass nothing reads as unpaid');
select tests.clear_authentication();

-- client_q owes a session and books with a pass that ends before a later slot: moving there would be a second debt.
insert into tests.ids values ('q_pass', tests.create_pass('trainer_a', 'client_q', 1, 0, 'RUB',
  date_trunc('hour', now()) + interval '11 days'));
insert into public.ledger_entries (coaching_id, entry_type, sessions_delta, booking_id, charge_reason, occurred_at)
values (tests.pair_id('trainer_a', 'client_q'), 'charge', -1,
        tests.create_booking(tests.create_session('trainer_a', now() - interval '2 days'), 'trainer_a', 'client_q', 'attended'),
        'attended', now() - interval '2 days');
select tests.authenticate_as('client_q');
select b.booking_id as booking_q from public.book_slot(tests.slot(10)) b \gset
select throws_ok(format($$ select * from public.reschedule_preview(%L, %L) $$, :'booking_q', tests.slot(15)),
  'P0001', 'debt_limit', 'move preview: a move past the pass into a second debt is refused');
select tests.clear_authentication();

-- =========================================================================================================
-- A request for a session that starts exactly when quiet hours end waits like any other

insert into tests.ids values ('quiet', tests.create_session('trainer_a', date_trunc('minute', now()) + interval '5 hours'));
select ok(not private.request_before_quiet_end('booking_requested', tests.id('quiet'),
                                               date_trunc('minute', now()) + interval '5 hours'),
  'quiet hours: a session starting at their end does not skip them');
select ok(private.request_before_quiet_end('booking_requested', tests.id('quiet'),
                                           date_trunc('minute', now()) + interval '5 hours 1 minute'),
  'quiet hours: a session starting a minute before their end does');

-- =========================================================================================================
-- A past session is at least 15 minutes long

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select * from public.record_past_session(%L, %L, 14::smallint, 'online') $$,
  tests.pair_id('trainer_a', 'client_s'), now() - interval '1 day'), '22023', 'invalid_duration',
  'past session: 14 minutes is too short');
select tests.clear_authentication();

-- =========================================================================================================
-- A refund on a pass with a payment report waiting is not a second report

insert into tests.ids values ('s_pass', tests.create_pass('trainer_a', 'client_s', 5, 500000));
insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status)
values (tests.pair_id('trainer_a', 'client_s'), tests.id('s_pass'), 'in', 500000, 'RUB', 'bank_transfer', now(), 'reported');
select lives_ok(format($$ insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status)
                          values (%L, %L, 'refund', 100000, 'RUB', 'bank_transfer', now(), 'reported') $$,
                       tests.pair_id('trainer_a', 'client_s'), tests.id('s_pass')),
  'payments: a reported refund next to a reported payment is taken');

-- =========================================================================================================
-- «Занятие перенесено» reaches only clients still in the group

insert into tests.ids values ('moved_group', tests.create_session('trainer_a', now() + interval '4 days', 'group', 5));
select tests.create_booking(tests.id('moved_group'), 'trainer_a', h) from unnest(array['client_c', 'client_d']) h;
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where session_id = tests.id('moved_group') and client_id = tests.user_id('client_c');
select private.enqueue_notification('session_changed', 'm:' || h, '{}', tests.user_id(h), p_session_id => tests.id('moved_group'))
from unnest(array['client_c', 'client_d']) h;
select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(100);
select tests.clear_authentication();
select is(
  array(select o.dedupe_key || '=' || o.status from public.notification_outbox o where o.dedupe_key like 'm:%' order by 1),
  array['m:client_c=skipped', 'm:client_d=processing'],
  'outbox: a client who left the group does not hear that it moved, the one still in it does');

select * from finish();
rollback;

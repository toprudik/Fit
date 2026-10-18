-- QA fixes of migration 20261018135317_qa_money_booking_fixes.sql, plus the pass choice rule (PRD 2.8-7) that no
-- test pinned down before: each case below failed to catch a deliberate break of private.pick_pass or
-- private.post_charge (docs/qa/production-readiness.md, "Мутационная проверка").
begin;
\ir _helpers.psql
select plan(31);

select tests.create_trainer('trainer_a');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_w');
select tests.create_user('friend_f');
select tests.create_user('new_n');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_w');
select tests.create_pair('trainer_a', 'friend_f');
select tests.create_pair('trainer_a', 'client_e');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;

-- 1. The trainer cancels: a QR check-in and a late cancellation lose their charge ------------------------------

insert into tests.ids values
  ('pass_c', tests.create_pass('trainer_a', 'client_c', 5, 500000)),
  ('pass_d', tests.create_pass('trainer_a', 'client_d', 5, 500000)),
  ('g1', tests.create_session('trainer_a', now() + interval '20 minutes', 'group', 5)),
  ('g2', tests.create_session('trainer_a', now() + interval '10 hours', 'group', 5));
insert into tests.ids values
  ('b1', tests.create_booking(tests.i('g1'), 'trainer_a', 'client_c', 'confirmed')),
  ('b2', tests.create_booking(tests.i('g2'), 'trainer_a', 'client_d', 'confirmed'));

create table tests.codes as select private.check_in_code(tests.i('g1'), private.check_in_window(now())) as code;
grant select on tests.codes to authenticated;
select tests.authenticate_as('client_c');
select is((select outcome::text from public.check_in_by_qr(tests.i('g1'), (select code from tests.codes))),
          'checked_in', 'the client checks in by QR 20 minutes before the start');
select tests.authenticate_as('client_d');
select lives_ok(format('select public.cancel_my_booking(%L, %L, true)', tests.i('b2'), 'Заболел'),
                'the other client cancels late and is charged');
select tests.authenticate_as('trainer_a');
select is(public.cancel_session(tests.i('g1'), 'Зал закрыт'), 1, 'the trainer cancels the checked-in session');
select is(public.cancel_session(tests.i('g2'), 'Зал закрыт'), 1, 'and the late-cancelled one');
select tests.clear_authentication();

select is((select status::text from public.bookings where id = tests.i('b1')), 'cancelled',
          'the checked-in booking is cancelled by the trainer');
select is((select (select count(*) from public.ledger_entries w where w.related_entry_id = e.id and w.entry_type = 'waiver')
           from public.ledger_entries e where e.booking_id = tests.i('b1') and e.entry_type = 'charge')::integer,
          1, 'its charge is waived');
select is((select (select count(*) from public.ledger_entries w where w.related_entry_id = e.id and w.entry_type = 'waiver')
           from public.ledger_entries e where e.booking_id = tests.i('b2') and e.entry_type = 'charge')::integer,
          1, 'the late cancellation charge is waived too');
select is((select remaining from public.pass_balances where pass_id = tests.i('pass_c')), 5,
          'the checked-in client has all 5 sessions back');
select is((select remaining from public.pass_balances where pass_id = tests.i('pass_d')), 5,
          'the late-cancelling client has all 5 sessions back');
select is((select count(*)::integer from public.notification_outbox o
           where o.type = 'booking_cancelled_by_trainer' and o.user_id = tests.user_id('client_c')), 1,
          'the checked-in client is told about the cancellation');

-- 2. Correcting a qualifying payment keeps the referral bonuses ----------------------------------------------

insert into public.referral_offers (trainer_id, referrer_sessions, referee_sessions, min_amount_minor, currency)
values (tests.user_id('trainer_a'), 2, 1, 100000, 'RUB');
insert into public.referrals (offer_id, trainer_id, referrer_id, referee_id, coaching_id, referrer_coaching_id)
select o.id, tests.user_id('trainer_a'), tests.user_id('client_c'), tests.user_id('friend_f'),
       tests.pair_id('trainer_a', 'friend_f'), tests.pair_id('trainer_a', 'client_c')
from public.referral_offers o;

select tests.authenticate_as('trainer_a');
select public.create_pass(tests.pair_id('trainer_a', 'friend_f'), p_title => '8 занятий', p_sessions => 8,
  p_price_minor => 800000, p_currency => 'RUB', p_payment_minor => 800000, p_payment_method => 'cash');
select tests.clear_authentication();
insert into tests.ids select 'pay1', id from public.payments where coaching_id = tests.pair_id('trainer_a', 'friend_f');
select is((select status::text from public.referrals), 'qualified', 'the payment qualifies the referral');

select tests.authenticate_as('trainer_a');
insert into tests.ids select 'pay2', public.correct_payment(tests.i('pay1'), 800000, 'sbp', now(), 'Не тот способ');
select tests.clear_authentication();
select is((select row(status::text, qualifying_payment_id = tests.i('pay2'))::text from public.referrals),
          '(qualified,t)', 'after a correction the referral stays qualified, on the new payment');
select is((select string_agg(status::text, ',' order by sessions) from public.bonuses), 'granted,granted',
          'both bonuses stay granted');

select tests.authenticate_as('trainer_a');
update public.payments set status = 'voided', void_reason = 'Ошибка' where id = tests.i('pay2');
select tests.clear_authentication();
select is((select row(status::text, void_reason)::text from public.referrals), '(void,payment_voided)',
          'voiding the new payment without a correction still takes the bonuses back');

-- 3. Concurrent bookings of a pair wait for each other -------------------------------------------------------

select is((select provolatile::text from pg_proc where oid = 'private.booking_auto_confirm(uuid, public.session_kind, timestamptz)'::regprocedure),
          'v', 'booking_auto_confirm is volatile, so it sees a booking committed while it waited');
select ok(pg_get_functiondef('private.booking_auto_confirm(uuid, public.session_kind, timestamptz)'::regprocedure)
          ~ 'pg_advisory_xact_lock', 'and it takes the per-pair lock');

-- 4. A withdrawn trial request frees its slot; 5. a held slot is not offered for a trial --------------------

insert into public.slots (trainer_id, starts_at, ends_at, allow_trial) values
  (tests.user_id('trainer_a'), date_trunc('hour', now()) + interval '3 days',
   date_trunc('hour', now()) + interval '3 days 1 hour', true);
insert into public.trial_links (trainer_id, title, duration_min, currency)
values (tests.user_id('trainer_a'), 'Знакомство', 45, 'RUB');
insert into tests.ids select 'slot', id from public.slots where allow_trial;
create table tests.trial_token as select token from public.trial_links;
grant select on tests.trial_token to authenticated;

select tests.authenticate_as('new_n');
insert into tests.ids select 'trial', booking_id from public.book_trial((select token from tests.trial_token), tests.i('slot'));
select public.withdraw_booking_request(tests.i('trial'));
select tests.clear_authentication();
select is((select row(s.status, sl.status)::text from public.bookings b join public.sessions s on s.id = b.session_id
           left join public.slots sl on sl.id = tests.i('slot') where b.id = tests.i('trial')),
          '(cancelled,open)', 'a withdrawn trial request cancels its session and opens the slot again');
select tests.authenticate_as('new_n');
select is((select count(*)::integer from public.get_trial_slots((select token from tests.trial_token))), 1,
          'the slot is on the trial page again');

select tests.authenticate_as('client_e');
insert into tests.ids select 'bk', booking_id from public.book_slot(tests.i('slot'));
select tests.authenticate_as('client_w');
insert into tests.ids select 'we', entry_id from public.join_slot_waitlist(tests.i('slot'));
select tests.authenticate_as('client_e');
select public.withdraw_booking_request(tests.i('bk'));
set constraints all immediate;
select tests.clear_authentication();
select is((select status::text from public.waitlist_entries where id = tests.i('we')), 'offered',
          'the freed slot is offered to the waiting client');
select tests.authenticate_as('new_n');
select is((select count(*)::integer from public.get_trial_slots((select token from tests.trial_token))), 0,
          'a slot held for the waitlist is not on the trial page');
select throws_ok(format('select * from public.book_trial(%L, %L)', (select token from tests.trial_token), tests.i('slot')),
                 null, null, 'and cannot be booked as a trial');
select tests.clear_authentication();

-- Pass choice (PRD 2.8-7) ---------------------------------------------------------------------------------

update public.profiles set time_zone = 'Asia/Vladivostok' where id = tests.user_id('trainer_a');
insert into tests.ids values ('pw', tests.create_pass('trainer_a', 'client_w', 3, 300000));

-- 21:00 UTC on the 20th is already the 21st in Vladivostok.
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_w'), 'personal', (current_date + 30) + time '21:00'),
          tests.i('pw'), 'an active pass with sessions left is picked');
insert into public.pass_freezes (pass_id, period) values (tests.i('pw'), daterange(current_date + 31, current_date + 32));
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_w'), 'personal', ((current_date + 30) + time '21:00') at time zone 'UTC'),
          null, 'a pass frozen on the trainer''s local date is not picked, though the UTC date is not frozen');
delete from public.pass_freezes where pass_id = tests.i('pw');

update public.passes set applies_to = 'group' where id = tests.i('pw');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_w'), 'personal', now() + interval '1 day'),
          null, 'a group-only pass is not picked for a personal session');
select set_config('fit.change_reason', 'QA', true);
update public.passes set applies_to = 'any', expires_at = now() + interval '1 day' where id = tests.i('pw');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_w'), 'personal',
                            (select expires_at from public.passes where id = tests.i('pw'))),
          null, 'a pass is not picked at the instant it expires');
update public.passes set expires_at = null where id = tests.i('pw');
insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
values (tests.pair_id('trainer_a', 'client_w'), 'adjustment', tests.i('pw'), -3, 0, now(), 'QA');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_w'), 'personal', now() + interval '1 day'),
          null, 'a pass with no session left is not picked');

insert into tests.ids values
  ('pe_soon', tests.create_pass('trainer_a', 'client_e', 2, 200000, 'RUB', now() + interval '30 days')),
  ('pe_open', tests.create_pass('trainer_a', 'client_e', 2, 200000));
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_e'), 'personal', now() + interval '1 day'),
          tests.i('pe_soon'), 'the pass that expires first is picked');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_e'), 'personal', now() + interval '1 day', tests.i('pe_open')),
          tests.i('pe_open'), 'the pass the booking reserved wins when it qualifies');
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.i('pe_soon');
select is(private.pick_pass(tests.pair_id('trainer_a', 'client_e'), 'personal', now() + interval '1 day'),
          tests.i('pe_open'), 'a cancelled pass is not picked');

-- A charge is posted once, however often it is asked for (a repeated mark, a retried job).
insert into tests.ids values ('se', tests.create_session('trainer_a', now() - interval '2 hours'));
insert into tests.ids values ('be', tests.create_booking(tests.i('se'), 'trainer_a', 'client_e', 'confirmed'));
update public.bookings set status = 'attended', attendance_marked_at = now() where id = tests.i('be');
insert into tests.ids values ('ce', private.post_charge(tests.i('be'), 'attended'));
select is(private.post_charge(tests.i('be'), 'attended'), tests.i('ce'), 'asking again returns the same charge');
select is((select count(*)::integer from public.ledger_entries where booking_id = tests.i('be') and entry_type = 'charge'), 1,
          'and writes no second one');

rollback;

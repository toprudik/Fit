-- "Абонемент заканчивается", migration 20261017113617_pass_ending.sql (PRD wave-1 §2.9-9, К10 and Т6).
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_card('trainer_a', 'card_f');
update public.profiles set first_name = 'Ира', username = 'ira_trainer' where id = tests.user_id('trainer_a');
update public.profiles set first_name = 'Анна', username = 'anna_client' where id = tests.user_id('client_c');
insert into public.payment_links (trainer_id, title, url, sort_order) values
  (tests.user_id('trainer_a'), 'Карта', 'https://pay.example/second', 2),
  (tests.user_id('trainer_a'), 'СБП', 'https://pay.example/first', 1);

create table tests.passes (name text primary key, id uuid not null);
-- Plenty left, no expiry; two sessions with one of them booked; a single-session pass; expiring in 5 days;
-- expiring in 5 days but frozen today; already expired; cancelled; a card's pass; the ended pair's.
insert into tests.passes values
  ('plenty', tests.create_pass('trainer_a', 'client_c', 10)),
  ('low', tests.create_pass('trainer_a', 'client_c', 2)),
  ('single', tests.create_pass('trainer_a', 'client_c', 1)),
  ('expiring', tests.create_pass('trainer_a', 'client_d', 10, 0, 'RUB', now() + interval '5 days')),
  ('frozen', tests.create_pass('trainer_a', 'client_d', 10, 0, 'RUB', now() + interval '5 days')),
  ('expired', tests.create_pass('trainer_a', 'client_d', 10, 0, 'RUB', now() - interval '1 day')),
  ('cancelled', tests.create_pass('trainer_a', 'client_d', 1)),
  ('card', tests.create_pass('trainer_a', 'card_f', 1)),
  ('ended', tests.create_pass('trainer_a', 'client_e', 1));
create function tests.pass(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.passes where name = p_name
$$;
update public.passes set status = 'cancelled', cancelled_at = now() where id = tests.pass('cancelled');
update public.passes set sessions_total = 2 where id in (tests.pass('cancelled'), tests.pass('card'), tests.pass('ended'));
insert into public.pass_freezes (pass_id, period)
values (tests.pass('frozen'), daterange(current_date - 1, current_date + 10));
select tests.create_booking(tests.create_session('trainer_a', now() + interval '2 days'), 'trainer_a', 'client_c', 'confirmed');
update public.bookings set reserved_pass_id = tests.pass('low');

create function tests.queued(p_type text, p_pass text, p_condition text) returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from public.notification_outbox
  where dedupe_key = p_type || ':' || tests.pass(p_pass) || ':' || p_condition
$$;

-- The card's and the ended pair's passes have 1 session left of 2 as well: only the card's trainer hears of it.
select is(private.queue_pass_ending(), 5, 'queues the low pass and the expiring one for both, the card''s for the trainer');
select is(private.queue_pass_ending(), 0, 'once per pass and condition');

select is(tests.queued('pass_ending', 'low', 'low') + tests.queued('client_pass_ending', 'low', 'low'), 2,
          'low: 1 available, the other one booked');
select is(tests.queued('pass_ending', 'expiring', 'expiry') + tests.queued('client_pass_ending', 'expiring', 'expiry'), 2,
          'expiry: 7 days or less');
select is(tests.queued('pass_ending', 'card', 'low'), 0, 'a card without an account gets nothing');
select is(tests.queued('client_pass_ending', 'card', 'low'), 1, 'its trainer does');
select is((select count(*)::integer from public.notification_outbox
           where dedupe_key ~ ('(' || tests.pass('plenty') || '|' || tests.pass('single') || '|' || tests.pass('frozen') || '|'
                               || tests.pass('expired') || '|' || tests.pass('cancelled') || '|' || tests.pass('ended') || ')')),
          0, 'nothing for plenty left, a single-session pass, a frozen, expired or cancelled pass, or an ended pair');

select is((select x.payload->>'payment_url' from public.notification_outbox x
           where x.dedupe_key = 'pass_ending:' || tests.pass('low') || ':low'),
          'https://pay.example/first', 'client: the trainer''s first payment link');
select is((select x.payload->>'username' from public.notification_outbox x
           where x.dedupe_key = 'pass_ending:' || tests.pass('low') || ':low'),
          'ira_trainer', 'client: the trainer''s username to write to');
select is((select x.payload - 'expires_at' - 'pass_id' - 'coaching_id' from public.notification_outbox x
           where x.dedupe_key = 'client_pass_ending:' || tests.pass('low') || ':low'),
          '{"title": "2 sessions", "condition": "low", "available": 1, "first_name": "Анна", "last_name": null, "username": "anna_client"}'::jsonb,
          'trainer: the client, the pass and what is left');
select is((select x.user_id from public.notification_outbox x
           where x.dedupe_key = 'client_pass_ending:' || tests.pass('low') || ':low'),
          tests.user_id('trainer_a'), 'trainer: addressed to the trainer');
select ok((select (x.payload->>'expires_at')::timestamptz between now() + interval '4 days' and now() + interval '6 days'
           from public.notification_outbox x where x.dedupe_key = 'pass_ending:' || tests.pass('expiring') || ':expiry'),
          'expiry: the date the pass ends');

-- A pass that ran low and then gets close to its end hears about each once.
set local fit.change_reason = 'test';
update public.passes set expires_at = now() + interval '3 days' where id = tests.pass('low');
select is(private.queue_pass_ending(), 2, 'the second condition of the same pass is a new message');
select ok(private.notification_type_is_optional('pass_ending') and private.notification_type_is_optional('client_pass_ending'),
          'both may be turned off');

select * from finish();
rollback;

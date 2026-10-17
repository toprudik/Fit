-- "Возник долг", migration 20261017133523_debt_notification.sql (PRD wave-1 §2.8 MONEY-7, К11).
begin;
\ir _helpers.psql
select plan(10);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_card('trainer_a', 'card_f');
update public.profiles set first_name = 'Ира', username = 'ira_trainer' where id = tests.user_id('trainer_a');
insert into public.payment_links (trainer_id, title, url, sort_order) values
  (tests.user_id('trainer_a'), 'Карта', 'https://pay.example/second', 2),
  (tests.user_id('trainer_a'), 'СБП', 'https://pay.example/first', 1);
-- The drop-in price of trainer A: 2 500 ₽ for a personal session.
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to)
values (tests.user_id('trainer_a'), 'Разовое', 1, 250000, 'RUB', 'personal');

-- Client C has no pass: two ended sessions go into debt. Client D has a pass and pays from it. The card has no
-- pass either.
select tests.create_pass('trainer_a', 'client_d', 5);
select tests.create_booking(tests.create_session('trainer_a', now() - interval '3 hours'), 'trainer_a', 'client_c');
select tests.create_booking(tests.create_session('trainer_a', now() - interval '5 hours'), 'trainer_a', 'client_c');
select tests.create_booking(tests.create_session('trainer_a', now() - interval '3 hours'), 'trainer_a', 'client_d');
select tests.create_booking(tests.create_session('trainer_a', now() - interval '3 hours'), 'trainer_a', 'card_f');

select private.complete_sessions();

create function tests.debts(p_client text) returns setof public.notification_outbox language sql stable set search_path = '' as $$
  select * from public.notification_outbox where type = 'debt' and user_id = tests.user_id(p_client) order by created_at, id
$$;

select is((select count(*)::integer from tests.debts('client_c')), 2, 'each attended session without a pass is a message');
select is((select count(*)::integer from tests.debts('client_d')), 0, 'a session paid from a pass is not');
select is((select count(*)::integer from public.notification_outbox where type = 'debt' and user_id = tests.user_id('card_f')), 0,
          'a card without an account gets nothing');
select is((select pg_catalog.array_agg((payload ->> 'debt_sessions')::integer order by (payload ->> 'starts_at')::timestamptz)
           from tests.debts('client_c')), array[1, 2], 'each one carries the total debt of the pair at that point');
select is((select payload ->> 'payment_url' from tests.debts('client_c') limit 1), 'https://pay.example/first',
          'with the trainer''s first payment link');
select is((select payload ->> 'username' || ' ' || (payload ->> 'first_name') from tests.debts('client_c') limit 1),
          'ira_trainer Ира', 'and the trainer''s name and username');
select is((select (payload ->> 'amount_minor')::bigint from tests.debts('client_c') limit 1), 250000::bigint,
          'and the drop-in price it was charged at');

-- A no-show without a pass already says so in К8.
create table tests.no_show as
select tests.create_booking(tests.create_session('trainer_a', now() - interval '30 minutes'), 'trainer_a', 'client_c') as id;
grant select on tests.no_show to authenticated;
select tests.authenticate_as('trainer_a');
select public.mark_attendance((select id from tests.no_show), 'no_show');
select tests.clear_authentication();
select is((select count(*)::integer from public.ledger_entries
           where booking_id = (select id from tests.no_show) and charge_reason = 'no_show' and pass_id is null), 1,
          'the no-show is charged into debt');
select is((select count(*)::integer from tests.debts('client_c')), 2, 'a no-show gets К8, not a second message');

select ok(private.notification_type_is_optional('debt'), 'the client may turn it off');

select * from finish();
rollback;

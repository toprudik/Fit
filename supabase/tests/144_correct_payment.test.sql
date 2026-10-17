-- "Исправить оплату", migration 20261017120914_correct_payment.sql (PRD wave-1 §2.8 rule 13).
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('pass', tests.create_pass('trainer_a', 'client_c', 10, 1600000));
with r as (
  insert into public.payments (coaching_id, client_id, trainer_id, pass_id, amount_minor, currency, method, paid_at,
                               status, confirmed_at, note)
  values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), tests.user_id('trainer_a'), tests.id('pass'),
          160000, 'RUB', 'cash', now() - interval '2 days', 'confirmed', now(), 'за октябрь')
  returning id)
insert into tests.ids select 'paid', id from r;
with r as (
  insert into public.payments (coaching_id, client_id, trainer_id, pass_id, amount_minor, currency, method, paid_at,
                               status, reported_by)
  values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), tests.user_id('trainer_a'), tests.id('pass'),
          500000, 'RUB', 'sbp', now(), 'reported', tests.user_id('client_c'))
  returning id)
insert into tests.ids select 'reported', id from r;

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.correct_payment(tests.id('paid'), 1600000, 'bank_transfer', now(), 'опечатка') $$,
  'P0002', 'payment_not_found', 'another trainer cannot correct it');

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.correct_payment(tests.id('paid'), 1, 'cash', now(), 'хочу дешевле') $$,
  'P0002', 'payment_not_found', 'the client cannot either');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.correct_payment(tests.id('reported'), 1600000, 'sbp', now(), 'опечатка') $$,
  'P0002', 'payment_not_found', 'a report waiting for confirmation is confirmed or voided, not corrected');

insert into tests.ids values ('fixed', public.correct_payment(tests.id('paid'), 1600000, 'bank_transfer', now() - interval '1 day', 'Сумма с опечаткой'));
select tests.clear_authentication();

select results_eq(
  $$ select status::text, void_reason from public.payments where id = tests.id('paid') $$,
  $$ values ('voided'::text, 'Сумма с опечаткой'::text) $$,
  'the old payment is voided with the reason');
select results_eq(
  $$ select status::text, amount_minor, method::text, pass_id, note, currency::text from public.payments where id = tests.id('fixed') $$,
  $$ values ('confirmed'::text, 1600000::bigint, 'bank_transfer'::text, tests.id('pass'), 'за октябрь'::text, 'RUB'::text) $$,
  'the new one has the corrected amount and method, the same pass, note and currency');
select is((select sum(amount_minor) from public.payments where pass_id = tests.id('pass') and status = 'confirmed'),
          1600000::numeric, 'the pass counts the corrected amount only');
select ok((select count(*) >= 2 from public.money_events where payment_id in (tests.id('paid'), tests.id('fixed'))),
          'the history records both');

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.correct_payment(tests.id('paid'), 1, 'cash', now(), 'ещё раз') $$,
  'P0002', 'payment_not_found', 'a voided payment cannot be corrected again');
select throws_ok(
  $$ select public.correct_payment(tests.id('fixed'), 0, 'cash', now(), 'ноль') $$,
  '23514', null, 'the amount stays positive');
select tests.clear_authentication();

select * from finish();
rollback;

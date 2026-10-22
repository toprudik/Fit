-- One waiting «Я оплатил» per pass, migration 20261021221437_one_payment_report.sql (QA B1).
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('pass', tests.create_pass('trainer_a', 'client_c', 10, 2000000));
insert into tests.ids values ('other_pass', tests.create_pass('trainer_a', 'client_c', 5, 900000));

create function tests.report(p_pass text, p_amount bigint) returns uuid language sql set search_path = '' as $$
  insert into public.payments (coaching_id, client_id, trainer_id, pass_id, amount_minor, currency, method, paid_at, status)
  values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), tests.user_id('trainer_a'), tests.id(p_pass),
          p_amount, 'RUB', 'sbp', now(), 'reported')
  returning id
$$;
grant execute on function tests.report(text, bigint) to authenticated;

select tests.authenticate_as('client_c');
insert into tests.ids values ('first', tests.report('pass', 2000000));
select throws_ok($$ select tests.report('pass', 2000000) $$, 'P0001', 'payment_already_reported',
  'a second report on the same pass waits for the first one');

update public.payments set status = 'voided', void_reason = 'Клиент отозвал сообщение' where id = tests.id('first');
select lives_ok($$ select tests.report('pass', 1500000) $$, 'after withdrawing the first one the client can report again');
select is((select count(*)::integer from public.payments where pass_id = tests.id('pass') and status = 'reported'), 1,
  'one report waits for the trainer');

insert into tests.ids values ('elsewhere', tests.report('other_pass', 900000));
select throws_ok($$ update public.payments set pass_id = tests.id('pass') where id = tests.id('elsewhere') $$,
  'P0001', 'payment_already_reported', 'a report cannot be moved onto a pass with a waiting report');
select lives_ok(
  $$ update public.payments set amount_minor = 1400000 where pass_id = tests.id('pass') and status = 'reported' $$,
  'the waiting report itself can still be edited');

select tests.authenticate_as('trainer_a');
update public.payments set status = 'confirmed' where pass_id = tests.id('pass') and status = 'reported';
select lives_ok(
  $$ insert into public.payments (coaching_id, client_id, trainer_id, pass_id, amount_minor, currency, method, paid_at, status)
     values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), tests.user_id('trainer_a'),
             tests.id('pass'), 100000, 'RUB', 'cash', now(), 'confirmed') $$,
  'the trainer records a payment on a pass whatever waits');

select tests.authenticate_as('client_c');
select lives_ok($$ select tests.report('pass', 500000) $$, 'once the trainer confirms it, the next payment can be reported');

select * from finish();
rollback;

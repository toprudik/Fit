-- Branches of post_charge, waive_charge and the started-freeze guard that no test reached: a mutation in each
-- survived the suite (docs/qa/production-readiness.md §1). The currency of a charge from a free pass, an over-long
-- waiver reason, and a freeze that starts today.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_d', 'client_e']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d', 'client_e']) h;

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.today_a() returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone p.time_zone)::date from public.profiles p where p.id = tests.user_id('trainer_a')
$$;
grant execute on function tests.today_a() to authenticated;

insert into tests.ids values
  ('free_pass', tests.create_pass('trainer_a', 'client_c', 1, 0, 'RUB')),
  ('pass_e', tests.create_pass('trainer_a', 'client_e', 5, 500000, 'RUB'));
update public.passes set starts_on = current_date - 10 where id = tests.id('free_pass');
insert into tests.ids values
  ('charge_c', private.post_charge(tests.create_booking(tests.create_session('trainer_a', now() - interval '1 day'),
                                                        'trainer_a', 'client_c', 'attended'), 'attended')),
  ('debt_1', private.post_charge(tests.create_booking(tests.create_session('trainer_a', now() - interval '2 days'),
                                                      'trainer_a', 'client_d', 'attended'), 'attended')),
  ('debt_2', private.post_charge(tests.create_booking(tests.create_session('trainer_a', now() - interval '3 days'),
                                                      'trainer_a', 'client_d', 'attended'), 'attended'));

select is((select row(e.pass_id, e.amount_minor, e.currency)::text from public.ledger_entries e where e.id = tests.id('charge_c')),
  row(tests.id('free_pass'), 0::bigint, 'RUB'::public.currency_code)::text,
  'a charge from a free pass keeps the pass currency');

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.waive_charge(%L, %L) $$, tests.id('debt_1'), repeat('я', 501)),
  '22023', 'reason_too_long', 'a waiver reason over 500 characters is refused');
select lives_ok(format($$ select public.waive_charge(%L, %L) $$, tests.id('debt_2'), repeat('я', 500)),
  'a waiver reason of 500 characters is taken');

-- A freeze whose first day is today has started: its start stays, its end may move.
insert into public.pass_freezes (pass_id, period, reason)
values (tests.id('pass_e'), daterange(tests.today_a(), tests.today_a() + 3), 'today');
select throws_ok(
  $$ update public.pass_freezes set period = daterange(tests.today_a() + 1, tests.today_a() + 3) where reason = 'today' $$,
  '42501', 'forbidden', 'a freeze starting today keeps its first day');
select results_eq(
  $$ update public.pass_freezes set period = daterange(tests.today_a(), tests.today_a() + 5) where reason = 'today'
     returning upper(period) = tests.today_a() + 5 $$,
  $$ values (true) $$,
  'a freeze starting today may end later');
select tests.clear_authentication();

select * from finish();
rollback;

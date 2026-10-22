-- "Разморозить" (QA U8), migration 20261021230713_unfreeze_today.sql: a freeze starting today can be removed, an
-- earlier one only ends early, and another trainer removes nothing.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.today_a() returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone p.time_zone)::date from public.profiles p where p.id = tests.user_id('trainer_a')
$$;
grant execute on function tests.today_a() to authenticated;

insert into tests.ids values ('pass', tests.create_pass('trainer_a', 'client_c', 10, 500000, 'RUB'));
update public.passes set starts_on = tests.today_a() - 20 where id = tests.id('pass');
insert into public.pass_freezes (pass_id, period, reason) values
  (tests.id('pass'), daterange(tests.today_a(), tests.today_a() + 1), 'today'),
  (tests.id('pass'), daterange(tests.today_a() - 5, tests.today_a() - 3), 'past');

select tests.authenticate_as('trainer_b');
select is_empty($$ delete from public.pass_freezes where reason = 'today' returning 1 $$,
  'another trainer cannot remove the freeze');

select tests.authenticate_as('trainer_a');
select results_eq($$ delete from public.pass_freezes where reason = 'today' returning reason $$,
  $$ values ('today'::text) $$, 'a freeze starting today is removed the same day');
select is_empty($$ delete from public.pass_freezes where reason = 'past' returning 1 $$,
  'a freeze that started earlier is not removed');

insert into public.pass_freezes (pass_id, period, reason)
values (tests.id('pass'), daterange(tests.today_a() - 2, tests.today_a() + 4), 'running');
select results_eq(
  $$ update public.pass_freezes set period = daterange(tests.today_a() - 2, tests.today_a()) where reason = 'running'
     returning upper(period) = tests.today_a() $$,
  $$ values (true) $$, 'a running freeze ends yesterday, so today is free');
select is_empty($$ delete from public.pass_freezes where reason = 'running' returning 1 $$,
  'a running freeze that started earlier keeps its past days');
select tests.clear_authentication();

select * from finish();
rollback;

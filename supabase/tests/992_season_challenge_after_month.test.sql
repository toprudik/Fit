-- The season challenge card after its month (migration 20261103024917_season_challenge_after_month.sql, QA bug 25):
-- a month that is over counts as finished, stays only for the clients who joined until two weeks after its result, and a running or
-- coming challenge comes first.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('trainer_a');
select tests.create_user('client_in');
select tests.create_user('client_out');
select tests.create_pair('trainer_a', c) from unnest(array['client_in', 'client_out']) c;
update public.user_settings set time_zone = 'UTC'
where user_id in (tests.user_id('client_in'), tests.user_id('client_out'));
select date_trunc('month', (now() at time zone 'UTC'))::date as this_month \gset

-- Last month's challenge, joined by client_in, its month over and not finished by the hourly job yet; written
-- directly because the admin RPC refuses a month that is over.
insert into public.season_challenges (title, month)
values ('Прошлый месяц', (:'this_month'::date - interval '1 month')::date)
returning id as last_ch \gset
insert into public.season_challenge_participants (challenge_id, user_id) values (:'last_ch', tests.user_id('client_in'));

select tests.authenticate_as('client_in');
select results_eq($$ select title, joined, finished from public.my_season_challenge() $$,
  $$ values ('Прошлый месяц'::text, true, true) $$,
  'over: a client who joined sees last month''s challenge as finished, before its result is set');
select throws_ok(format('select public.set_season_challenge_joined(%L, false)', :'last_ch'), 'P0001', 'challenge_closed',
  'over: and cannot leave it any more');

select tests.authenticate_as('client_out');
select is((select count(*)::int from public.my_season_challenge()), 0,
  'over: a client who did not join no longer sees it');

-- This month's challenge replaces it.
select tests.clear_authentication();
insert into public.season_challenges (title, month) values ('Этот месяц', :'this_month') returning id as this_ch \gset

select tests.authenticate_as('client_in');
select results_eq($$ select title, joined, finished from public.my_season_challenge() $$,
  $$ values ('Этот месяц'::text, false, false) $$,
  'next: the running challenge comes before last month''s result');
select tests.authenticate_as('client_out');
select results_eq($$ select title from public.my_season_challenge() $$, $$ values ('Этот месяц'::text) $$,
  'next: everybody sees the running one');

-- Two weeks after the result the joined challenge is gone too.
select tests.clear_authentication();
delete from public.season_challenges where id = :'this_ch';
update public.season_challenges set finished_at = now() - interval '13 days' where id = :'last_ch';
select tests.authenticate_as('client_in');
select is((select count(*)::int from public.my_season_challenge()), 1, 'result: shown for two weeks after it is set');
select tests.clear_authentication();
update public.season_challenges set finished_at = now() - interval '15 days' where id = :'last_ch';
select tests.authenticate_as('client_in');
select is((select count(*)::int from public.my_season_challenge()), 0, 'result: then the card goes away');

select * from finish();
rollback;

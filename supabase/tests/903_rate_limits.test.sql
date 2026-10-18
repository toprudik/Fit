-- Rate limits of migration 20261018140317_rate_limits.sql: feedback past 5 in 10 minutes per author is refused in
-- the database, other authors are not affected, refusals don't count, and only the server calls rate_limit_hit.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_user('client_c');
select tests.create_user('client_d');

-- Five messages in a row pass.
select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.feedback (kind, body) select 'bug', 'Message ' || n from generate_series(1, 5) as n $$,
  'feedback: five messages in a row are fine'
);
select throws_ok(
  $$ insert into public.feedback (kind, body) values ('bug', 'Sixth') $$,
  'P0001', 'rate_limited', 'feedback: the sixth within 10 minutes is refused'
);
select throws_ok(
  $$ insert into public.feedback (kind, body) values ('bug', 'Seventh') $$,
  'P0001', 'rate_limited', 'feedback: and so is the next one'
);
select tests.clear_authentication();

select is(
  (select count(*)::integer from public.feedback where user_id = tests.user_id('client_c')), 5,
  'feedback: refused messages are not stored'
);
select is(
  (select count(*)::integer from public.notification_outbox where type = 'feedback_received'), 5,
  'feedback: refused messages reach nobody in the team group'
);
select is(
  (select hits from private.rate_limits where bucket = 'feedback:10m' and subject = tests.user_id('client_c')::text), 5,
  'feedback: a refusal does not count as a hit'
);

-- Another author has their own limit.
select tests.authenticate_as('client_d');
select lives_ok(
  $$ insert into public.feedback (kind, body) values ('idea', 'Mine') $$,
  'feedback: another author is not affected'
);
select tests.clear_authentication();

-- The window moves on: an older window does not count.
update private.rate_limits set window_start = window_start - interval '1 hour'
where bucket = 'feedback:10m' and subject = tests.user_id('client_c')::text;
select tests.authenticate_as('client_c');
select lives_ok(
  $$ insert into public.feedback (kind, body) values ('bug', 'Later') $$,
  'feedback: a new window lets the author write again'
);
select tests.clear_authentication();

-- The daily limit holds across windows.
update private.rate_limits set hits = 20
where bucket = 'feedback:day' and subject = tests.user_id('client_c')::text;
update private.rate_limits set window_start = window_start - interval '1 hour'
where bucket = 'feedback:10m' and subject = tests.user_id('client_c')::text;
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.feedback (kind, body) values ('bug', 'Twenty-first today') $$,
  'P0001', 'rate_limited', 'feedback: past 20 a day is refused'
);

-- Users can neither read nor reset the counters, nor call the server's entry.
select throws_ok($$ select * from private.rate_limits $$, '42501', null, 'users cannot read the counters');
select throws_ok($$ select public.rate_limit_hit('x', 'y', 1, 60) $$, '42501', null, 'users cannot call rate_limit_hit');
select tests.authenticate_as_anon();
select throws_ok($$ select public.rate_limit_hit('x', 'y', 1, 60) $$, '42501', null, 'anon cannot call rate_limit_hit');

-- The server's entry: true up to the limit, then false.
select tests.authenticate_as_service_role();
select results_eq(
  $$ select public.rate_limit_hit('sign-in', '42', 2, 600) from generate_series(1, 3) $$,
  $$ values (true), (true), (false) $$,
  'rate_limit_hit: allows the limit, then refuses'
);
select throws_ok($$ select public.rate_limit_hit('sign-in', '42', 2, 0) $$, '22023', null, 'rate_limit_hit: refuses an empty window');
select tests.clear_authentication();

select * from finish();
rollback;

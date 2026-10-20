-- Opting out of the app-opening count, migration 20261020110713_app_opens_opt_out.sql: the switch reads on by
-- default, off deletes the user's past openings and no new ones are written, on counts again from then, other
-- users are untouched, and nobody reads the opt-out table directly or calls the functions without a session.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_user('client_c');
select tests.create_user('client_d');

create function tests.opens_of(p_handle text) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.app_opens o where o.user_id = tests.user_id(p_handle)
$$;
grant execute on function tests.opens_of(text) to authenticated;

select tests.authenticate_as('client_d');
select public.record_app_open('session_reminder');

select tests.authenticate_as('client_c');
select is(public.my_app_opens_counted(), true, 'counted by default');
select public.record_app_open('session_reminder');
select public.record_app_open(null);
select is(tests.opens_of('client_c'), 2, 'openings are recorded while counted');

select lives_ok($$ select public.set_app_opens_counted(false) $$, 'switching off');
select is(public.my_app_opens_counted(), false, 'reads off after switching off');
select is(tests.opens_of('client_c'), 0, 'switching off deletes past openings');
select is(tests.opens_of('client_d'), 1, 'another user''s openings stay');
select public.record_app_open('daily_digest');
select is(tests.opens_of('client_c'), 0, 'no openings are recorded while off');
select lives_ok($$ select public.set_app_opens_counted(false) $$, 'switching off twice is fine');

select public.set_app_opens_counted(true);
select is(public.my_app_opens_counted(), true, 'reads on after switching back on');
select public.record_app_open(null);
select is(tests.opens_of('client_c'), 1, 'openings count again from then on');

select throws_ok($$ select public.set_app_opens_counted(null) $$, '22023', 'counted_required', 'the switch needs a value');
select throws_ok($$ select * from public.app_open_opt_outs $$, '42501', null, 'nobody reads the opt-out table directly');

select tests.authenticate_as_anon();
select throws_ok($$ select public.my_app_opens_counted() $$, '42501', null, 'anon cannot read the switch');
select throws_ok($$ select public.set_app_opens_counted(false) $$, '42501', null, 'anon cannot change the switch');

select * from finish();
rollback;

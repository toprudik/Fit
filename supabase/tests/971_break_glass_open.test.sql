-- Emergency access (migration 20261017174213_break_glass_open.sql, PRD wave-1 §4 ADM-13..15): only an admin opens
-- it, with a reason, for at most an hour; each call is logged and tells the user; access ends with the grant.
begin;
\ir _helpers.psql
select plan(17);

select tests.create_admin('admin_a');
select tests.create_user('client_c');
select tests.create_user('stranger_s');
insert into public.measurements (client_id, kind, value, measured_at, local_date)
values (tests.user_id('client_c'), 'weight', 70.5, now() - interval '1 day', current_date - 1);

create function tests.open_as(p_handle text, p_categories public.share_category[], p_reason text, p_minutes integer default 60)
returns text language plpgsql set search_path = '' as $$
begin
  perform tests.authenticate_as(p_handle);
  perform public.admin_open_break_glass(tests.user_id('client_c'), p_categories, p_reason, p_minutes);
  perform tests.clear_authentication();
  return 'opened';
end $$;

-- ADM-13: only an admin, only with a reason, only for some categories and at most an hour.
select tests.authenticate_as('stranger_s');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', tests.user_id('client_c'), '{measurements}', 'Support ticket about a lost weigh-in'),
  '42501', 'forbidden', 'a user who is not an admin cannot open access');
select tests.authenticate_as_anon();
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', tests.user_id('client_c'), '{measurements}', 'Support ticket about a lost weigh-in'),
  '42501', null, 'anon cannot call it');

select tests.authenticate_as('admin_a');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, null)', tests.user_id('client_c'), '{measurements}'),
  '22023', 'invalid_reason', 'a call without a reason is refused');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', tests.user_id('client_c'), '{measurements}', '   too short     '),
  '22023', 'invalid_reason', 'a reason shorter than 20 characters is refused');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', tests.user_id('client_c'), '{}', 'Support ticket about a lost weigh-in'),
  '22023', 'invalid_categories', 'at least one category');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L, 61)', tests.user_id('client_c'), '{measurements}', 'Support ticket about a lost weigh-in'),
  '22023', 'invalid_minutes', 'at most an hour');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L, 0)', tests.user_id('client_c'), '{measurements}', 'Support ticket about a lost weigh-in'),
  '22023', 'invalid_minutes', 'at least a minute');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', tests.user_id('admin_a'), '{measurements}', 'Support ticket about a lost weigh-in'),
  '22023', 'own_account', 'not on the admin''s own account');
select throws_ok(format('select public.admin_open_break_glass(%L, %L, %L)', gen_random_uuid(), '{measurements}', 'Support ticket about a lost weigh-in'),
  'P0002', 'not_found', 'an unknown user');
select is((select count(*)::int from public.measurements), 0, 'before a grant the admin does not see the client''s measurements');
select tests.clear_authentication();
select is((select count(*)::int from public.break_glass_grants), 0, 'refused calls leave no grant');

select is(tests.open_as('admin_a', '{measurements,measurements,photos}', '  Support ticket about a lost weigh-in  ', 30), 'opened', 'the admin opens access');
select results_eq(
  $$ select admin_id, target_user_id, categories::text, reason, expires_at - created_at from public.break_glass_grants $$,
  $$ values (tests.user_id('admin_a'), tests.user_id('client_c'), '{measurements,photos}'::text,
             'Support ticket about a lost weigh-in'::text, interval '30 minutes') $$,
  'the grant holds each category once, the trimmed reason and the chosen length');

-- ADM-14: logged and the user is told.
select results_eq(
  $$ select actor_id, target_id, reason, metadata -> 'categories' from public.admin_audit_log where action = 'break_glass.open' $$,
  $$ values (tests.user_id('admin_a'), tests.user_id('client_c'), 'Support ticket about a lost weigh-in'::text, '["measurements", "photos"]'::jsonb) $$,
  'the call is in the audit log');
select results_eq(
  $$ select user_id, payload -> 'categories', payload ->> 'reason' from public.notification_outbox where type = 'break_glass' $$,
  $$ values (tests.user_id('client_c'), '["measurements", "photos"]'::jsonb, 'Support ticket about a lost weigh-in'::text) $$,
  'the user gets a message about the access');

-- ADM-15: the admin reads the category while the grant is live, and not after it ends.
select tests.authenticate_as('admin_a');
select is((select count(*)::int from public.measurements), 1, 'with a live grant the admin sees the measurements');
select tests.clear_authentication();
update public.break_glass_grants set created_at = now() - interval '40 minutes', expires_at = now() - interval '10 minutes';
select tests.authenticate_as('admin_a');
select is((select count(*)::int from public.measurements), 0, 'after the grant ends the access is gone');
select tests.clear_authentication();

select * from finish();
rollback;

-- Functions no other test calls (found with track_functions = all over the whole suite, 18.10.2026): the privacy
-- dispatcher and the substitute reminder run by pg_cron, the group target RPCs, the export failure path and the
-- two delegation lists the Team screens read.
begin;
\ir _helpers.psql
select plan(29);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_pair('owner_a', c) from unnest(array['client_c', 'client_d']) c;
select tests.create_pair('trainer_b', 'client_e');
select tests.set_share('owner_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d']) c;
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('sub_s'));
update public.profiles set first_name = 'Ирина', last_name = 'Соколова' where id = tests.user_id('owner_a');
update public.profiles set first_name = 'Олег', last_name = null where id = tests.user_id('sub_s');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated, service_role;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;
create function tests.token(p_name text) returns text language sql stable set search_path = '' as $$
  select token from tests.tokens where name = p_name
$$;
insert into tests.ids values ('pair_c', tests.pair_id('owner_a', 'client_c')), ('pair_d', tests.pair_id('owner_a', 'client_d'));

-- =========================================================================================================
-- private.queue_delegation_reminders: an unanswered substitute invite reminds the owner once, 2 hours ahead

insert into tests.ids values
  ('s_soon', tests.create_session('owner_a', date_trunc('minute', now()) + interval '90 minutes', 'group', 4)),
  ('s_later', tests.create_session('owner_a', date_trunc('minute', now()) + interval '1 day', 'group', 4));
select tests.create_booking(tests.id('s_soon'), 'owner_a', 'client_c');
select tests.authenticate_as('owner_a');
insert into tests.tokens select 'soon', token from public.create_delegation('substitute', tests.id('s_soon'));
insert into tests.tokens select 'later', token from public.create_delegation('substitute', tests.id('s_later'));
select tests.clear_authentication();

select is(private.queue_delegation_reminders(), 1, 'delegation reminders: only the invite for the session within 2 hours');
select results_eq(
  $$ select o.user_id, o.payload ->> 'event', o.session_id from public.notification_outbox o where o.type = 'delegation' $$,
  format($$ values (%L::uuid, 'pending'::text, %L::uuid) $$, tests.user_id('owner_a'), tests.id('s_soon')),
  'delegation reminders: the owner is told the substitute has not answered'
);
select is(private.queue_delegation_reminders(), 0, 'delegation reminders: a second run sends nothing again');

-- An accepted invite needs no reminder.
update public.delegations set reminded_at = null where session_id = tests.id('s_soon');
select tests.authenticate_as('sub_s');
select public.accept_delegation(tests.token('soon'));
select tests.clear_authentication();
select is(private.queue_delegation_reminders(), 0, 'delegation reminders: an accepted invite is not chased');

-- =========================================================================================================
-- public.my_delegations and public.my_pair_delegates

select tests.authenticate_as('owner_a');
select results_eq(
  $$ select side, kind::text, status::text, other_name, session_id from public.my_delegations() order by session_starts_at $$,
  format($$ values ('owner'::text, 'substitute'::text, 'active'::text, 'Олег'::text, %L::uuid),
                   ('owner', 'substitute', 'pending', null, %L::uuid) $$, tests.id('s_soon'), tests.id('s_later')),
  'my_delegations: the owner sees both invites, named by the substitute once accepted'
);
select tests.authenticate_as('sub_s');
select results_eq(
  $$ select side, status::text, other_name, other_id from public.my_delegations() $$,
  format($$ values ('delegate'::text, 'active'::text, 'Ирина Соколова'::text, %L::uuid) $$, tests.user_id('owner_a')),
  'my_delegations: the substitute sees only what they accepted, named by the owner'
);
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.my_delegations()), 0, 'my_delegations: a stranger sees nothing');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.my_delegations() $$, '42501', null, 'my_delegations: anon cannot call it');

-- The session ended: the substitute's delegation reads as expired.
select tests.clear_authentication();
update public.sessions set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
where id = tests.id('s_soon');
select tests.authenticate_as('owner_a');
select is((select status::text from public.my_delegations() where session_id = tests.id('s_soon')), 'expired',
  'my_delegations: an active substitute after the session reads as expired');
select tests.clear_authentication();
update public.sessions set starts_at = now() + interval '90 minutes', ends_at = now() + interval '150 minutes'
where id = tests.id('s_soon');

-- The client booked on the delegated session sees the substitute; the client who is not booked does not.
select tests.authenticate_as('client_c');
select results_eq(
  $$ select kind::text, delegate_name, progress_blocked from public.my_pair_delegates() $$,
  $$ values ('substitute'::text, 'Олег'::text, false) $$,
  'my_pair_delegates: the booked client sees who runs the session'
);
select tests.authenticate_as('client_d');
select is((select count(*)::int from public.my_pair_delegates()), 0, 'my_pair_delegates: a client not booked sees none');
select tests.authenticate_as('client_e');
select is((select count(*)::int from public.my_pair_delegates()), 0, 'my_pair_delegates: another trainer''s client sees none');

-- =========================================================================================================
-- public.set_primary_nutrition_group and public.clear_group_target

select tests.authenticate_as('owner_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Сушка', 'lose'), (auth.uid(), 'Масса', 'gain');
insert into tests.ids select 'g_lose', id from public.groups where name = 'Сушка';
insert into tests.ids select 'g_gain', id from public.groups where name = 'Масса';
select public.add_group_member(tests.id('g_lose'), tests.id('pair_c'));
select public.add_group_member(tests.id('g_gain'), tests.id('pair_c'));
select public.set_group_target(tests.id('g_lose'), 1600, 120, 50, 160, 2000, 10000);
select public.set_group_target(tests.id('g_gain'), 2800, 150, 80, 350, 2500, 8000);

select throws_ok(format($$ select public.set_primary_nutrition_group(%L, %L) $$, tests.id('pair_d'), tests.id('g_lose')),
  'P0001', 'not_a_member', 'set_primary_nutrition_group: the client must be in the group');
select lives_ok(format($$ select public.set_primary_nutrition_group(%L, %L) $$, tests.id('pair_c'), tests.id('g_lose')),
  'set_primary_nutrition_group: the trainer picks the group whose target counts');
select tests.authenticate_as('client_c');
select results_eq($$ select kcal::int, group_name from public.my_nutrition_target() $$, $$ values (1600, 'Сушка'::text) $$,
  'set_primary_nutrition_group: the client gets the chosen group''s target');
select tests.authenticate_as('owner_a');
select public.set_primary_nutrition_group(tests.id('pair_c'), tests.id('g_gain'));
select tests.authenticate_as('client_c');
select results_eq($$ select kcal::int, group_name from public.my_nutrition_target() $$, $$ values (2800, 'Масса'::text) $$,
  'set_primary_nutrition_group: a new choice switches the target');

select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select public.set_primary_nutrition_group(%L, %L) $$, tests.id('pair_c'), tests.id('g_lose')),
  '42501', 'forbidden', 'set_primary_nutrition_group: only the group''s trainer');
select throws_ok(format($$ select public.clear_group_target(%L) $$, tests.id('g_gain')),
  '42501', 'forbidden', 'clear_group_target: only the group''s trainer');

select tests.authenticate_as('owner_a');
select lives_ok(format($$ select public.clear_group_target(%L) $$, tests.id('g_gain')),
  'clear_group_target: the trainer clears the group target');
select tests.clear_authentication();
select is(private.group_template(tests.id('g_gain')), null, 'clear_group_target: the group has no open template');
select tests.authenticate_as('client_c');
select results_eq($$ select kcal::int, group_name from public.my_nutrition_target() $$, $$ values (1600, 'Сушка'::text) $$,
  'clear_group_target: the client falls back to the other group''s target');
select tests.authenticate_as('owner_a');
select lives_ok(format($$ select public.clear_group_target(%L) $$, tests.id('g_gain')),
  'clear_group_target: clearing twice is harmless');

-- =========================================================================================================
-- public.fail_data_export

select tests.authenticate_as('client_d');
insert into tests.ids values ('export', public.request_data_export());
select throws_ok(format($$ select public.fail_data_export(%L) $$, tests.id('export')), '42501', null,
  'fail_data_export: a user cannot call it');
select tests.authenticate_as_service_role();
select public.fail_data_export(tests.id('export'));
select is((select status::text from public.data_exports where id = tests.id('export')), 'queued',
  'fail_data_export: a queued export is left for the worker');
select user_id from public.claim_data_exports();
select public.fail_data_export(tests.id('export'));
select is((select status::text from public.data_exports where id = tests.id('export')), 'failed',
  'fail_data_export: a processing export is marked failed');

-- =========================================================================================================
-- private.dispatch_privacy

select tests.clear_authentication();
select is(private.dispatch_privacy(), null, 'dispatch_privacy: no request while no export or deletion is due');
insert into public.account_deletions (user_id, requested_at, scheduled_for)
values (tests.user_id('client_e'), now() - interval '31 days', now() - interval '1 minute');
select is(private.dispatch_privacy(), null, 'dispatch_privacy: no request while the Vault secrets are not set');
select private.configure_notification_dispatch('https://fit.example/api/cron/notifications', repeat('s', 40));
select isnt(private.dispatch_privacy(), null, 'dispatch_privacy: a due deletion queues a request');
select is(
  (select r.url || ' ' || (r.headers ->> 'Authorization') from net.http_request_queue r order by r.id desc limit 1),
  'https://fit.example/api/cron/privacy Bearer ' || repeat('s', 40),
  'dispatch_privacy: the request goes to the privacy route with the bearer secret'
);

select * from finish();
rollback;

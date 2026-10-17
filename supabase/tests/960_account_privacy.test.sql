-- Account deletion and data export of migration 20261017020300_account_privacy.sql (PRD wave-1 §2.12 rules 6-8,
-- PRIV-6, PRIV-7; data-model §1.6): the 30-day request and its cancellation, what the request cancels at once,
-- the anonymization onto the "deleted client" stub, and the export queue of the privacy route.
begin;
\ir _helpers.psql
select plan(56);

-- C trains with A and B, D with A; M is A's client card. C has a future and a past booking with A and a
-- future request to B; A has an open slot and a weekly recurrence with C.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_card('trainer_a', 'card_m');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

insert into tests.ids values
  ('s_future_a', tests.create_session('trainer_a', now() + interval '3 days')),
  ('s_past_a', tests.create_session('trainer_a', now() - interval '3 days')),
  ('s_future_b', tests.create_session('trainer_b', now() + interval '4 days')),
  ('s_future_ad', tests.create_session('trainer_a', now() + interval '5 days'));
insert into tests.ids values
  ('b_future_a', tests.create_booking(tests.i('s_future_a'), 'trainer_a', 'client_c', 'confirmed')),
  ('b_past_a', tests.create_booking(tests.i('s_past_a'), 'trainer_a', 'client_c', 'attended')),
  ('b_future_b', tests.create_booking(tests.i('s_future_b'), 'trainer_b', 'client_c', 'requested', 'client_slot')),
  ('b_future_ad', tests.create_booking(tests.i('s_future_ad'), 'trainer_a', 'client_d', 'confirmed')),
  ('pass_ac', tests.create_pass('trainer_a', 'client_c', 8, 800000));
insert into public.slots (trainer_id, starts_at, ends_at) values
  (tests.u('trainer_a'), now() + interval '6 days', now() + interval '6 days 1 hour');
insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
select tests.u('trainer_a'), tests.pair_id('trainer_a', 'client_c'), 'FREQ=WEEKLY;BYDAY=MO', (now() + interval '7 days')::timestamp, 'Europe/Moscow', 60, 'personal';
insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
values (tests.u('client_c'), 'weight', 80, now() - interval '1 day', current_date - 1, tests.u('client_c'));
insert into public.coaching_notes (coaching_id, author_id, body)
values (tests.pair_id('trainer_a', 'client_c'), tests.u('trainer_a'), 'knee');
update public.trainer_profiles set is_public = true where user_id = tests.u('trainer_a');
update public.coaching_trainer_meta set client_alias = 'Cee', contact = '+70000000000'
where coaching_id = tests.pair_id('trainer_a', 'client_c');

-- =========================================================================================================
-- request_account_deletion

select tests.authenticate_as_anon();
select throws_ok($$ select public.request_account_deletion() $$, '42501', null, 'anon cannot request a deletion');

select tests.authenticate_as('client_c');
select ok(
  public.request_account_deletion() between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days' + interval '1 minute',
  'the request schedules the deletion 30 days ahead'
);
select is(
  public.request_account_deletion(),
  (select d.scheduled_for from public.account_deletions d where d.user_id = tests.u('client_c')),
  'repeating the request keeps the first date'
);
select tests.clear_authentication();

select is((select count(*)::int from public.account_deletions where user_id = tests.u('client_c')), 1, 'one deletion row');
select is(
  (select raw_app_meta_data -> 'deletion_pending' from auth.users where id = tests.u('client_c')),
  'true'::jsonb,
  'the session token will carry the deletion mark'
);
select isnt(
  (select raw_app_meta_data -> 'telegram_id' from auth.users where id = tests.u('client_c')),
  null,
  'the Telegram key stays'
);
select is((select status::text from public.bookings where id = tests.i('b_future_a')), 'cancelled', 'a future confirmed booking is cancelled');
select is((select status::text from public.bookings where id = tests.i('b_future_b')), 'cancelled', 'a future requested booking is cancelled');
select is(
  (select cancelled_by_role::text || '/' || cancel_reason from public.bookings where id = tests.i('b_future_a')),
  'system/account_deletion',
  'the system cancelled it for the account deletion'
);
select is((select status::text from public.bookings where id = tests.i('b_past_a')), 'attended', 'a past booking stays as it was');
select is((select status::text from public.bookings where id = tests.i('b_future_ad')), 'confirmed', 'another client''s booking stays');
select is(
  (select count(*)::int from public.booking_events where booking_id in (tests.i('b_future_a'), tests.i('b_future_b')) and to_status = 'cancelled' and actor_role = 'system'),
  2,
  'both cancellations are in the booking history'
);
select is((select status::text from public.sessions where id = tests.i('s_future_a')), 'cancelled', 'the client''s personal session left empty is cancelled');
select is((select status::text from public.sessions where id = tests.i('s_future_ad')), 'scheduled', 'the trainer''s other sessions stay');
select isnt(
  (select ended_at from public.recurrences where coaching_id = tests.pair_id('trainer_a', 'client_c')),
  null,
  'the pair''s recurrence ends'
);
select is(
  (select status::text from public.slots where trainer_id = tests.u('trainer_a')),
  'open',
  'a client''s deletion leaves the trainer''s slots open'
);
select is(
  (select count(*)::int from public.passes where id = tests.i('pass_ac') and status = 'active'),
  (select count(*)::int from public.passes where id = tests.i('pass_ac')),
  'the pass itself is not touched'
);

select is(
  (select payload ->> 'cancelled' from public.notification_outbox where type = 'counterpart_deleting' and user_id = tests.u('trainer_a')),
  '1',
  'trainer A hears about the deletion and the one cancelled booking'
);
select is(
  (select payload ->> 'side' from public.notification_outbox where type = 'counterpart_deleting' and user_id = tests.u('trainer_b')),
  'client',
  'trainer B hears it too'
);
select is(
  (select count(*)::int from public.notification_outbox where type = 'counterpart_deleting' and user_id = tests.u('card_m')),
  0,
  'nobody else is told'
);
select is(
  (select payload ->> 'stage' from public.notification_outbox where type = 'account_deletion' and user_id = tests.u('client_c')),
  'requested',
  'the client gets the confirmation with the date'
);

-- A partner reads the pending deletion (the "deleting" mark); a stranger does not.
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.account_deletions where user_id = tests.u('client_c')), 1, 'the partner sees the deletion');
select tests.authenticate_as('client_d');
select is((select count(*)::int from public.account_deletions where user_id = tests.u('client_c')), 0, 'a stranger does not');

-- =========================================================================================================
-- cancel_account_deletion

select tests.authenticate_as('client_c');
select ok(public.cancel_account_deletion(), 'the client cancels the deletion');
select ok(not public.cancel_account_deletion(), 'a second cancel has nothing to cancel');
select tests.clear_authentication();
select isnt((select cancelled_at from public.account_deletions where user_id = tests.u('client_c')), null, 'the row records the cancellation');
select is((select raw_app_meta_data -> 'deletion_pending' from auth.users where id = tests.u('client_c')), null, 'the mark is gone');
select is((select status::text from public.bookings where id = tests.i('b_future_a')), 'cancelled', 'what was cancelled stays cancelled');
select is(
  (select count(*)::int from public.notification_outbox where type = 'account_deletion' and user_id = tests.u('client_c') and payload ->> 'stage' = 'cancelled'),
  1,
  'the client gets the cancellation message'
);

-- A new request after a cancel starts a new 30 days.
select tests.authenticate_as('client_c');
select lives_ok($$ select public.request_account_deletion() $$, 'the client asks again');
select tests.clear_authentication();
select is((select cancelled_at from public.account_deletions where user_id = tests.u('client_c')), null, 'the request is pending again');

-- A trainer's request cancels the trainer's future sessions and closes the open slots.
select tests.authenticate_as('trainer_a');
select lives_ok($$ select public.request_account_deletion() $$, 'trainer A asks to delete the account');
select tests.clear_authentication();
select is((select status::text from public.sessions where id = tests.i('s_future_ad')), 'cancelled', 'the trainer''s future sessions are cancelled');
select is((select status::text from public.bookings where id = tests.i('b_future_ad')), 'cancelled', 'and their bookings');
select is((select status::text from public.slots where trainer_id = tests.u('trainer_a')), 'closed', 'the open slots close');
select is(
  (select count(*)::int from public.trainer_profiles where user_id = tests.u('trainer_a') and private.showcase_is_open(trainer_profiles)),
  0,
  'the showcase goes dark'
);
select is(
  (select payload ->> 'side' from public.notification_outbox where type = 'counterpart_deleting' and user_id = tests.u('client_d')),
  'trainer',
  'client D hears that the trainer is leaving'
);

-- =========================================================================================================
-- purge_account

select tests.authenticate_as('client_c');
select throws_ok($$ select public.purge_account(tests.u('client_c')) $$, '42501', null, 'a user cannot run the purge');
select tests.authenticate_as_service_role();
select is(public.purge_account(tests.u('client_c')), null::uuid[], 'nothing is purged before the date');
select tests.clear_authentication();

update public.account_deletions set requested_at = now() - interval '31 days', scheduled_for = now() - interval '1 day'
where user_id in (tests.u('client_c'), tests.u('trainer_a'));

select tests.authenticate_as_service_role();
select is(public.purge_account(tests.u('client_c')), array[tests.u('client_c')], 'the due client is purged');
select tests.clear_authentication();

select is((select count(*)::int from public.measurements where client_id = tests.u('client_c')), 0, 'measurements are gone');
select is((select count(*)::int from public.coaching_notes where body = 'knee'), 0, 'the trainer''s notes about the client are gone');
select is(
  (select count(*)::int from public.coachings where client_id = tests.u('client_c')),
  0,
  'no pair points to the client any more'
);
select is(
  (select count(*)::int from public.coachings where client_id = private.deleted_client_id() and status = 'ended'),
  2,
  'both pairs ended under the stub'
);
select is(
  (select client_id from public.passes where id = tests.i('pass_ac')),
  private.deleted_client_id(),
  'the trainer keeps the pass, under the stub'
);
select is(
  (select count(*)::int from public.coaching_trainer_meta m join public.coachings c on c.id = m.coaching_id
   where c.client_id = private.deleted_client_id() and (m.client_alias is not null or m.contact is not null)),
  0,
  'the trainer''s alias and contact of the client are cleared'
);
select is(
  (select count(*)::int from public.admin_audit_log where action = 'account.purge' and target_id = tests.u('client_c')),
  1,
  'the audit log keeps the fact'
);
select lives_ok($$ delete from auth.users where id = tests.u('client_c') $$, 'the Auth user can go now');

-- A trainer's purge takes the client cards along.
select tests.authenticate_as_service_role();
select is(
  (select array_agg(x order by x) from unnest(public.purge_account(tests.u('trainer_a'))) x),
  (select array_agg(x order by x) from unnest(array[tests.u('trainer_a'), tests.u('card_m')]) x),
  'the trainer is purged with the card'
);
select tests.clear_authentication();
select is((select count(*)::int from public.trainer_profiles where user_id = tests.u('trainer_a')), 0, 'the trainer profile is gone');
select lives_ok(
  $$ delete from auth.users where id in (tests.u('trainer_a'), tests.u('card_m')) $$,
  'the Auth users of the trainer and the card can go'
);

-- =========================================================================================================
-- data export

select tests.authenticate_as('client_d');
select is(public.request_data_export(), public.request_data_export(), 'a second tap reuses the queued export');
select throws_ok($$ select * from public.claim_data_exports() $$, '42501', null, 'a user cannot claim exports');
select tests.authenticate_as_service_role();
select is(
  (select user_id from public.claim_data_exports()),
  tests.u('client_d'),
  'the route claims the queued export'
);
select lives_ok(
  format($$ select public.complete_data_export(
    (select id from public.data_exports where user_id = %L), %L) $$, tests.u('client_d'), tests.u('client_d')::text || '/x'),
  'the route completes it'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'export_ready' and user_id = tests.u('client_d')),
  1,
  'the bot will send the link'
);

select * from finish();
rollback;

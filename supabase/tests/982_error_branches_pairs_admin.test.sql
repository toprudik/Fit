-- Error branches no other test reaches with the exact message: input guards of the notification dispatch setup,
-- the outbox and export routes, admin invites and referral terms, pass adjustments, past sessions, calendar
-- feeds, delegations, challenges, broadcasts, waitlist offers, schedule reopening and card claims. Each refusal
-- is checked with its SQLSTATE and message, as the role the app calls it with, next to a call that passes where
-- that is cheap, and with a look at the rows a refused call must leave alone. The two previews (cancel and
-- reschedule) roll their trial run back internally: for them the test checks the promise instead, an answer
-- and no change.
begin;
\ir _helpers.psql
select plan(77);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_g');
select tests.create_user('client_h');
select tests.create_pair('trainer_a', 'client_c') as pair_c \gset
select tests.create_pair('trainer_a', 'client_d') as pair_d \gset
select tests.create_pair('trainer_a', 'client_f', 'ended') as pair_f \gset
select tests.create_pair('trainer_a', 'client_g', 'ended') as pair_g \gset
select tests.create_pair('trainer_a', 'client_h') as pair_h \gset
select tests.create_card('trainer_a', 'card_k') as card_k \gset

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated, service_role;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.add_slot(p_trainer text, p_starts_at timestamptz, p_status public.slot_status default 'open')
returns uuid language sql set search_path = '' as $$
  insert into public.slots (trainer_id, starts_at, ends_at, status)
  values (tests.user_id(p_trainer), p_starts_at, p_starts_at + interval '1 hour', p_status) returning id
$$;
-- Rows hidden from users by RLS, counted as the table owner from any role.
create function tests.count_rows(p_sql text) returns integer language plpgsql stable security definer
set search_path = '' as $$
declare
  v integer;
begin
  execute p_sql into v;
  return v;
end $$;
grant execute on function tests.count_rows(text) to authenticated, service_role;

insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 5, 500000));

-- =========================================================================================================
-- private.configure_notification_dispatch (run by the owner in SQL, never by the app)

select count(*)::int as vault_before from vault.secrets
where name in ('notifications_dispatch_url', 'notifications_cron_secret') \gset

select throws_ok(
  $$ select private.configure_notification_dispatch('http://fit.example/api/cron/notifications', repeat('a', 40)) $$,
  '22023', 'invalid url', 'configure_notification_dispatch: a plain http url is refused');
select throws_ok(
  $$ select private.configure_notification_dispatch(null, repeat('a', 40)) $$,
  '22023', 'invalid url', 'configure_notification_dispatch: a missing url is refused');
select throws_ok(
  $$ select private.configure_notification_dispatch('https://fit.example/api/cron/other', repeat('a', 40)) $$,
  '22023', 'invalid url', 'configure_notification_dispatch: a url to another route is refused');
select throws_ok(
  $$ select private.configure_notification_dispatch('https://fit.example/api/cron/notifications', repeat('a', 31)) $$,
  '22023', 'invalid secret', 'configure_notification_dispatch: a secret under 32 characters is refused');
select throws_ok(
  $$ select private.configure_notification_dispatch('https://fit.example/api/cron/notifications', repeat('a', 39) || '!') $$,
  '22023', 'invalid secret', 'configure_notification_dispatch: a secret with other characters is refused');
select throws_ok(
  $$ select private.configure_notification_dispatch('https://fit.example/api/cron/notifications', null) $$,
  '22023', 'invalid secret', 'configure_notification_dispatch: a missing secret is refused');
select is(
  (select count(*)::int from vault.secrets where name in ('notifications_dispatch_url', 'notifications_cron_secret')),
  :vault_before, 'configure_notification_dispatch: a refused call writes no secret');
select lives_ok(
  $$ select private.configure_notification_dispatch('https://fit.example/api/cron/notifications', repeat('a', 32)) $$,
  'configure_notification_dispatch: a 32-character secret and the notifications route pass');

-- =========================================================================================================
-- private.own_live_pair (the client's live pair with a trainer, used by the booking RPCs)

select tests.set_claims('client_e');
select throws_ok(format('select (private.own_live_pair(%L)).id', tests.u('trainer_a')),
  '42501', 'not_your_trainer', 'own_live_pair: a client without a pair with the trainer is refused');
select tests.set_claims('client_f');
select throws_ok(format('select (private.own_live_pair(%L)).id', tests.u('trainer_a')),
  '42501', 'not_your_trainer', 'own_live_pair: an ended pair does not count');
select tests.set_claims('client_c');
select is((private.own_live_pair(tests.u('trainer_a'))).id, :'pair_c'::uuid, 'own_live_pair: a live pair is returned');
select tests.clear_authentication();

-- =========================================================================================================
-- public.accept_waitlist_offer

select tests.authenticate_as('trainer_a');
select session_id as yoga from public.create_group_session(now() + interval '8 days', 60::smallint, 2::smallint, 'Йога', 'online') \gset
select tests.authenticate_as('client_c');
select b.booking_id as booking_yoga_c from public.book_group_session(:'yoga') b \gset
select tests.authenticate_as('client_h');
select b.booking_id as booking_yoga_h from public.book_group_session(:'yoga') b \gset
select tests.authenticate_as('client_d');
select public.join_waitlist(:'yoga');
select tests.clear_authentication();
select w.id as entry_d from public.waitlist_entries w where w.session_id = :'yoga' and w.client_id = tests.u('client_d') \gset

select tests.authenticate_as('client_d');
select throws_ok(format('select * from public.accept_waitlist_offer(%L)', :'entry_d'),
  'P0001', 'offer_expired', 'accept_waitlist_offer: a place that was never offered cannot be accepted');
select tests.clear_authentication();
update public.waitlist_entries
set status = 'offered', offered_at = now() - interval '40 minutes', offer_expires_at = now() - interval '10 minutes'
where id = :'entry_d';
select tests.authenticate_as('client_d');
select throws_ok(format('select * from public.accept_waitlist_offer(%L)', :'entry_d'),
  'P0001', 'offer_expired', 'accept_waitlist_offer: an offer past its time cannot be accepted');
select tests.clear_authentication();
select is(
  (select row((select count(*)::int from public.bookings where session_id = :'yoga' and client_id = tests.u('client_d')),
              (select status::text from public.waitlist_entries where id = :'entry_d'))::text),
  row(0, 'offered')::text, 'accept_waitlist_offer: a refused accept books nothing and leaves the entry as it was');

-- =========================================================================================================
-- public.adjust_pass

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.adjust_pass(%L, 0, 'Поправка') $$, tests.id('pass_c')),
  '22023', 'invalid_delta', 'adjust_pass: a zero delta is refused');
select throws_ok(format($$ select public.adjust_pass(%L, 201, 'Поправка') $$, tests.id('pass_c')),
  '22023', 'invalid_delta', 'adjust_pass: more than 200 sessions at once is refused');
select throws_ok(format($$ select public.adjust_pass(%L, -201, 'Поправка') $$, tests.id('pass_c')),
  '22023', 'invalid_delta', 'adjust_pass: less than -200 sessions at once is refused');
select throws_ok(format($$ select public.adjust_pass(%L, null, 'Поправка') $$, tests.id('pass_c')),
  '22023', 'invalid_delta', 'adjust_pass: a missing delta is refused');
select is(
  tests.count_rows(format($$ select count(*)::int from public.ledger_entries where pass_id = %L and entry_type = 'adjustment' $$,
                          tests.id('pass_c'))),
  0, 'adjust_pass: a refused delta writes no ledger entry');
select lives_ok(format($$ select public.adjust_pass(%L, 1, 'Поправка') $$, tests.id('pass_c')),
  'adjust_pass: a delta of one with a note passes');

-- =========================================================================================================
-- public.admin_create_trainer_invite

select tests.authenticate_as('admin_x');
select throws_ok($$ select * from public.admin_create_trainer_invite('Зал на Ленина', 0) $$,
  '22023', 'invalid_valid_days', 'admin_create_trainer_invite: zero days is refused');
select throws_ok($$ select * from public.admin_create_trainer_invite('Зал на Ленина', 91) $$,
  '22023', 'invalid_valid_days', 'admin_create_trainer_invite: more than 90 days is refused');
select throws_ok($$ select * from public.admin_create_trainer_invite('Зал на Ленина', null) $$,
  '22023', 'invalid_valid_days', 'admin_create_trainer_invite: a missing term is refused');
select is(tests.count_rows('select count(*)::int from public.trainer_invites'), 0,
  'admin_create_trainer_invite: a refused call creates no invite');
select lives_ok($$ select * from public.admin_create_trainer_invite('Зал на Ленина', 90) $$,
  'admin_create_trainer_invite: 90 days passes');

-- =========================================================================================================
-- public.admin_set_trainer_referral_bonus

select throws_ok($$ select public.admin_set_trainer_referral_bonus('plan_month', 10::smallint) $$,
  '22023', 'bonus_invalid', 'admin_set_trainer_referral_bonus: a month of Pro with a percent is refused');
select throws_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', 0::smallint) $$,
  '22023', 'bonus_invalid', 'admin_set_trainer_referral_bonus: a zero percent discount is refused');
select throws_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', 101::smallint) $$,
  '22023', 'bonus_invalid', 'admin_set_trainer_referral_bonus: a discount over 100 percent is refused');
select throws_ok($$ select public.admin_set_trainer_referral_bonus(null) $$,
  '22023', 'bonus_invalid', 'admin_set_trainer_referral_bonus: a missing kind is refused');
select tests.clear_authentication();
select is(
  (select row(t.bonus_kind::text, t.discount_percent,
              (select count(*)::int from public.admin_audit_log where action = 'trainer_referral.set_bonus'))::text
   from public.trainer_referral_terms t),
  row('plan_month', null::smallint, 0)::text,
  'admin_set_trainer_referral_bonus: a refused call keeps the terms and logs nothing');
select tests.authenticate_as('admin_x');
select lives_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', 100::smallint) $$,
  'admin_set_trainer_referral_bonus: a 100 percent discount passes');

-- =========================================================================================================
-- public.cancel_preview and public.reschedule_preview: an answer, and nothing changes

select tests.clear_authentication();
insert into tests.ids values
  ('slot_5h', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '5 hours')),
  ('slot_4d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '4 days')),
  ('slot_5d', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '5 days'));
select tests.authenticate_as('client_c');
insert into tests.ids select 'b_late', booking_id from public.book_slot(tests.id('slot_5h'));
insert into tests.ids select 'b_move', booking_id from public.book_slot(tests.id('slot_4d'));
select tests.clear_authentication();
select count(*)::int as events_before from public.booking_events where booking_id in (tests.id('b_late'), tests.id('b_move')) \gset
select count(*)::int as bookings_before from public.bookings where client_id = tests.u('client_c') \gset

select tests.authenticate_as('client_c');
select results_eq(
  format('select late, charged, pass_title is not null from public.cancel_preview(%L)', tests.id('b_late')),
  $$ values (true, true, true) $$,
  'cancel_preview: a late cancellation says it would be charged to the pass');
select results_eq(
  format('select confirmed, pass_title is not null from public.reschedule_preview(%L, %L)', tests.id('b_move'), tests.id('slot_5d')),
  $$ values (true, true) $$,
  'reschedule_preview: a move to a free slot says the pass covers it');
select tests.clear_authentication();
select is(
  (select row(
     (select string_agg(b.status::text, ',' order by s.starts_at) from public.bookings b join public.sessions s on s.id = b.session_id
      where b.id in (tests.id('b_late'), tests.id('b_move'))),
     (select count(*)::int from public.ledger_entries where booking_id = tests.id('b_late') and entry_type = 'charge'),
     (select count(*)::int from public.booking_events where booking_id in (tests.id('b_late'), tests.id('b_move'))),
     (select count(*)::int from public.bookings where client_id = tests.u('client_c')),
     (select status::text from public.slots where id = tests.id('slot_5d')))::text),
  row('confirmed,confirmed', 0, :events_before, :bookings_before, 'open')::text,
  'previews: the bookings stay confirmed, nothing is charged, logged or booked, the slot stays open');

-- =========================================================================================================
-- public.claim_outbox and public.record_outbox_result (the notification route, service role)

insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after, status, attempts, locked_until)
values (tests.u('client_c'), 'bot_test', 'test:982:processing', '{}', now(), now(), 'processing', 1, now() + interval '5 minutes');
select id as outbox_row from public.notification_outbox where dedupe_key = 'test:982:processing' \gset
select count(*)::int as processing_before from public.notification_outbox where status = 'processing' \gset

select tests.authenticate_as_service_role();
select throws_ok($$ select * from public.claim_outbox(0) $$, '22023', 'invalid limit', 'claim_outbox: a limit of 0 is refused');
select throws_ok($$ select * from public.claim_outbox(101) $$, '22023', 'invalid limit', 'claim_outbox: a limit over 100 is refused');
select throws_ok($$ select * from public.claim_outbox(null) $$, '22023', 'invalid limit', 'claim_outbox: a missing limit is refused');
select is(tests.count_rows($$ select count(*)::int from public.notification_outbox where status = 'processing' $$), :processing_before,
  'claim_outbox: a refused call claims nothing');

select throws_ok(format($$ select public.record_outbox_result(%s, 'lost') $$, :outbox_row),
  '22023', 'invalid outcome', 'record_outbox_result: an unknown outcome is refused');
select throws_ok(format($$ select public.record_outbox_result(%s, null) $$, :outbox_row),
  '22023', 'invalid outcome', 'record_outbox_result: a missing outcome is refused');
select throws_ok(format($$ select public.record_outbox_result(%s, 'retry', null, 'flood', -1) $$, :outbox_row),
  '22023', 'invalid retry_after', 'record_outbox_result: a negative retry_after is refused');
select throws_ok(format($$ select public.record_outbox_result(%s, 'retry', null, 'flood', 86401) $$, :outbox_row),
  '22023', 'invalid retry_after', 'record_outbox_result: a retry_after over a day is refused');
select is(
  tests.count_rows(format($$ select count(*)::int from public.notification_outbox
                            where id = %s and status = 'processing' and attempts = 1 and last_error is null $$, :outbox_row)),
  1, 'record_outbox_result: a refused call leaves the row in processing');
select is(public.record_outbox_result(:outbox_row, 'retry', null, 'flood', 86400)::text, 'pending',
  'record_outbox_result: a retry_after of a full day passes');

-- =========================================================================================================
-- public.complete_data_export (the export route, service role)

select tests.clear_authentication();
insert into public.data_exports (user_id) values (tests.u('client_c'));
select id as export_c from public.data_exports where user_id = tests.u('client_c') \gset
select tests.authenticate_as_service_role();
select throws_ok(format('select public.complete_data_export(%L, %L)', gen_random_uuid(), tests.u('client_c')::text || '/x.zip'),
  'P0001', 'export_not_processing', 'complete_data_export: an unknown export is refused');
select throws_ok(format('select public.complete_data_export(%L, %L)', :'export_c', tests.u('client_c')::text || '/x.zip'),
  'P0001', 'export_not_processing', 'complete_data_export: an export nobody claimed yet is refused');
select tests.clear_authentication();
select is(
  (select row(e.status::text, e.storage_path,
              (select count(*)::int from public.notification_outbox where type = 'export_ready' and user_id = tests.u('client_c')))::text
   from public.data_exports e where e.id = :'export_c'),
  row('queued', null::text, 0)::text, 'complete_data_export: a refused call keeps the export queued and sends no link');

-- =========================================================================================================
-- public.create_calendar_feed

select tests.authenticate_as('client_c');
select throws_ok($$ select public.create_calendar_feed(null) $$, 'P0001', 'zone_invalid',
  'create_calendar_feed: a missing zone is refused');
select is(tests.count_rows(format('select count(*)::int from public.calendar_feeds where user_id = %L', tests.u('client_c'))), 0,
  'create_calendar_feed: a refused call issues no feed');

-- =========================================================================================================
-- public.create_delegation

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select * from public.create_delegation('assistant', null, '{progress,workouts}', true, null, now() - interval '1 hour') $$,
  '22023', 'invalid_dates', 'create_delegation: an assistant access that already ended is refused');
select throws_ok(
  $$ select * from public.create_delegation('assistant', null, '{progress,workouts}', true, null, now()) $$,
  '22023', 'invalid_dates', 'create_delegation: an assistant access ending right now is refused');
select is(tests.count_rows(format('select count(*)::int from public.delegations where owner_trainer_id = %L', tests.u('trainer_a'))), 0,
  'create_delegation: a refused call creates no delegation');
select lives_ok(
  $$ select * from public.create_delegation('assistant', null, '{progress,workouts}', true, null, now() + interval '30 days') $$,
  'create_delegation: an assistant access ending in 30 days passes');

-- =========================================================================================================
-- public.join_challenge and public.set_challenge_leaderboard

select tests.clear_authentication();
select private.client_today(tests.u('trainer_a')) as today \gset
select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name) values (auth.uid(), 'Шаги');
select g.id as group_steps from public.groups g where g.name = 'Шаги' \gset
select public.add_group_member(:'group_steps', :'pair_c');
select public.create_challenge(:'group_steps', 'Октябрь на ногах', 'steps', 2::smallint, :'today') as ch \gset

select tests.authenticate_as('client_c');
select throws_ok(format('select public.join_challenge(%L, true, %L)', :'ch', repeat('я', 31)),
  'P0001', 'bad_alias', 'join_challenge: an alias over 30 characters is refused');
select is(tests.count_rows(format('select count(*)::int from public.challenge_participants where challenge_id = %L', :'ch')), 0,
  'join_challenge: a refused call does not join');
select lives_ok(format('select public.join_challenge(%L, true, %L)', :'ch', repeat('я', 30)),
  'join_challenge: an alias of 30 characters passes');
select throws_ok(format('select public.set_challenge_leaderboard(%L, true, %L)', :'ch', repeat('б', 31)),
  'P0001', 'bad_alias', 'set_challenge_leaderboard: an alias over 30 characters is refused');
select is(
  (select alias from public.challenge_participants where challenge_id = :'ch' and user_id = tests.u('client_c')),
  repeat('я', 30), 'set_challenge_leaderboard: a refused call keeps the old alias');

-- =========================================================================================================
-- public.record_past_session

select tests.authenticate_as('trainer_a');
select throws_ok(
  format($$ select * from public.record_past_session(%L, now() - interval '367 days', 60::smallint, 'offline') $$, :'pair_c'),
  '22023', 'too_old', 'record_past_session: a session more than a year back is refused');
select is(
  tests.count_rows(format($$ select count(*)::int from public.sessions where trainer_id = %L and starts_at < now() - interval '300 days' $$,
                          tests.u('trainer_a'))),
  0, 'record_past_session: a refused call creates no session');
select lives_ok(
  format($$ select * from public.record_past_session(%L, now() - interval '365 days', 60::smallint, 'offline') $$, :'pair_c'),
  'record_past_session: a session 365 days back passes');

-- =========================================================================================================
-- public.reopen_schedule

select tests.clear_authentication();
insert into tests.ids values
  ('slot_open', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '10 days')),
  ('slot_closed_a', tests.add_slot('trainer_a', date_trunc('hour', now()) + interval '11 days', 'closed')),
  ('slot_closed_b', tests.add_slot('trainer_b', date_trunc('hour', now()) + interval '11 days', 'closed'));
select tests.authenticate_as('trainer_a');
select throws_ok(format('select public.reopen_schedule(%L)', tests.id('slot_open')),
  'P0001', 'not_closed', 'reopen_schedule: an open slot is not a closed day');
select throws_ok(format('select public.reopen_schedule(%L)', tests.id('slot_closed_b')),
  'P0001', 'not_closed', 'reopen_schedule: another trainer''s closed day is refused');
select is(
  tests.count_rows(format('select count(*)::int from public.slots where id in (%L, %L)', tests.id('slot_open'), tests.id('slot_closed_b'))),
  2, 'reopen_schedule: a refused call removes no slot');
select is(public.reopen_schedule(tests.id('slot_closed_a')), 0, 'reopen_schedule: the trainer''s own closed day reopens');

-- =========================================================================================================
-- public.resolve_managed_client_claim

select tests.clear_authentication();
insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
values (tests.u('trainer_a'), tests.u('client_g'), :'pair_g');
select id as claim_g from public.managed_client_claims where new_coaching_id = :'pair_g' \gset
select tests.authenticate_as('trainer_a');
select throws_ok(format('select public.resolve_managed_client_claim(%L, %L)', :'claim_g', :'card_k'),
  'P0001', 'claim_pair_ended', 'resolve_managed_client_claim: a claim whose pair has ended cannot merge into a card');
select tests.clear_authentication();
select is(
  (select row(c.status::text, c.managed_client_id, (select count(*)::int from public.profiles where id = :'card_k'))::text
   from public.managed_client_claims c where c.id = :'claim_g'),
  row('pending', null::uuid, 1)::text, 'resolve_managed_client_claim: a refused merge keeps the claim pending and the card');
select tests.authenticate_as('trainer_a');
select is(public.resolve_managed_client_claim(:'claim_g'), :'pair_g'::uuid,
  'resolve_managed_client_claim: the same claim can still be answered as a new client');

-- =========================================================================================================
-- public.send_broadcast

insert into public.groups (trainer_id, name) values (auth.uid(), 'Пустая');
select g.id as group_empty from public.groups g where g.name = 'Пустая' \gset
insert into public.groups (trainer_id, name) values (auth.uid(), 'Ушедшие');
select g.id as group_gone from public.groups g where g.name = 'Ушедшие' \gset
select public.add_group_member(:'group_gone', :'pair_h');
select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = :'pair_h';
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.send_broadcast(%L, 'Тренировка завтра в 10') $$, :'group_empty'),
  'P0001', 'group_empty', 'send_broadcast: a group without members is refused');
select throws_ok(format($$ select public.send_broadcast(%L, 'Тренировка завтра в 10') $$, :'group_gone'),
  'P0001', 'group_empty', 'send_broadcast: a group whose only pair has ended is refused');
select is(tests.count_rows(format('select count(*)::int from public.broadcasts where trainer_id = %L', tests.u('trainer_a'))), 0,
  'send_broadcast: a refused call stores no broadcast');
select isnt(public.send_broadcast(:'group_steps', 'Тренировка завтра в 10'), null,
  'send_broadcast: a group with a live pair gets the broadcast');

-- =========================================================================================================
-- public.set_bot_messages and public.set_broadcasts_muted

select tests.authenticate_as('client_d');
select public.set_bot_messages(false);
select throws_ok($$ select public.set_bot_messages(null, true) $$, '22023', 'invalid_answer',
  'set_bot_messages: a missing answer is refused');
select tests.clear_authentication();
select is(
  (select row(p.bot_blocked_at is not null,
              (select count(*)::int from public.notification_outbox where type = 'bot_test' and user_id = tests.u('client_d')))::text
   from public.profiles p where p.id = tests.u('client_d')),
  row(true, 0)::text, 'set_bot_messages: a refused call keeps the mark and sends no test');

select tests.authenticate_as('client_d');
select throws_ok(format('select public.set_broadcasts_muted(%L, null)', :'pair_d'), '22023', 'invalid_value',
  'set_broadcasts_muted: a missing value is refused');
select tests.clear_authentication();
select is((select broadcasts_muted from public.coachings where id = :'pair_d'), false,
  'set_broadcasts_muted: a refused call leaves broadcasts on');
select tests.authenticate_as('client_d');
select lives_ok(format('select public.set_broadcasts_muted(%L, true)', :'pair_d'), 'set_broadcasts_muted: true passes');

select * from finish();
rollback;

-- Session reminders and calendar feeds of migration 20261016213700_reminders_calendar.sql (PRD wave-1 §2.7
-- CAL-1..6, §2.9 NOTIF-3, NOTIF-4): reminder rows in the outbox follow bookings, sessions and the pair's
-- offsets; feeds keep only a hash, revoke on reissue and serve only what a calendar may show.
begin;
\ir _helpers.psql
select plan(32);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_card('trainer_a', 'card_k');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
-- Pending reminders of a booking as "offset@minutes from the session start", sorted.
create function tests.reminders(p_booking uuid) returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg((o.payload ->> 'offset_min') || '@' ||
                            extract(epoch from s.starts_at - o.scheduled_for)::int / 60 order by o.scheduled_for), '{}')
  from public.notification_outbox o join public.sessions s on s.id = o.session_id
  where o.booking_id = p_booking and o.type = 'session_reminder' and o.status = 'pending'
$$;

insert into public.locations (trainer_id, name, address) values (tests.u('trainer_a'), 'Зал на Ленина', 'ул. Ленина, 1');
insert into tests.ids values
  ('s_far', tests.create_session('trainer_a', date_trunc('minute', now()) + interval '2 days')),
  ('s_soon', tests.create_session('trainer_a', date_trunc('minute', now()) + interval '40 minutes')),
  ('s_card', tests.create_session('trainer_a', date_trunc('minute', now()) + interval '2 days 3 hours')),
  ('s_req', tests.create_session('trainer_a', date_trunc('minute', now()) + interval '3 days')),
  ('s_b', tests.create_session('trainer_b', date_trunc('minute', now()) + interval '4 days', 'personal', 1, false, 'https://meet.example/b')),
  ('s_gone', tests.create_session('trainer_a', now() - interval '10 days')),
  ('s_recent', tests.create_session('trainer_a', now() - interval '3 days'));
update public.sessions set location_id = (select id from public.locations limit 1) where id = tests.id('s_far');

-- =========================================================================================================
-- Reminders

insert into tests.ids values ('b_far', tests.create_booking(tests.id('s_far'), 'trainer_a', 'client_c'));
select is(tests.reminders(tests.id('b_far')), '{1440@1440,60@60}', 'reminders: a confirmed booking gets the pair''s 1 day and 1 hour');
select results_eq(
  $$ select payload ->> 'location_name', payload ->> 'first_name', payload ? 'meeting_url', user_id
     from public.notification_outbox where booking_id = tests.id('b_far') and payload ->> 'offset_min' = '60' $$,
  $$ values ('Зал на Ленина'::text, 'trainer_a'::text, false, tests.u('client_c')) $$,
  'reminders: to the client, with the place and the trainer, never the meeting link'
);

update public.coachings set client_reminder_offsets = '{60,15}' where id = tests.pair_id('trainer_a', 'client_c');
select is(tests.reminders(tests.id('b_far')), '{60@60,15@15}', 'reminders: new offsets of the pair re-plan future bookings');
insert into tests.ids values ('b_soon', tests.create_booking(tests.id('s_soon'), 'trainer_a', 'client_c'));
select is(tests.reminders(tests.id('b_soon')), '{15@15}', 'reminders: a booking 40 minutes ahead gets only the 15-minute one (NOTIF-3)');

update public.sessions set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours'
where id = tests.id('s_far');
select is(tests.reminders(tests.id('b_far')), '{60@60,15@15}', 'reminders: a moved session keeps reminders relative to the new start (NOTIF-4)');
select is(
  (select count(*)::int from public.notification_outbox where booking_id = tests.id('b_far') and status = 'cancelled'), 3,
  'reminders: the ones for the old time are cancelled (with the 1-day one from before)'
);
update public.sessions set starts_at = starts_at - interval '2 hours', ends_at = ends_at - interval '2 hours'
where id = tests.id('s_far');
select is(
  (select count(*)::int from public.notification_outbox where booking_id = tests.id('b_far') and status = 'pending'), 2,
  'reminders: moving the session back revives the earlier rows'
);

update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.id('b_far');
select is(tests.reminders(tests.id('b_far')), '{}', 'reminders: a cancelled booking keeps none (NOTIF-4)');

insert into tests.ids values ('b_req', tests.create_booking(tests.id('s_req'), 'trainer_a', 'client_d', 'requested', 'client_slot'));
select is(tests.reminders(tests.id('b_req')), '{}', 'reminders: a request gets none (2.9-5)');
update public.bookings set status = 'confirmed', confirmed_at = now() where id = tests.id('b_req');
select is(tests.reminders(tests.id('b_req')), '{1440@1440,60@60}', 'reminders: confirming it plans them');
update public.sessions set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Болею' where id = tests.id('s_req');
select is(tests.reminders(tests.id('b_req')), '{}', 'reminders: a cancelled session drops them');

insert into tests.ids values ('b_card', tests.create_booking(tests.id('s_card'), 'trainer_a', 'card_k'));
select is(tests.reminders(tests.id('b_card')), '{}', 'reminders: a card without an account gets none (PRD 2.5-3)');

-- Bookings for the client feed: another trainer (CAL-5), a past attended one, cancellations old and recent.
insert into tests.ids values
  ('b_b', tests.create_booking(tests.id('s_b'), 'trainer_b', 'client_c')),
  ('b_gone', tests.create_booking(tests.id('s_gone'), 'trainer_a', 'client_c')),
  ('b_recent', tests.create_booking(tests.id('s_recent'), 'trainer_a', 'client_c', 'attended'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client' where id = tests.id('b_gone');
update public.sessions set status = 'cancelled', cancelled_at = now() where id = tests.id('s_gone');
select is(tests.reminders(tests.id('b_recent')), '{}', 'reminders: a past session gets none');

-- =========================================================================================================
-- create_calendar_feed and revoke_calendar_feed

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated, service_role;

select tests.authenticate_as_anon();
select throws_ok($$ select public.create_calendar_feed('client') $$, '42501', null, 'feed: anon cannot create one');
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.create_calendar_feed('trainer') $$, 'P0001', 'not_a_trainer', 'feed: a client has no trainer feed'
);
insert into tests.tokens values ('c1', public.create_calendar_feed('client'));
select ok((select length(token) >= 40 from tests.tokens where name = 'c1'), 'feed: the token is long and random');
select results_eq(
  $$ select zone::text, revoked_at is null, last_accessed_at is null from public.calendar_feeds $$,
  $$ values ('client'::text, true, true) $$,
  'feed: the owner sees the feed, unused'
);
select throws_ok($$ select token_hash from public.calendar_feeds $$, '42501', null, 'feed: the hash is not readable');
select throws_ok(
  format('select public.calendar_feed(%L)', (select token from tests.tokens where name = 'c1')), '42501', null,
  'feed: a signed-in user cannot read a feed by token'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.calendar_feeds $$, 'feed: nobody else sees it');
select tests.clear_authentication();
select is(
  (select token_hash from public.calendar_feeds where user_id = tests.u('client_c')),
  extensions.digest((select token from tests.tokens where name = 'c1'), 'sha256'),
  'feed: only the sha256 of the token is stored (CAL-6)'
);

-- =========================================================================================================
-- calendar_feed (service role)

select tests.authenticate_as_service_role();
create temp table feed as select public.calendar_feed((select token from tests.tokens where name = 'c1')) as f;
select tests.clear_authentication();
select is(
  (select f ->> 'zone' from feed), 'client', 'calendar: the client feed'
);
select results_eq(
  $$ select (e ->> 'uid')::uuid, (e ->> 'cancelled')::boolean from feed, jsonb_array_elements(f -> 'events') e
     order by e ->> 'starts_at' $$,
  $$ values (tests.id('b_recent'), false), (tests.id('b_soon'), false), (tests.id('b_far'), true), (tests.id('b_b'), false) $$,
  'calendar: both trainers (CAL-5), a recent cancellation as cancelled, no request, nothing cancelled 10 days ago'
);
select results_eq(
  $$ select e ->> 'partner', e ->> 'meeting_url' from feed, jsonb_array_elements(f -> 'events') e
     where e ->> 'uid' = tests.id('b_b')::text $$,
  $$ values ('trainer_b'::text, 'https://meet.example/b'::text) $$,
  'calendar: the event names the trainer and carries the link of a confirmed online booking'
);
select is(
  (select array_agg(distinct k order by k) from feed, jsonb_array_elements(f -> 'events') e, jsonb_object_keys(e) k),
  '{cancelled,ends_at,kind,location_address,location_name,meeting_url,mode,partner,starts_at,title,uid,updated_at}',
  'calendar: no intake, measurements, notes or money in an event (CAL-4)'
);
select ok(
  (select last_accessed_at is not null from public.calendar_feeds where user_id = tests.u('client_c')),
  'calendar: a fetch stamps last_accessed_at'
);

-- Trainer feed: every session, a personal one named after the client (a card by its name).
select tests.authenticate_as('trainer_a');
insert into tests.tokens values ('a1', public.create_calendar_feed('trainer'));
select tests.authenticate_as_service_role();
create temp table tfeed as select public.calendar_feed((select token from tests.tokens where name = 'a1')) as f;
select tests.clear_authentication();
select results_eq(
  $$ select e ->> 'uid', e ->> 'partner' from tfeed, jsonb_array_elements(f -> 'events') e
     where (e ->> 'uid')::uuid in (tests.id('s_card'), tests.id('s_soon')) order by e ->> 'starts_at' $$,
  $$ values (tests.id('s_soon')::text, 'client_c'::text), (tests.id('s_card')::text, 'card_k'::text) $$,
  'calendar: the trainer feed names the client of each session'
);
select is(
  (select count(*)::int from tfeed, jsonb_array_elements(f -> 'events') e where (e ->> 'uid')::uuid = tests.id('s_gone')), 0,
  'calendar: the trainer feed leaves out a cancelled session that started over 7 days ago (2.7-3)'
);

-- Reissue revokes the old link at once (CAL-3).
select tests.authenticate_as('client_c');
insert into tests.tokens values ('c2', public.create_calendar_feed('client'));
select tests.authenticate_as_service_role();
select is(public.calendar_feed((select token from tests.tokens where name = 'c1')), null, 'reissue: the old token serves nothing');
select isnt(public.calendar_feed((select token from tests.tokens where name = 'c2')), null, 'reissue: the new one works');
select tests.authenticate_as('client_c');
select ok(public.revoke_calendar_feed('client'), 'revoke: the feed is turned off');
select tests.authenticate_as_service_role();
select is(public.calendar_feed((select token from tests.tokens where name = 'c2')), null, 'revoke: its token serves nothing');
select tests.clear_authentication();

select * from finish();
rollback;

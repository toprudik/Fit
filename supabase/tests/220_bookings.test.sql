-- Bookings policies of migration 20261015123500_bookings_ledger_policies.sql (contract §1.4 file 19, §6
-- 220_bookings), with the booking invariants of 20261015120600_bookings_ledger_tables.sql: uniqueness, tenant
-- keys, seat capacity (R18), the status machine (R93), booking_events and moving pairs to the stub.
begin;
\ir _helpers.psql
select plan(70);

-- Fixtures: C has live pairs to A and B; D and F live pairs to A; E an ended pair to A; M is A's card;
-- N is a real user without a pair; Z is a user who acted on a booking and later deletes the account.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('client_n');
select tests.create_user('stranger_s');
select tests.create_user('actor_z');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_pair('trainer_a', 'client_f');
select tests.create_card('trainer_a', 'card_m');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- A booking event, as an RPC would write it.
create function tests.add_event(p_booking text, p_actor text, p_role public.actor_role) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason)
  values (tests.i(p_booking), null, 'confirmed', case when p_actor is not null then tests.user_id(p_actor) end, p_role, 'test')
  returning id into v_id;
  insert into tests.ids values ('ev_' || p_booking, pg_catalog.md5(v_id::text)::uuid);
  return pg_catalog.md5(v_id::text)::uuid;
end $$;
-- booking_events ids are bigints; tests.ids keeps them as md5 uuids, and this maps them back.
create function tests.events_seen() returns setof uuid language sql stable set search_path = '' as $$
  select pg_catalog.md5(e.id::text)::uuid from public.booking_events e
$$;

insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('pair_am', tests.pair_id('trainer_a', 'card_m')),
  ('g1', tests.create_session('trainer_a', now() + interval '1 day', 'group', 5, true)),
  ('p_e', tests.create_session('trainer_a', now() - interval '10 days')),
  ('s_b', tests.create_session('trainer_b', now() + interval '1 day'));
insert into tests.ids values
  ('bk_c_g1', tests.create_booking(tests.i('g1'), 'trainer_a', 'client_c')),
  ('bk_d_g1', tests.create_booking(tests.i('g1'), 'trainer_a', 'client_d')),
  ('bk_e', tests.create_booking(tests.i('p_e'), 'trainer_a', 'client_e', 'attended')),
  ('bk_c_b', tests.create_booking(tests.i('s_b'), 'trainer_b', 'client_c'));
select tests.add_event('bk_c_g1', 'client_c', 'client');
select tests.add_event('bk_d_g1', 'actor_z', 'trainer');
select tests.add_event('bk_e', null, 'system');
select tests.add_event('bk_c_b', 'trainer_b', 'trainer');

-- =========================================================================================================
-- Visibility

select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.bookings $$, array[tests.i('bk_c_g1'), tests.i('bk_c_b')],
  'bookings: C reads only own bookings, with both trainers'
);
select tests.authenticate_as('client_d');
select set_eq(
  $$ select id from public.bookings $$, array[tests.i('bk_d_g1')],
  'bookings: in a group session D cannot read C''s booking'
);
select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.bookings $$, array[tests.i('bk_c_g1'), tests.i('bk_d_g1'), tests.i('bk_e')],
  'bookings: A reads the bookings of own pairs, the ended pair included, not B''s'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.bookings $$, array[tests.i('bk_c_b')], 'bookings: B reads 0 of A''s bookings');
select tests.authenticate_as('client_e');
select set_eq($$ select id from public.bookings $$, array[tests.i('bk_e')], 'bookings: E keeps reading own booking after the pair ended');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.bookings $$, 'bookings: a stranger reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.bookings $$, 'bookings: the admin reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.bookings $$, '42501', null, 'bookings: anon has no access');

-- Writes are RPC only.
select tests.authenticate_as('client_c');
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, status, source, requested_at)
     values (tests.i('g1'), tests.i('pair_ac'), 'requested', 'client_session', now()) $$,
  '42501', null, 'bookings: the client cannot insert directly'
);
select throws_ok(
  $$ update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
     where id = tests.i('bk_c_g1') $$,
  '42501', null, 'bookings: the client cannot update directly'
);
select throws_ok($$ delete from public.bookings where id = tests.i('bk_c_g1') $$, '42501', null, 'bookings: the client cannot delete');
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, status, source, confirmed_at)
     values (tests.i('g1'), tests.i('pair_am'), 'confirmed', 'trainer', now()) $$,
  '42501', null, 'bookings: the trainer cannot insert directly'
);
select throws_ok(
  $$ update public.bookings set status = 'attended' where id = tests.i('bk_c_g1') $$,
  '42501', null, 'bookings: the trainer cannot update directly'
);
select throws_ok($$ delete from public.bookings where id = tests.i('bk_c_g1') $$, '42501', null, 'bookings: the trainer cannot delete');

-- =========================================================================================================
-- booking_events

select set_eq(
  $$ select tests.events_seen() $$, array[tests.i('ev_bk_c_g1'), tests.i('ev_bk_d_g1'), tests.i('ev_bk_e')],
  'booking_events: A reads the events of own pairs'
);
select throws_ok(
  $$ insert into public.booking_events (booking_id, to_status, actor_role) values (tests.i('bk_c_g1'), 'attended', 'trainer') $$,
  '42501', null, 'booking_events: the trainer cannot insert'
);
select throws_ok(
  $$ update public.booking_events set reason = 'changed' $$,
  '42501', null, 'booking_events: the trainer cannot update'
);
select tests.authenticate_as('client_c');
select set_eq(
  $$ select tests.events_seen() $$, array[tests.i('ev_bk_c_g1'), tests.i('ev_bk_c_b')],
  'booking_events: C reads the events of own bookings'
);
select throws_ok(
  $$ insert into public.booking_events (booking_id, to_status, actor_role) values (tests.i('bk_c_g1'), 'cancelled', 'client') $$,
  '42501', null, 'booking_events: the client cannot insert'
);
select throws_ok($$ truncate public.booking_events $$, '42501', null, 'booking_events: the client cannot truncate');
select tests.authenticate_as('client_d');
select set_eq($$ select tests.events_seen() $$, array[tests.i('ev_bk_d_g1')], 'booking_events: D does not read C''s events');
select tests.authenticate_as('trainer_b');
select set_eq($$ select tests.events_seen() $$, array[tests.i('ev_bk_c_b')], 'booking_events: B reads 0 of A''s events');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.booking_events $$, 'booking_events: a stranger reads 0 rows');

-- Append-only for every role.
select tests.clear_authentication();
select throws_ok(
  $$ update public.booking_events set reason = 'changed' where booking_id = tests.i('bk_c_g1') $$,
  'P0001', 'append_only', 'booking_events: update raises append_only as postgres'
);
select throws_ok(
  $$ delete from public.booking_events where booking_id = tests.i('bk_c_g1') $$,
  'P0001', 'append_only', 'booking_events: delete raises append_only as postgres'
);
select throws_ok($$ truncate public.booking_events $$, 'P0001', 'append_only', 'booking_events: truncate raises as postgres');
select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.booking_events set to_status = 'attended' where booking_id = tests.i('bk_c_g1') $$,
  'P0001', 'append_only', 'booking_events: update raises append_only as service_role'
);
select throws_ok(
  $$ delete from public.booking_events where booking_id = tests.i('bk_c_g1') $$,
  'P0001', 'append_only', 'booking_events: delete raises append_only as service_role'
);
select throws_ok($$ truncate public.booking_events $$, 'P0001', 'append_only', 'booking_events: truncate raises as service_role');

-- Deleting the actor's account clears actor_id; deleting the session takes its bookings and events along.
select tests.clear_authentication();
delete from auth.users where id = tests.u('actor_z');
select results_eq(
  $$ select actor_id, reason from public.booking_events where booking_id = tests.i('bk_d_g1') $$,
  $$ values (null::uuid, 'test') $$,
  'booking_events: deleting the actor''s profile sets actor_id NULL and keeps the event'
);

-- Bookings and booked sessions are history (data-model §1.5): no role deletes them directly, because the delete
-- would take the charge and the events along and give the session back to the pass. They leave only with
-- their pair or their trainer.
select tests.create_user('client_g');
select tests.create_pair('trainer_a', 'client_g');
insert into tests.ids values
  ('pair_ag', tests.pair_id('trainer_a', 'client_g')),
  ('s_del', tests.create_session('trainer_a', now() - interval '9 days')),
  ('s_empty', tests.create_session('trainer_a', now() + interval '9 days')),
  ('pass_ag', tests.create_pass('trainer_a', 'client_g', 5));
insert into tests.ids values ('bk_del', tests.create_booking(tests.i('s_del'), 'trainer_a', 'client_g', 'attended'));
select tests.add_event('bk_del', 'trainer_a', 'trainer');
insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, sessions_delta, charge_reason, occurred_at)
values (tests.i('pair_ag'), 'charge', tests.i('pass_ag'), tests.i('bk_del'), -1, 'attended',
        (select starts_at from public.sessions where id = tests.i('s_del')));
select throws_ok(
  $$ delete from public.bookings where id = tests.i('bk_del') $$,
  'P0001', 'append_only', 'bookings: a direct delete raises append_only as postgres'
);
select throws_ok(
  $$ delete from public.sessions where id = tests.i('s_del') $$,
  'P0001', 'session_in_use', 'sessions: deleting a session with bookings raises session_in_use as postgres'
);
select tests.authenticate_as_service_role();
select throws_ok(
  $$ delete from public.bookings where id = tests.i('bk_del') $$,
  'P0001', 'append_only', 'bookings: a direct delete raises append_only as service_role'
);
select throws_ok(
  $$ delete from public.sessions where id = tests.i('s_del') $$,
  'P0001', 'session_in_use', 'sessions: deleting a session with bookings raises session_in_use as service_role'
);
select lives_ok(
  $$ delete from public.sessions where id = tests.i('s_empty') $$,
  'sessions: a session nobody booked may be deleted'
);
select tests.clear_authentication();
select is(
  (select coalesce(sum(sessions_delta), 0)::integer from public.ledger_entries where pass_id = tests.i('pass_ag')), 4,
  'bookings: the charge stays, so the pass keeps its balance'
);
delete from public.coachings where id = tests.i('pair_ag');
select is_empty(
  $$ select 1 from public.booking_events where booking_id = tests.i('bk_del')
     union all select 1 from public.bookings where id = tests.i('bk_del')
     union all select 1 from public.ledger_entries where booking_id = tests.i('bk_del') $$,
  'booking_events: deleting the pair cascades to its bookings, their events and charges'
);

-- =========================================================================================================
-- Invariants (as the server): one live booking per pair and session, tenant keys.

insert into tests.ids values
  ('g2', tests.create_session('trainer_a', now() + interval '2 days', 'group', 5)),
  ('g3', tests.create_session('trainer_a', now() + interval '3 days', 'group', 5)),
  ('t1', tests.create_session('trainer_a', now() + interval '4 days', 'trial')),
  ('t2', tests.create_session('trainer_a', now() + interval '5 days', 'trial')),
  ('p_free', tests.create_session('trainer_a', now() + interval '6 days')),
  ('pass_ad', tests.create_pass('trainer_a', 'client_d', 5));

select throws_ok(
  $$ select tests.create_booking(tests.i('g1'), 'trainer_a', 'client_c', 'requested', 'client_session') $$,
  '23505', null, 'invariants: a second live booking for the same session and pair raises 23505'
);
insert into tests.ids values ('bk_c_g2', tests.create_booking(tests.i('g2'), 'trainer_a', 'client_c'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client' where id = tests.i('bk_c_g2');
select lives_ok(
  $$ select tests.create_booking(tests.i('g2'), 'trainer_a', 'client_c') $$,
  'invariants: after the first is cancelled, the pair books the session again'
);
insert into tests.ids values ('bk_c_g3', tests.create_booking(tests.i('g3'), 'trainer_a', 'client_c'));
update public.bookings set status = 'late_cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.i('bk_c_g3');
select throws_ok(
  $$ select tests.create_booking(tests.i('g3'), 'trainer_a', 'client_c') $$,
  '23505', null, 'invariants: a late_cancelled booking still blocks a second one'
);
select lives_ok(
  $$ select tests.create_booking(tests.i('t1'), 'trainer_a', 'client_c', 'requested', 'trial') $$,
  'invariants: a trial booking of the pair is created'
);
select throws_ok(
  $$ select tests.create_booking(tests.i('t2'), 'trainer_a', 'client_c', 'requested', 'trial') $$,
  '23505', null, 'invariants: a second live trial booking of the pair raises 23505'
);
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, trainer_id, client_id, status, source, confirmed_at)
     values (tests.i('p_free'), tests.i('pair_ac'), tests.u('trainer_a'), tests.u('client_d'), 'confirmed', 'trainer', now()) $$,
  '23503', null, 'invariants: pair columns that do not match the pair raise 23503'
);
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, status, source, confirmed_at)
     values (tests.i('s_b'), tests.i('pair_ac'), 'confirmed', 'trainer', now()) $$,
  '23503', null, 'invariants: a session of B with a pair of A raises 23503'
);
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, status, source, confirmed_at, reserved_pass_id)
     values (tests.i('p_free'), tests.i('pair_ac'), 'confirmed', 'trainer', now(), tests.i('pass_ad')) $$,
  '23503', null, 'invariants: a reserved pass of another pair raises 23503'
);

-- =========================================================================================================
-- Capacity (SCHED-15, R18): requested, confirmed, attended and no_show take a seat.

insert into tests.ids values
  ('cap2', tests.create_session('trainer_a', now() + interval '7 days', 'group', 2, true)),
  ('p2', tests.create_session('trainer_a', now() + interval '8 days'));
insert into tests.ids values
  ('bk_c_cap2', tests.create_booking(tests.i('cap2'), 'trainer_a', 'client_c')),
  ('bk_d_cap2', tests.create_booking(tests.i('cap2'), 'trainer_a', 'client_d', 'requested', 'client_session')),
  ('bk_c_p2', tests.create_booking(tests.i('p2'), 'trainer_a', 'client_c'));

select throws_ok(
  $$ select tests.create_booking(tests.i('cap2'), 'trainer_a', 'client_f') $$,
  'P0001', 'session_full', 'capacity: 1 confirmed and 1 requested fill 2 seats; a third booking raises session_full'
);
select lives_ok(
  $$ update public.bookings set status = 'confirmed', confirmed_at = now() where id = tests.i('bk_d_cap2') $$,
  'capacity: confirming a request on a full session keeps its seat'
);
select throws_ok(
  $$ select tests.create_booking(tests.i('p2'), 'trainer_a', 'client_d') $$,
  'P0001', 'session_full', 'capacity: a personal session takes one booking'
);
update public.bookings set status = 'late_cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = tests.i('bk_c_p2');
select lives_ok(
  $$ select tests.create_booking(tests.i('p2'), 'trainer_a', 'client_d') $$,
  'capacity: after a late cancel the seat is free'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ update public.sessions set capacity = 1 where id = tests.i('cap2') $$,
  'P0001', 'capacity_below_occupied', 'capacity: A lowering capacity below the occupied seats raises capacity_below_occupied'
);
select results_eq(
  $$ update public.sessions set capacity = 3 where id = tests.i('cap2') returning capacity $$,
  $$ values (3::smallint) $$,
  'capacity: A raises the capacity'
);
select tests.clear_authentication();
select lives_ok(
  $$ select tests.create_booking(tests.i('cap2'), 'trainer_a', 'client_f') $$,
  'capacity: the new seat takes a third booking'
);
select throws_ok(
  $$ update public.sessions set capacity = 2 where id = tests.i('cap2') $$,
  'P0001', 'capacity_below_occupied', 'capacity: the server cannot lower capacity below the occupied seats either'
);

-- =========================================================================================================
-- State machine (R93), as the server.

insert into tests.ids values ('sm', tests.create_session('trainer_a', now() + interval '11 days', 'group', 10));
insert into tests.ids values
  ('bk_c_sm', tests.create_booking(tests.i('sm'), 'trainer_a', 'client_c', 'requested', 'client_session')),
  ('bk_d_sm', tests.create_booking(tests.i('sm'), 'trainer_a', 'client_d', 'requested', 'client_session'));
update public.bookings set status = 'expired' where id = tests.i('bk_c_sm');
update public.bookings set status = 'declined' where id = tests.i('bk_d_sm');

select throws_ok(
  $$ update public.bookings set status = 'confirmed', confirmed_at = now() where id = tests.i('bk_c_sm') $$,
  'P0001', 'invalid_transition', 'status: expired -> confirmed raises invalid_transition'
);
select throws_ok(
  $$ update public.bookings set status = 'confirmed' where id = tests.i('bk_c_g2') $$,
  'P0001', 'invalid_transition', 'status: cancelled -> confirmed raises invalid_transition'
);
select throws_ok(
  $$ update public.bookings set status = 'attended', attendance_marked_at = now() where id = tests.i('bk_d_sm') $$,
  'P0001', 'invalid_transition', 'status: declined -> attended raises invalid_transition'
);
select throws_ok(
  $$ update public.bookings set status = 'confirmed' where id = tests.i('bk_c_g3') $$,
  'P0001', 'invalid_transition', 'status: late_cancelled -> confirmed raises invalid_transition'
);
select lives_ok(
  $$ update public.bookings set status = 'no_show' where id = tests.i('bk_e') $$,
  'status: attended -> no_show passes'
);
select lives_ok(
  $$ update public.bookings set status = 'attended' where id = tests.i('bk_e') $$,
  'status: no_show -> attended passes'
);
select lives_ok(
  $$ update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'trainer',
       cancel_reason = 'did not happen' where id = tests.i('bk_e') $$,
  'status: attended -> cancelled passes'
);
select throws_ok(
  $$ update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'trainer'
     where id = tests.i('bk_c_cap2') $$,
  '23514', 'new row for relation "bookings" violates check constraint "bookings_trainer_cancel_reason_check"', 'status: a trainer cancel without a reason violates the check'
);
select throws_ok(
  $$ insert into public.bookings (session_id, coaching_id, status, source, cancelled_at, cancelled_by_role)
     values (tests.i('sm'), tests.i('pair_ac'), 'cancelled', 'trainer', now(), 'client') $$,
  'P0001', 'invalid_transition', 'status: inserting a cancelled booking raises invalid_transition'
);

-- A card merge moves the pair to the real user: a pure client_id change cascades and skips the state machine.
insert into tests.ids values ('bk_m_g1', tests.create_booking(tests.i('g1'), 'trainer_a', 'card_m'));
select lives_ok(
  $$ update public.coachings set client_id = tests.u('client_n') where id = tests.i('pair_am') $$,
  'reassignment: moving the card''s pair to the real user passes'
);
select results_eq(
  $$ select client_id, status::text from public.bookings where id = tests.i('bk_m_g1') $$,
  $$ values (tests.u('client_n'), 'confirmed') $$,
  'reassignment: the booking follows the pair with its status unchanged'
);
select tests.authenticate_as('client_n');
select set_eq($$ select id from public.bookings $$, array[tests.i('bk_m_g1')], 'reassignment: the real user now reads the booking');

-- =========================================================================================================
-- Anonymization: two clients attended one group session; both pairs move to the stub without a conflict,
-- and the stub id cascades into bookings, passes, the ledger and payments.

select tests.clear_authentication();
select tests.create_deleted_stub();
insert into tests.ids values ('g_anon', tests.create_session('trainer_a', now() - interval '3 days', 'group', 5));
insert into tests.ids values
  ('bk_c_anon', tests.create_booking(tests.i('g_anon'), 'trainer_a', 'client_c', 'attended')),
  ('bk_d_anon', tests.create_booking(tests.i('g_anon'), 'trainer_a', 'client_d', 'attended')),
  ('pass_ac', tests.create_pass('trainer_a', 'client_c', 10, 10000));
insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, sessions_delta, amount_minor, currency,
                                   charge_reason, occurred_at)
select tests.i(p), 'charge', tests.i(ps), tests.i(b), -1, 1000, 'RUB', 'attended', now() - interval '3 days'
from (values ('pair_ac', 'pass_ac', 'bk_c_anon'), ('pair_ad', 'pass_ad', 'bk_d_anon')) v (p, ps, b);
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
values (tests.i('pair_ac'), tests.i('pass_ac'), 10000, 'RUB', 'cash', now(), 'confirmed'),
       (tests.i('pair_ad'), tests.i('pass_ad'), 5000, 'RUB', 'cash', now(), 'confirmed');

select lives_ok(
  $$ update public.coachings set client_id = private.deleted_client_id() where id = tests.i('pair_ac');
     update public.coachings set client_id = private.deleted_client_id() where id = tests.i('pair_ad') $$,
  'anonymization: both pairs move to the stub'
);
select results_eq(
  $$ select count(*)::integer, count(*) filter (where client_id = private.deleted_client_id())::integer
     from public.bookings where session_id = tests.i('g_anon') $$,
  $$ values (2, 2) $$,
  'anonymization: both bookings of the group session now belong to the stub'
);
select is_empty(
  $$ select 1 from public.bookings where coaching_id in (tests.i('pair_ac'), tests.i('pair_ad'))
       and client_id <> private.deleted_client_id()
     union all
     select 1 from public.passes where coaching_id in (tests.i('pair_ac'), tests.i('pair_ad'))
       and client_id <> private.deleted_client_id()
     union all
     select 1 from public.ledger_entries where coaching_id in (tests.i('pair_ac'), tests.i('pair_ad'))
       and client_id <> private.deleted_client_id()
     union all
     select 1 from public.payments where coaching_id in (tests.i('pair_ac'), tests.i('pair_ad'))
       and client_id <> private.deleted_client_id() $$,
  'anonymization: bookings, passes, ledger and payments of both pairs point to the stub'
);
select tests.authenticate_as('client_c');
select set_eq($$ select id from public.bookings $$, array[tests.i('bk_c_b')], 'anonymization: C no longer reads the moved bookings');
select tests.authenticate_as('trainer_a');
select ok(
  (select count(*) from public.bookings where id in (tests.i('bk_c_anon'), tests.i('bk_d_anon'))) = 2,
  'anonymization: A keeps reading the bookings of the anonymized pairs'
);

select * from finish();
rollback;

-- Branches of decide_booking and join_waitlist that no test reached: a mutation in each survived the suite
-- (docs/qa/production-readiness.md §1). A request whose session has started, an over-long reason, a single session
-- by an assistant without the passes scope, the payment hint of a confirmed trial, the place in line when another
-- session has a queue too, and the trainer's booking notice for a group session.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_trainer('helper_h');
select tests.create_user(h) from unnest(array['client_c', 'client_d', 'client_e', 'client_t', 'client_w', 'client_v']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_d', 'client_e', 'client_t', 'client_w', 'client_v']) h;

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('started', tests.create_booking(tests.create_session('trainer_a', now() - interval '10 minutes', 'personal', 1),
                                   'trainer_a', 'client_c', 'requested', 'client_slot')),
  ('future', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days', 'personal', 1),
                                  'trainer_a', 'client_d', 'requested', 'client_slot')),
  ('trial', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) + interval '3 days', 'trial', 1),
                                 'trainer_a', 'client_e', 'requested', 'trial')),
  ('trial2', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) + interval '3 days 2 hours', 'trial', 1),
                                  'trainer_a', 'client_t', 'requested', 'trial'));

-- An assistant for all clients with the schedule scope but not passes.
insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, scopes, all_clients, status, accepted_at)
values (tests.user_id('trainer_a'), tests.user_id('helper_h'), 'assistant', '{schedule}', true, 'active', now());

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.decide_booking(%L, true) $$, tests.id('started')),
  'P0001', 'request_not_found', 'a request whose session has started is not decided');
select throws_ok(format($$ select public.decide_booking(%L, false, %L) $$, tests.id('future'), repeat('я', 501)),
  '22023', 'invalid_reason', 'a reason over 500 characters is refused');
select lives_ok(format($$ select public.decide_booking(%L, false, %L) $$, tests.id('trial'), repeat('я', 500)),
  'a reason of 500 characters is taken');
select tests.clear_authentication();

select tests.authenticate_as('helper_h');
select throws_ok(format($$ select public.decide_booking(%L, true, p_single => true, p_single_title => 'Разовое') $$, tests.id('future')),
  'P0001', 'request_not_found', 'an assistant without the passes scope cannot make a single session');
select is(public.decide_booking(tests.id('future'), true), 'confirmed'::public.booking_status,
  'the same assistant confirms the request as usual');
select tests.clear_authentication();

-- A confirmed trial says nothing about payment; a declined request neither.
select tests.authenticate_as('trainer_a');
select public.decide_booking(tests.id('trial2'), true);
select tests.clear_authentication();
select is((select count(*)::int from public.notification_outbox o
           where o.type in ('booking_confirmed', 'booking_declined') and o.payload ? 'pay'
             and o.payload->>'booking_id' in (tests.id('trial')::text, tests.id('trial2')::text)), 0,
  'neither the confirmed trial nor the declined request carries a payment hint');

-- The place in line counts only the queue of this session.
insert into tests.ids values
  ('full_a', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '4 days', 'group', 1)),
  ('full_b', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '5 days', 'group', 1));
update public.sessions set open_for_booking = true where id in (tests.id('full_a'), tests.id('full_b'));
select tests.create_booking(tests.id('full_a'), 'trainer_a', 'client_c');
select tests.create_booking(tests.id('full_b'), 'trainer_a', 'client_c');
select tests.authenticate_as('client_w');
select public.join_waitlist(tests.id('full_a'));
select tests.clear_authentication();
select tests.authenticate_as('client_v');
select is((select place from public.join_waitlist(tests.id('full_b'))), 1, 'first in an empty queue, whatever other queues hold');
select tests.clear_authentication();
select is((select count(*)::int from public.waitlist_entries), 2, 'two queues of one each');

-- A group session closer than the trainer's booking notice is too late to book.
update public.trainer_profiles set min_booking_notice_minutes = 180 where user_id = tests.user_id('trainer_a');
insert into tests.ids values ('soon', tests.create_session('trainer_a', now() + interval '2 hours', 'group', 5));
update public.sessions set open_for_booking = true where id = tests.id('soon');
select tests.authenticate_as('client_d');
select throws_ok(format($$ select public.book_group_session(%L) $$, tests.id('soon')),
  'P0001', 'too_late', 'a group session inside the booking notice is too late');
select tests.clear_authentication();

select * from finish();
rollback;

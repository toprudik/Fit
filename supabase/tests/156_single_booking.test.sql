-- A booking marked as a single session, migration 20261018071347_single_booking.sql (PRD wave-1 §2.8-12): its
-- own drop-in pass at the drop-in price for that day, reserved for it, and the charge comes off it.
begin;
\ir _helpers.psql
select plan(14);

select tests.create_trainer('trainer_a');
select tests.create_user('client_a');
select tests.create_user('stranger');
select tests.create_pair('trainer_a', 'client_a');
select tests.create_pass('trainer_a', 'client_a', 5);
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency, applies_to)
values (tests.user_id('trainer_a'), 'Одно занятие', 1, 250000, 'RUB', 'any');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values
  ('booking', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days'), 'trainer_a', 'client_a')),
  ('past', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) - interval '2 days'), 'trainer_a', 'client_a')),
  ('request', tests.create_booking(tests.create_session('trainer_a', date_trunc('hour', now()) + interval '3 days'), 'trainer_a', 'client_a', 'requested', 'client_slot'));

select tests.authenticate_as('stranger');
select throws_ok($$ select public.make_booking_single(tests.id('booking'), 'Разовое занятие') $$,
  'P0001', 'booking_not_found', 'only the trainer of the pair marks a booking as single');

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.make_booking_single(tests.id('past'), 'Разовое занятие') $$,
  'P0001', 'booking_not_single', 'a session that has started cannot become single');
select throws_ok($$ select public.make_booking_single(tests.id('request'), 'Разовое занятие') $$,
  'P0001', 'booking_not_single', 'a request is confirmed first');
select throws_ok($$ select public.make_booking_single(tests.id('booking'), '  ') $$,
  '22023', 'pass_invalid', 'the pass needs a title');
insert into tests.ids select 'single', public.make_booking_single(tests.id('booking'), 'Разовое занятие');
select throws_ok($$ select public.make_booking_single(tests.id('booking'), 'Разовое занятие') $$,
  'P0001', 'booking_not_single', 'twice is refused');
select tests.clear_authentication();

select results_eq(
  $$ select p.sessions_total::integer, p.price_minor, p.is_drop_in, p.starts_on = (b.starts_at at time zone private.trainer_zone(tests.user_id('trainer_a')))::date,
            p.expires_at = ((p.starts_on + 1)::timestamp at time zone private.trainer_zone(tests.user_id('trainer_a')))
     from public.passes p, (select s.starts_at from public.bookings bk join public.sessions s on s.id = bk.session_id
                            where bk.id = tests.id('booking')) b
     where p.id = tests.id('single') $$,
  $$ values (1, 250000::bigint, true, true, true) $$,
  'a drop-in pass of one session at the drop-in price, valid on the session day only');
select is((select reserved_pass_id from public.bookings where id = tests.id('booking')), tests.id('single'),
  'reserved for the booking');
select is((select sum(sessions_delta)::integer from public.ledger_entries where pass_id = tests.id('single')), 1,
  'with its grant of one session');
select is((select payload->>'single' from public.booking_events where booking_id = tests.id('booking') order by id desc limit 1),
  'true', 'the booking history says so');

update public.bookings set status = 'attended', attendance_marked_at = now() where id = tests.id('booking');
select private.post_charge(tests.id('booking'), 'attended');
select is((select pass_id from public.ledger_entries where booking_id = tests.id('booking') and entry_type = 'charge'),
  tests.id('single'), 'the charge comes off the single pass, not the five-session one');

-- "Подтвердить как разовое": decide_booking with p_single makes the request single before К2 goes out.
select tests.authenticate_as('trainer_a');
select is(public.decide_booking(tests.id('request'), true, p_single => true, p_single_title => 'Разовое занятие'),
  'confirmed'::public.booking_status, 'a request is confirmed as a single session');
select tests.clear_authentication();
select is((select p.is_drop_in from public.bookings b join public.passes p on p.id = b.reserved_pass_id
           where b.id = tests.id('request')), true, 'its own drop-in pass is reserved, not the five-session one');
select is((select pg_catalog.concat_ws(' / ', o.payload->>'pay', o.payload->>'pass_title') from public.notification_outbox o
           where o.type = 'booking_confirmed' and o.booking_id = tests.id('request')),
  'single / Разовое занятие', 'and «Запрос подтверждён» says it is a single session');
select is((select array_agg(e.to_status::text || coalesce(':' || (e.payload->>'single'), '') order by e.id)
           from public.booking_events e where e.booking_id = tests.id('request')),
  array['confirmed', 'confirmed:true'], 'the history has the confirmation, then the single session');

select * from finish();
rollback;

-- The trainer's "сверх группы" booking and a seat the queue offered (migration
-- 20261021091217_extra_seat_keeps_offer.sql): a seat offered to another client counts as taken, so the group grows and
-- the offered client can still accept; the offered client added by the trainer takes their own seat.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_user(h) from unnest(array['client_c', 'client_w', 'client_x']) h;
select tests.create_pair('trainer_a', h) from unnest(array['client_c', 'client_w', 'client_x']) h;
-- client_w has paid sessions, so the debt limit (979_debt_limit) does not decline the offer.
select tests.create_pass('trainer_a', 'client_w', 10);

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
insert into tests.ids values ('other', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '1 day', 'group', 2));
insert into tests.ids values ('own', tests.create_session('trainer_a', date_trunc('hour', now()) + interval '2 days', 'group', 2));
select tests.create_booking(tests.id(s), 'trainer_a', 'client_c') from unnest(array['other', 'own']) s;
-- One seat is free in each group and the queue has offered it to client_w.
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id, status, offered_at, offer_expires_at)
select tests.id(s), tests.pair_id('trainer_a', 'client_w'), tests.user_id('client_w'), tests.user_id('trainer_a'),
       'offered', now(), now() + interval '20 minutes'
from unnest(array['other', 'own']) s;
insert into tests.ids select 'entry_' || s, w.id from unnest(array['other', 'own']) s
join public.waitlist_entries w on w.session_id = tests.id(s);

select tests.authenticate_as('trainer_a');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('other'),
  tests.pair_id('trainer_a', 'client_x')), 'the trainer adds another client while the free seat is offered');
select lives_ok(format($$ select public.add_group_participant_extra(%L, %L) $$, tests.id('own'),
  tests.pair_id('trainer_a', 'client_w')), 'the trainer adds the offered client');
select tests.clear_authentication();

select is((select capacity::int from public.sessions where id = tests.id('other')), 3,
  'the group grows, since the free seat is held for the offer');
select is((select capacity::int from public.sessions where id = tests.id('own')), 2,
  'the offered client takes their own seat and the group keeps its size');

select tests.authenticate_as('client_w');
select lives_ok(format($$ select public.accept_waitlist_offer(%L) $$, tests.id('entry_other')),
  'the offered client still accepts the held seat');
select tests.clear_authentication();
select is((select count(*)::int from public.bookings b where b.session_id = tests.id('other')
           and b.status in ('requested', 'confirmed')), 3, 'three clients in the grown group');

select * from finish();
rollback;

-- cancel_preview of migration 20261017023900_cancel_preview.sql (screens.md §4.3, PRD 2.6.5-3): what a late
-- cancellation would charge, without changing anything.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create function tests.add_slot(p_starts_at timestamptz) returns uuid language sql set search_path = '' as $$
  insert into public.slots (trainer_id, starts_at, ends_at)
  values (tests.user_id('trainer_a'), p_starts_at, p_starts_at + interval '1 hour') returning id
$$;

insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 3, 900000));
insert into tests.ids values ('slot_3d', tests.add_slot(date_trunc('hour', now()) + interval '3 days'));
insert into tests.ids values ('slot_5h', tests.add_slot(date_trunc('hour', now()) + interval '5 hours'));

select tests.authenticate_as('client_c');
insert into tests.ids select 'b_free', booking_id from public.book_slot(tests.id('slot_3d'));
insert into tests.ids select 'b_late', booking_id from public.book_slot(tests.id('slot_5h'));

select results_eq(
  format($$ select late, charged, pass_title from public.cancel_preview(%L) $$, tests.id('b_free')),
  $$ values (false, false, null::text) $$,
  'preview: before the deadline the cancellation is free'
);
select results_eq(
  format($$ select late, charged, pass_title, debt_minor from public.cancel_preview(%L) $$, tests.id('b_late')),
  format($$ select true, true, title, null::bigint from public.passes where id = %L $$, tests.id('pass_c')),
  'preview: after the deadline it names the pass the charge takes'
);
select is(
  (select sessions_left from public.cancel_preview(tests.id('b_late'))),
  (select available from public.pass_balances where pass_id = tests.id('pass_c'))::integer,
  'preview: the sessions left stay as they are, the booking already holds its session'
);
select is((select status::text from public.bookings where id = tests.id('b_late')), 'confirmed',
  'preview: the booking stays confirmed');
select is((select count(*) from public.ledger_entries where booking_id = tests.id('b_late')), 0::bigint,
  'preview: nothing is charged');
select tests.clear_authentication();
select is(
  (select count(*) from public.notification_outbox
   where booking_id = tests.id('b_late') and type in ('booking_cancelled_by_client', 'charge_posted')),
  0::bigint, 'preview: no message is queued');

select tests.authenticate_as('client_e');
select throws_ok(
  format($$ select * from public.cancel_preview(%L) $$, tests.id('b_late')),
  'P0002', 'booking_not_found', 'preview: another client gets nothing'
);
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.cancel_preview(uuid)', 'execute'),
  'preview: anon cannot call it');

select tests.authenticate_as('client_c');
select is(public.cancel_my_booking(tests.id('b_late'), null, true)::text, 'late_cancelled',
  'preview: the real cancellation still works after previews');

select * from finish();
rollback;

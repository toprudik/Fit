-- booking_preview of 20261023061127_booking_preview_unpaid.sql: the confirm sheet learns that the pass a booking
-- would use is not paid yet, while a free or paid pass says nothing.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_pair('trainer_a', 'client_c');

select tests.authenticate_as('trainer_a');
select public.save_week_template('[{"iso_weekday": 2, "start_time": "09:00", "end_time": "10:00", "duration_min": 60}]');
select tests.clear_authentication();
select s.id as slot from public.slots s
where s.trainer_id = tests.user_id('trainer_a') and s.starts_at > now() + interval '2 days' and s.status = 'open'
order by s.starts_at limit 1 \gset

select tests.create_pass('trainer_a', 'client_c', 5) as free_pass \gset
select tests.authenticate_as('client_c');
select is((select row(confirmed, pass_unpaid)::text from public.booking_preview(:'slot')), row(true, false)::text,
  'preview: a free pass is not unpaid');
select tests.clear_authentication();

update public.passes set price_minor = 900000 where id = :'free_pass';
select tests.authenticate_as('client_c');
select is((select row(confirmed, pass_title, pass_unpaid)::text from public.booking_preview(:'slot')),
  row(true, '5 sessions', true)::text, 'preview: a pass with nothing paid is unpaid, and the booking still goes through');
select tests.clear_authentication();

select tests.create_user('client_d');
select tests.authenticate_as('client_d');
select throws_ok(format($$ select * from public.booking_preview(%L) $$, :'slot'), 'P0001', 'slot_unavailable',
  'preview: still nothing for a client of another trainer');
select tests.clear_authentication();

select * from finish();
rollback;

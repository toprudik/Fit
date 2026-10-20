-- The monthly report without the health data consent, migration 20261020164613_monthly_report_health_consent.sql
-- (право 3): no blocks built from health data in the report, in the copy sent to the trainer or on story cards.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_trainer('trainer_a');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_e');

-- September 2026 of E (Moscow): an attended session, weight 80 -> 79, a day in the food diary and a day of steps.
select tests.create_booking(tests.create_session('trainer_a', '2026-09-10 07:00+00'), 'trainer_a', 'client_e', 'attended');
insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by) values
  (tests.user_id('client_e'), 'weight', 80, '2026-09-02 08:00+03', '2026-09-02', tests.user_id('client_e')),
  (tests.user_id('client_e'), 'weight', 79, '2026-09-28 08:00+03', '2026-09-28', tests.user_id('client_e'));
insert into public.food_diary_entries (client_id, local_date, meal, title, kcal)
values (tests.user_id('client_e'), '2026-09-15', 'lunch', 'Суп', 500);
insert into public.activity_entries (client_id, local_date, metric, value)
values (tests.user_id('client_e'), '2026-09-15', 'steps', 9000);

select tests.authenticate_as('client_e');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.my_monthly_report('2026-09-01')) k),
  array['health_closed', 'month', 'sessions'],
  'without the consent the report keeps the sessions and leaves out the weight, the food and the steps'
);
select is(public.my_monthly_report('2026-09-01')->'health_closed', 'true'::jsonb, 'and says the health blocks are closed');
select throws_ok(
  $$ select public.create_story_card('2026-09-01', 'weight', null, true) $$,
  'P0001', 'nothing_to_show',
  'there is no weight card without the consent'
);
select isnt(public.create_story_card('2026-09-01', 'sessions'), null, 'the sessions card still works');

select public.share_monthly_report('2026-09-01', tests.pair_id('trainer_a', 'client_e'));
select tests.authenticate_as_service_role();
select is(
  (select report ? 'measurements' or report ? 'nutrition' or report ? 'steps'
   from public.monthly_report_shares where coaching_id = tests.pair_id('trainer_a', 'client_e')),
  false,
  'the copy sent to the trainer has no health blocks either'
);

-- E gives the consent: the blocks come back.
insert into public.consents (user_id, kind, version) values (tests.user_id('client_e'), 'pd_health', '2026-11');
select tests.authenticate_as('client_e');
select is(
  public.my_monthly_report('2026-09-01')->'measurements', '[{"kind": "weight", "from": 80.00, "to": 79.00}]'::jsonb,
  'with the consent the weight is back'
);
select ok(not public.my_monthly_report('2026-09-01') ? 'health_closed', 'and the report is not marked closed');

-- A withdrawn consent closes them again.
update public.consents set revoked_at = pg_catalog.now()
where user_id = tests.user_id('client_e') and kind = 'pd_health' and revoked_at is null;
select is(public.my_monthly_report('2026-09-01')->'health_closed', 'true'::jsonb, 'withdrawing the consent closes them again');

select * from finish();
rollback;

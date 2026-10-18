-- Forwarding a monthly report to the trainer, migration 20261018001353_monthly_report_shares.sql (PRD wave-3 §4
-- rule 3): a copy of the month for one live pair, without the other pairs, and one message to the trainer.
begin;
\ir _helpers.psql
select plan(17);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
update public.profiles set first_name = 'Ира', last_name = 'Тренер' where id = tests.user_id('trainer_a');
update public.profiles set first_name = 'Олег', last_name = 'Тренер' where id = tests.user_id('trainer_b');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');

-- September 2026 of C (Moscow): two sessions with A, one with B, and a homework of A done.
select tests.create_booking(tests.create_session('trainer_a', s), 'trainer_a', 'client_c', 'attended')
from unnest(array['2026-09-10 07:00+00', '2026-09-17 07:00+00']::timestamptz[]) s;
select tests.create_booking(tests.create_session('trainer_b', '2026-09-12 07:00+00'), 'trainer_b', 'client_c', 'attended');
insert into public.homework (coaching_id, title, due_date)
values (tests.pair_id('trainer_a', 'client_c'), 'Планка', '2026-09-15');
insert into public.homework_occurrences (homework_id, due_on, done_at)
select h.id, '2026-09-15', '2026-09-15 10:00+03' from public.homework h where h.coaching_id = tests.pair_id('trainer_a', 'client_c');

create table tests.pairs as
  select tests.pair_id('trainer_a', 'client_c') as a, tests.pair_id('trainer_b', 'client_c') as b;
grant select on tests.pairs to authenticated;

select tests.authenticate_as_anon();
select throws_ok($$ select public.share_monthly_report('2026-09-01', (select a from tests.pairs)) $$, '42501', null,
  'anon cannot send a report');

select tests.authenticate_as('client_c');
select is((select jsonb_agg(x->>'name' order by x->>'name') from jsonb_array_elements(public.my_monthly_report_shares('2026-09-01')) x),
  '["Ира Тренер", "Олег Тренер"]'::jsonb,
  'the client sees their live pairs to send the month to');
select ok((select bool_and(x->'shared_at' = 'null') from jsonb_array_elements(public.my_monthly_report_shares('2026-09-01')) x),
  'nothing is sent yet');
select is(public.my_monthly_report_shares('2026-08-01'), '[]'::jsonb, 'a month without a report offers no one');
select throws_ok($$ select public.share_monthly_report('2026-08-01', (select a from tests.pairs)) $$, 'P0001', 'no_report',
  'a month without a report cannot be sent');

select public.share_monthly_report('2026-09-01', (select a from tests.pairs));
select public.share_monthly_report('2026-09-01', (select b from tests.pairs));
select public.share_monthly_report('2026-09-01', (select a from tests.pairs));
select ok((select x->'shared_at' <> 'null' from jsonb_array_elements(public.my_monthly_report_shares('2026-09-01')) x
           where x->>'coaching_id' = (select a::text from tests.pairs)),
  'the client sees the month as sent');

select tests.authenticate_as('trainer_a');
select is((select public.shared_monthly_report(a, '2026-09-01') #> '{report,sessions}' from tests.pairs),
  jsonb_build_object('total', 2, 'trainers', jsonb_build_array(jsonb_build_object(
    'coaching_id', (select a from tests.pairs), 'name', 'Ира Тренер', 'count', 2))),
  'the trainer sees the sessions with them only');
select ok((select not (public.shared_monthly_report(a, '2026-09-01')->'report' ? 'homework') from tests.pairs),
  'homework over all pairs is left out');
select is((select public.shared_monthly_report(b, '2026-09-01') from tests.pairs), null, 'another pair''s copy stays hidden');
select is((select public.shared_monthly_report(a, '2026-10-01') from tests.pairs), null, 'a month not sent has nothing');
select is((select count(*)::integer from public.monthly_report_shares), 0, 'the trainer cannot read the table');

select tests.authenticate_as('trainer_b');
select is((select public.shared_monthly_report(b, '2026-09-01') #>> '{report,sessions,total}' from tests.pairs), '1',
  'the other trainer sees their own count');

select tests.authenticate_as('client_d');
select throws_ok($$ select public.share_monthly_report('2026-09-01', (select a from tests.pairs)) $$, 'P0001', 'pair_not_found',
  'nobody sends to a pair that is not theirs');

select tests.clear_authentication();
select is((select array_agg(o.payload->>'name') from public.notification_outbox o
           where o.type = 'monthly_report_shared' and o.user_id = tests.user_id('trainer_a')),
  array[(select private.trainer_client_label(a) from tests.pairs)],
  'the trainer gets one message, however often the month is sent');
select is((select o.payload->>'month' from public.notification_outbox o
           where o.type = 'monthly_report_shared' and o.user_id = tests.user_id('trainer_b')), '2026-09-01',
  'the message names the month');

update public.coachings set status = 'ended', ended_at = now() where id = (select a from tests.pairs);
select tests.authenticate_as('trainer_a');
select is((select public.shared_monthly_report(a, '2026-09-01') from tests.pairs), null, 'an ended pair''s copy is closed');

select tests.authenticate_as('client_c');
select is(jsonb_array_length(public.my_monthly_report_shares('2026-09-01')), 1, 'an ended pair is not offered');

select * from finish();
rollback;

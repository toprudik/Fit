-- Review messages, migration 20261018012237_review_prompt.sql (PRD wave-2 §11 rules 4 and 7): the third attended
-- session offers the client a review once, and the admin's decision on a dispute reaches both sides.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_admin('admin_z');
select tests.create_pair('trainer_a', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
insert into tests.ids values ('a_c', tests.pair_id('trainer_a', 'client_c'));
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.prompts() returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from public.notification_outbox o where o.type = 'review_prompt'
$$;

select tests.create_booking(tests.create_session('trainer_a', '2026-10-01 07:00+00'), 'trainer_a', 'client_c', 'attended');
insert into tests.ids values
  ('second', tests.create_booking(tests.create_session('trainer_a', '2026-10-03 07:00+00'), 'trainer_a', 'client_c', 'attended')),
  ('third', tests.create_booking(tests.create_session('trainer_a', '2026-10-05 07:00+00'), 'trainer_a', 'client_c', 'confirmed'));
select is(tests.prompts(), 0, '11.1: no offer after two sessions');

update public.bookings set status = 'attended' where id = tests.id('third');
select is(tests.prompts(), 1, '11.1: the third attended session offers a review');
select is(
  (select array[o.user_id::text, o.payload ->> 'coaching_id'] from public.notification_outbox o where o.type = 'review_prompt'),
  array[tests.user_id('client_c')::text, tests.id('a_c')::text],
  'to the client, about the pair');

update public.bookings set status = 'no_show' where id = tests.id('second');
update public.bookings set status = 'attended' where id = tests.id('second');
select is(tests.prompts(), 1, 'the bot offers it once, even when attendance is marked again');

select tests.create_booking(tests.create_session('trainer_a', '2026-10-07 07:00+00'), 'trainer_a', 'client_c', 'attended');
select is(tests.prompts(), 1, 'and not after later sessions');

select ok(private.notification_type_is_optional('review_prompt'), 'rule 4: the client can switch the offer off');

-- A dispute decided by the admin.
select tests.authenticate_as('client_c');
insert into tests.ids values ('review', public.save_review(tests.id('a_c'), 2, 'Опаздывает'));
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
insert into tests.ids values ('report', public.dispute_review(tests.id('review'), 'false_facts'));
select tests.clear_authentication();
select tests.authenticate_as('admin_z');
select public.admin_decide_review_dispute(tests.id('report'), true, 'Нарушает правила');
select tests.clear_authentication();

select is(
  (select array_agg(o.payload ->> 'role' order by o.payload ->> 'role') from public.notification_outbox o
   where o.type = 'report_resolution' and o.payload ->> 'review_id' = tests.id('review')::text),
  array['author', 'trainer'],
  'rule 7: both sides hear about the decision');
select is(
  (select array[o.user_id::text, o.payload ->> 'reason', o.payload ->> 'hidden'] from public.notification_outbox o
   where o.type = 'report_resolution' and o.payload ->> 'role' = 'author'),
  array[tests.user_id('client_c')::text, 'Нарушает правила', 'true'],
  'the author gets the reason');
select is(
  (select o.user_id from public.notification_outbox o where o.type = 'report_resolution' and o.payload ->> 'role' = 'trainer'),
  tests.user_id('trainer_a'),
  'the trainer gets the decision');

select * from finish();
rollback;

-- Reviews, migration 20261017135456_reviews.sql (PRD wave-2 §11): three attended sessions, one review per pair with
-- its history, the trainer's answer and dispute, the admin's decision, who reads what.
begin;
\ir _helpers.psql
select plan(29);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('user_e');
select tests.create_admin('admin_z');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
insert into tests.ids values ('a_c', tests.pair_id('trainer_a', 'client_c')), ('b_c', tests.pair_id('trainer_b', 'client_c'));
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;

-- Two attended sessions with A, a no-show and a late cancellation that do not count (acceptance 11.2).
select tests.create_booking(tests.create_session('trainer_a', '2026-10-01 07:00+00'), 'trainer_a', 'client_c', 'attended');
select tests.create_booking(tests.create_session('trainer_a', '2026-10-03 07:00+00'), 'trainer_a', 'client_c', 'attended');
insert into tests.ids values
  ('no_show', tests.create_booking(tests.create_session('trainer_a', '2026-10-05 07:00+00'), 'trainer_a', 'client_c', 'attended')),
  ('late', tests.create_booking(tests.create_session('trainer_a', '2026-10-07 07:00+00'), 'trainer_a', 'client_c', 'confirmed'));
update public.bookings set status = 'no_show' where id = tests.id('no_show');
update public.bookings set status = 'late_cancelled', cancelled_at = now(), cancelled_by_role = 'client' where id = tests.id('late');

select tests.authenticate_as('client_c');
select is((select array[attended::int] from public.review_eligibility(tests.id('a_c'))), array[2],
  '11.2: no-shows and late cancellations do not count');
select is((select eligible from public.review_eligibility(tests.id('a_c'))), false, '11.1: two sessions are not enough');
select throws_ok($$ select public.save_review(tests.id('a_c'), 5) $$, 'P0001', 'too_few_sessions',
  '11.1: no review after two sessions');
select tests.clear_authentication();

select tests.create_booking(tests.create_session('trainer_a', '2026-10-09 07:00+00'), 'trainer_a', 'client_c', 'attended');

select tests.authenticate_as('client_c');
select is((select eligible from public.review_eligibility(tests.id('a_c'))), true, '11.1: the third session opens the review');
select throws_ok($$ select public.save_review(tests.id('a_c'), 6) $$, '22023', 'invalid_review', 'a rating is 1 to 5');
insert into tests.ids values ('review', public.save_review(tests.id('a_c'), 4, '  Хорошо объясняет  '));
select is((select array[rating::text, body] from public.reviews where id = tests.id('review')), array['4', 'Хорошо объясняет'],
  'the client leaves a rating and a text');
select is(public.save_review(tests.id('a_c'), 5, null), tests.id('review'), 'saving again edits the same review');
select throws_ok(
  $$ insert into public.reviews (coaching_id, client_id, trainer_id, rating)
     values (tests.id('a_c'), tests.user_id('client_c'), tests.user_id('trainer_a'), 1) $$,
  '42501', null, '11.3: a second review through the API is refused');
select throws_ok($$ select public.save_review(tests.id('b_c'), 5) $$, 'P0001', 'too_few_sessions',
  'sessions with another trainer do not count');
select is((select count(*)::int from public.review_revisions), 0, 'the author does not read the history');
select tests.clear_authentication();

select tests.authenticate_as('user_e');
select throws_ok($$ select public.save_review(tests.id('a_c'), 1) $$, '42501', null, '11.6: no review without a pair');
select is((select count(*)::int from public.reviews), 0, 'a stranger reads no reviews');
select is((select count(*)::int from public.review_eligibility(tests.id('a_c'))), 0, 'and gets no eligibility');
select tests.clear_authentication();

select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.reviews), 0, 'another trainer does not see the review');
select throws_ok($$ select public.reply_to_review(tests.id('review'), 'Спасибо') $$, '42501', null, 'nor answers it');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select is((select rating::int from public.reviews where id = tests.id('review')), 5, 'the trainer sees the latest version');
select lives_ok($$ select public.reply_to_review(tests.id('review'), 'Спасибо!') $$, '§11-5: the trainer answers');
select throws_ok($$ update public.reviews set rating = 1 where id = tests.id('review') $$, '42501', null,
  '§11-8: the trainer cannot change the review');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is((select array[rating::text, trainer_reply] from public.reviews where id = tests.id('review')), array['5', 'Спасибо!'],
  '11.4: the author sees the answer, the review unchanged');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.dispute_review(tests.id('review'), 'rude') $$, '22023', 'invalid_dispute', 'a dispute needs a known reason');
insert into tests.ids values ('report', public.dispute_review(tests.id('review'), 'false_facts', 'Не было такого'));
select throws_ok($$ select public.dispute_review(tests.id('review'), 'other') $$, '42501', null, 'one open dispute per review');
select tests.clear_authentication();

select tests.authenticate_as('admin_z');
select is((select array[target_type::text, status::text] from public.reports where id = tests.id('report')), array['review', 'open'],
  '11.5: the dispute is in the admin''s queue');
select is((select count(*)::int from public.review_revisions where review_id = tests.id('review')), 1, 'with the review''s history');
select lives_ok($$ select public.admin_decide_review_dispute(tests.id('report'), true, 'Нарушает правила') $$, 'the admin hides it');
select is((select count(*)::int from public.admin_audit_log where action = 'review.decide' and target_id = tests.id('review')), 1,
  'the decision is in the audit log');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.reviews), 0, '11.5: a hidden review is gone for the trainer');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is((select array[status::text, hidden_reason] from public.reviews where id = tests.id('review')), array['hidden', 'Нарушает правила'],
  '11.5: the author sees it hidden with the reason');
select is(public.delete_review(tests.id('a_c')), true, 'the author deletes the review');
select is((select count(*)::int from public.reviews), 0, 'and no longer sees it');
select tests.clear_authentication();

select * from finish();
rollback;

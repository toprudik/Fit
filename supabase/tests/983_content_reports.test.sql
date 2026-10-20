-- Content reports, migration 20261018201537_content_reports.sql (legal/product-changes.md Б13, DSA arts. 16, 17, 20):
-- who can report what, the receipt, the decision with a reason to both sides, the appeal to another admin.
begin;
\ir _helpers.psql
select plan(40);

select tests.create_trainer('trainer_a', 'coach-anna');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_admin('admin_y');
select tests.create_admin('admin_z');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
update public.trainer_profiles set is_public = true where user_id = tests.user_id('trainer_a');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated, anon;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;

-- A review of client C with the trainer's reply, a trainer comment in C's diary, and a challenge where D shows
-- under an alias.
with x as (
  insert into public.reviews (coaching_id, client_id, trainer_id, rating, body, trainer_reply, trainer_replied_at)
  values (tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), tests.user_id('trainer_a'), 2, 'Опоздал',
          'Сама виновата', now())
  returning id)
insert into tests.ids select 'review', id from x;
with x as (
  insert into public.food_day_comments (client_id, coaching_id, author_id, local_date, body)
  values (tests.user_id('client_c'), tests.pair_id('trainer_a', 'client_c'), tests.user_id('trainer_a'), current_date, 'Ешь меньше')
  returning id)
insert into tests.ids select 'comment', id from x;
with x as (
  insert into public.groups (trainer_id, name) values (tests.user_id('trainer_a'), 'Утро') returning id)
insert into tests.ids select 'group', id from x;
with x as (
  insert into public.challenges (trainer_id, group_id, title, metric, starts_on, ends_on)
  values (tests.user_id('trainer_a'), tests.id('group'), 'Шаги', 'steps', current_date, current_date + 6)
  returning id)
insert into tests.ids select 'challenge', id from x;
insert into public.challenge_participants (challenge_id, coaching_id, user_id, show_on_leaderboard, alias)
values (tests.id('challenge'), tests.pair_id('trainer_a', 'client_c'), tests.user_id('client_c'), true, null),
       (tests.id('challenge'), tests.pair_id('trainer_a', 'client_d'), tests.user_id('client_d'), true, 'Грубое слово');
insert into tests.ids
select 'alias', id from public.challenge_participants where user_id = tests.user_id('client_d');

-- Reporting

select tests.authenticate_as('client_c');
insert into tests.ids values ('r_reply', public.report_content('review_reply', tests.id('review'), 'insult', ' Оскорбление '));
select is((select array[reason, body, status::text] from public.reports where id = tests.id('r_reply')),
  array['insult', 'Оскорбление', 'open'], 'the client reports the reply to their review');
select tests.clear_authentication();
select is((select array[target_owner_id::text, target_snapshot] from public.reports where id = tests.id('r_reply')),
  array[tests.user_id('trainer_a')::text, 'Сама виновата'], 'the report keeps who wrote the reply and what it said');
select tests.authenticate_as('client_c');
select is(public.report_content('review_reply', tests.id('review'), 'spam'), tests.id('r_reply'),
  'a second report of the same reply returns the open one');
insert into tests.ids values ('r_comment', public.report_content('food_comment', tests.id('comment'), 'insult'));
insert into tests.ids values ('r_alias', public.report_content('challenge_alias', tests.id('alias'), 'insult'));
insert into tests.ids values ('r_showcase', public.report_content('trainer_profile', tests.user_id('trainer_a'), 'false_facts'));
select is((select count(*) from public.reports where reporter_id = tests.user_id('client_c')), 4::bigint,
  'a diary comment, a challenge alias and a showcase can be reported too');
select throws_ok($$ select public.report_content('review_reply', tests.id('review'), 'boring') $$, '22023', 'invalid_report',
  'only the listed reasons');
select throws_ok(format($$ select public.report_content('review_reply', tests.id('review'), 'other', %L) $$, repeat('a', 2001)),
  '22023', 'invalid_report', 'a text of at most 2000 characters');
select throws_ok($$ select public.report_content('review', tests.id('review'), 'insult') $$, 'P0002', 'not_found',
  'a review is disputed by its trainer, not reported this way');
select throws_ok($$ select public.report_content('challenge_alias', gen_random_uuid(), 'insult') $$, 'P0002', 'not_found',
  'an unknown id says not found');
select tests.clear_authentication();

select tests.authenticate_as('stranger_s');
select throws_ok($$ select public.report_content('review_reply', tests.id('review'), 'insult') $$, 'P0002', 'not_found',
  'nobody else can report a reply they were never shown');
select throws_ok($$ select public.report_content('food_comment', tests.id('comment'), 'insult') $$, 'P0002', 'not_found',
  'nor a comment in someone else''s diary');
select throws_ok($$ select public.report_content('challenge_alias', tests.id('alias'), 'insult') $$, 'P0002', 'not_found',
  'nor an alias in a challenge they are not in');
select is((select count(*) from public.reports), 0::bigint, 'a stranger reads no reports');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.report_content('trainer_profile', tests.user_id('trainer_a'), 'spam') $$, 'P0002', 'not_found',
  'nobody reports their own content');
select is((select count(*) from public.reports), 0::bigint, 'the author does not see who reported them');
select tests.clear_authentication();

select is(
  (select count(*) from public.notification_outbox
   where type = 'report_resolution' and user_id = tests.user_id('client_c') and payload ->> 'event' = 'received'),
  4::bigint, 'every report gets a receipt in the bot (art. 16(4))');

-- Without signing in: only an open showcase, by its address.
select tests.authenticate_as_anon();
insert into tests.ids values ('r_public', public.report_showcase_public('coach-anna', 'false_facts', 'Нет такого диплома', 'mail@example.invalid'));
select throws_ok($$ select public.report_showcase_public('nobody-here', 'spam') $$, 'P0002', 'not_found',
  'an unknown address says not found');
select throws_ok($$ select public.report_content('trainer_profile', tests.user_id('trainer_a'), 'spam') $$, '42501', null,
  'anyone signed out reports only through the public form');
select throws_ok($$ select count(*) from public.reports $$, '42501', null, 'anon reads no reports');
select tests.clear_authentication();
select is((select array[reporter_id::text, reporter_contact] from public.reports where id = tests.id('r_public')),
  array[null, 'mail@example.invalid'], 'the public report keeps the contact and no account');

-- Deciding

select tests.authenticate_as('client_c');
select throws_ok(format($$ select public.admin_decide_report(%L, true, 'x') $$, tests.id('r_reply')), '42501', 'forbidden',
  'only admins decide');
select tests.clear_authentication();

select tests.authenticate_as('admin_y');
select throws_ok(format($$ select public.admin_decide_report(%L, true, '  ') $$, tests.id('r_reply')), '22023', 'invalid_decision',
  'a decision needs a reason (art. 17)');
select public.admin_decide_report(tests.id('r_reply'), true, 'Оскорбление клиента');
select public.admin_decide_report(tests.id('r_comment'), true, 'Грубо');
select public.admin_decide_report(tests.id('r_alias'), true, 'Ник оскорбительный');
select public.admin_dismiss_report(tests.id('r_public'), 'Повтор жалобы');
select public.admin_decide_report(tests.id('r_showcase'), false, 'Диплом подтверждён');
select tests.clear_authentication();

select is((select trainer_reply from public.reviews where id = tests.id('review')), null, 'a hidden reply is gone from the review');
select ok((select hidden_by_admin_at is not null from public.food_day_comments where id = tests.id('comment')), 'a hidden comment is marked');
select tests.authenticate_as('client_c');
select is((select count(*) from public.food_day_comments), 0::bigint, 'and the client no longer reads it');
select tests.clear_authentication();
select is((select show_on_leaderboard from public.challenge_participants where id = tests.id('alias')), false,
  'a hidden alias leaves the leaderboard');
select is((select status::text from public.reports where id = tests.id('r_public')), 'dismissed',
  'a dismissed report closes without touching the showcase');
select is(
  (select array_agg(payload ->> 'role' order by payload ->> 'role') from public.notification_outbox
   where type = 'report_resolution' and payload ->> 'report_id' = tests.id('r_reply')::text and payload ->> 'event' = 'decided'),
  array['owner', 'reporter'], 'both sides get the decision with its reason');
select is(
  (select count(*) from public.notification_outbox
   where type = 'report_resolution' and payload ->> 'report_id' = tests.id('r_showcase')::text and payload ->> 'role' = 'owner'),
  0::bigint, 'kept content is not news to its author');

-- Appeals

select tests.authenticate_as('trainer_a');
select is((select count(*) from public.my_report_decisions()), 3::bigint, 'the author sees decisions about their content');
insert into tests.ids values ('appeal', public.appeal_report(tests.id('r_reply'), 'Это была шутка'));
select throws_ok(format($$ select public.appeal_report(%L, 'Ещё раз') $$, tests.id('r_reply')), '23505', 'already_appealed',
  'one appeal per decision');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is((select count(*) from public.reports where id = tests.id('appeal')), 0::bigint,
  'the reporter does not read the appeal the author wrote');
select tests.clear_authentication();

select tests.authenticate_as('stranger_s');
select throws_ok(format($$ select public.appeal_report(%L, 'Не согласен') $$, tests.id('r_comment')), 'P0002', 'not_found',
  'only the reporter or the author appeals');
select tests.clear_authentication();

select tests.authenticate_as('admin_y');
select throws_ok(format($$ select public.admin_decide_report(%L, false, 'Передумал') $$, tests.id('appeal')), '42501', 'another_admin',
  'the admin who decided does not decide the appeal (art. 20(6))');
select tests.clear_authentication();

select tests.authenticate_as('admin_z');
select public.admin_decide_report(tests.id('appeal'), false, 'Шутка, оскорбления нет');
select tests.clear_authentication();
select is((select trainer_reply from public.reviews where id = tests.id('review')), 'Сама виновата', 'an upheld appeal brings the reply back');
select is(
  (select array_agg(payload ->> 'role' order by payload ->> 'role') from public.notification_outbox
   where type = 'report_resolution' and payload ->> 'report_id' = tests.id('appeal')::text and payload ->> 'event' = 'decided'),
  array['owner', 'reporter'], 'both sides learn how the appeal ended');

-- A review hidden after the trainer's dispute: its author appeals the same way.
select tests.authenticate_as('trainer_a');
insert into tests.ids values ('dispute', public.dispute_review(tests.id('review'), 'false_facts'));
select tests.clear_authentication();
select tests.authenticate_as('admin_y');
select public.admin_decide_review_dispute(tests.id('dispute'), true, 'Не подтверждено');
select tests.clear_authentication();
select tests.authenticate_as('client_c');
select is((select count(*) from public.my_report_decisions() where report_id = tests.id('dispute')), 1::bigint,
  'the client sees the decision about their review, to appeal it');
insert into tests.ids values ('review_appeal', public.appeal_report(tests.id('dispute'), 'Всё так и было'));
select tests.clear_authentication();
select tests.authenticate_as('admin_z');
select throws_ok(format($$ select public.admin_decide_review_dispute(%L, false, null) $$, tests.id('review_appeal')), 'P0002',
  'not_found', 'an appeal about a review is not decided as a new dispute');
select tests.clear_authentication();
-- A second dispute of the same review, open beside the appeal.
with x as (
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (tests.user_id('trainer_a'), 'review', tests.id('review'), 'spam') returning id)
insert into tests.ids select 'dispute2', id from x;
select tests.authenticate_as('admin_y');
select public.admin_decide_review_dispute(tests.id('dispute2'), true, 'Опять');
select tests.clear_authentication();
select is((select status::text from public.reports where id = tests.id('review_appeal')), 'open',
  'a new dispute decision leaves the appeal open for another admin');
select tests.authenticate_as('admin_z');
select public.admin_decide_report(tests.id('review_appeal'), false, 'Отзыв возвращён');
select tests.clear_authentication();
select is((select array[status::text, coalesce(hidden_reason, '-')] from public.reviews where id = tests.id('review')),
  array['published', '-'], 'the client appeals a hidden review and another admin publishes it again');
select is((select status::text from public.reports where id = tests.id('review_appeal')), 'kept', 'the appeal is closed');

select * from finish();
rollback;

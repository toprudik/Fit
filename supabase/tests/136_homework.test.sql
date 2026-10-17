-- Homework (migration 20261017034100_homework.sql, PRD wave-2 §10): save_homework lays out occurrences,
-- the client marks and unmarks them, reminders at 10:00 in the client's time zone, the trainer's note when
-- turned on, archiving on pair end, and the RLS of both tables (10.5).
begin;
\ir _helpers.psql
select plan(39);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_card('trainer_a', 'card_k');
update public.user_settings set time_zone = 'UTC' where user_id = tests.user_id('client_c');
select tests.pair_id('trainer_a', 'client_c') as pair_a, tests.pair_id('trainer_b', 'client_c') as pair_b,
       tests.pair_id('trainer_a', 'card_k') as pair_card, (now() at time zone 'UTC')::date as today \gset

-- =========================================================================================================
-- save_homework

select tests.authenticate_as_anon();
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'today')),
  '42501', null, 'save: anon cannot'
);

select tests.authenticate_as('trainer_b');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'today')),
  'P0002', 'not_found', 'save: another trainer of the client cannot give homework in this pair'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', :'pair_card', 'title', 'x', 'due_date', :'today')),
  'P0001', 'card_client', 'save: not to a card'
);
select throws_ok(
  format('select public.save_homework(%L)',
         jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'today'::date - 1)),
  'P0001', 'due_in_past', 'save: a new deadline is not in the past of the client'
);
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', :'pair_a', 'title', ' ', 'due_date', :'today')),
  '22023', null, 'save: a title is required'
);
select throws_ok(
  format('select public.save_homework(%L)',
         jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'today', 'repeat_weekdays', '[1]'::jsonb)),
  '22023', null, 'save: weekdays go with an end date'
);
select throws_ok(
  format('select public.save_homework(%L)',
         jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'today', 'video_url', 'http://x.example')),
  '23514', null, 'save: a video link is https'
);

-- 10.1: once, due tomorrow.
select public.save_homework(jsonb_build_object(
  'coaching_id', :'pair_a', 'title', 'Планка', 'description', '3 раза по минуте', 'due_date', :'today'::date + 1)) as hw_once \gset
select results_eq(
  format('select due_on from public.homework_occurrences where homework_id = %L', :'hw_once'),
  format('values (%L::date)', :'today'::date + 1),
  'save: a one-off homework has one occurrence on its day'
);

-- 10.4: Mon, Wed, Fri for four weeks starting on a Monday ahead.
select (:'today'::date + (8 - extract(isodow from :'today'::date))::int) as monday \gset
select public.save_homework(jsonb_build_object(
  'coaching_id', :'pair_a', 'title', 'Растяжка', 'due_date', :'monday',
  'repeat_weekdays', '[5, 1, 3, 3]'::jsonb, 'repeat_until', :'monday'::date + 27)) as hw_repeat \gset
select is(
  (select count(*)::int from public.homework_occurrences where homework_id = :'hw_repeat'), 12,
  'save: Mon/Wed/Fri over four weeks makes twelve occurrences'
);
select is(
  (select repeat_weekdays from public.homework where id = :'hw_repeat'), '{1,3,5}'::smallint[],
  'save: weekdays are stored sorted and once each'
);
select is(
  (select count(*)::int from public.homework_occurrences
   where homework_id = :'hw_repeat' and extract(isodow from due_on) not in (1, 3, 5)), 0,
  'save: only the chosen weekdays'
);
select throws_ok(
  format('select public.save_homework(%L)',
         jsonb_build_object('coaching_id', :'pair_a', 'title', 'x', 'due_date', :'monday',
                            'repeat_weekdays', '[1]'::jsonb, 'repeat_until', :'monday'::date + 200)),
  '23514', null, 'save: a repeat lasts up to half a year'
);

-- Editing keeps marks and lays out the open ones again.
select tests.clear_authentication();
update public.homework_occurrences set due_on = :'today', done_at = now()
where homework_id = :'hw_repeat' and due_on = :'monday';
select tests.authenticate_as('trainer_a');
select lives_ok(
  format('select public.save_homework(%L)', jsonb_build_object(
    'id', :'hw_repeat', 'title', 'Растяжка спины', 'due_date', :'monday',
    'repeat_weekdays', '[1]'::jsonb, 'repeat_until', :'monday'::date + 27)),
  'save: the trainer edits a homework'
);
select is(
  (select array_agg(extract(isodow from due_on)::int order by due_on) from public.homework_occurrences
   where homework_id = :'hw_repeat' and done_at is null),
  '{1,1,1,1}'::int[],
  'save: an edit lays out the open occurrences again'
);
select is(
  (select count(*)::int from public.homework_occurrences where homework_id = :'hw_repeat' and done_at is not null), 1,
  'save: an edit keeps the marks'
);

-- =========================================================================================================
-- RLS (10.5)

select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.homework), 0, 'rls: trainer B sees none of trainer A''s homework');
select is((select count(*)::int from public.homework_occurrences), 0, 'rls: nor their occurrences');
select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.homework), 0, 'rls: a stranger sees nothing');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.homework), 2, 'rls: the client sees the homework of their pair');
select throws_ok(
  format('update public.homework_occurrences set done_at = now() where homework_id = %L', :'hw_once'),
  '42501', null, 'rls: no direct writes'
);
select throws_ok(
  format('insert into public.homework (coaching_id, title, due_date) values (%L, %L, %L)', :'pair_a', 'x', :'today'),
  '42501', null, 'rls: no direct insert'
);

select tests.authenticate_as('trainer_a');
select is(public.homework_today(:'pair_a'), :'today'::date, 'today: the trainer gets the client''s day');
select tests.authenticate_as('client_c');
select is(public.homework_today(:'pair_a'), :'today'::date, 'today: so does the client');
select tests.authenticate_as('stranger_s');
select is(public.homework_today(:'pair_a'), null, 'today: nobody else');

-- =========================================================================================================
-- mark_homework_done and unmark_homework_done

select tests.clear_authentication();
select id as occ_once from public.homework_occurrences where homework_id = :'hw_once' \gset
select (select id from public.homework_occurrences
        where homework_id = :'hw_repeat' and done_at is null order by due_on offset 1 limit 1) as occ_later \gset

select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.mark_homework_done(%L)', :'occ_once'), 'P0002', 'not_found', 'mark: only the client'
);

select tests.authenticate_as('client_c');
select throws_ok(
  format('select public.mark_homework_done(%L)', :'occ_later'),
  'P0001', 'not_yet', 'mark: not a later deadline while an earlier one is open'
);
select lives_ok(
  format('select public.mark_homework_done(%L, %L)', :'occ_once', '  Сделал  '),
  'mark: a homework due tomorrow can be done today'
);
select results_eq(
  format('select done_at is not null, comment from public.homework_occurrences where id = %L', :'occ_once'),
  $$ values (true, 'Сделал') $$,
  'mark: done with the comment'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox where type = 'homework_done'), 0,
  'mark: the trainer hears nothing while homework_done is off (the default)'
);

select tests.authenticate_as('client_c');
select lives_ok(format('select public.unmark_homework_done(%L)', :'occ_once'), 'unmark: within 24 hours');
select is(
  (select done_at from public.homework_occurrences where id = :'occ_once'), null, 'unmark: the mark is gone'
);

select tests.clear_authentication();
insert into public.notification_preferences (user_id, type, enabled)
values (tests.user_id('trainer_a'), 'homework_done', true);
select tests.authenticate_as('client_c');
select public.mark_homework_done(:'occ_once');
select tests.clear_authentication();
select results_eq(
  $$ select payload ->> 'title', user_id from public.notification_outbox where type = 'homework_done' $$,
  $$ values ('Планка', tests.user_id('trainer_a')) $$,
  'mark: with homework_done turned on, the trainer gets the note'
);
update public.homework_occurrences set done_at = now() - interval '25 hours' where id = :'occ_once';
select tests.authenticate_as('client_c');
select throws_ok(
  format('select public.unmark_homework_done(%L)', :'occ_once'), 'P0001', 'too_late', 'unmark: not after 24 hours'
);

-- =========================================================================================================
-- Reminders (10.1)

select tests.clear_authentication();
update public.homework_occurrences set due_on = :'today', done_at = null where id = :'occ_once';
select is(
  private.queue_homework_reminders(date_trunc('day', now()) + interval '9 hours 55 minutes'), 0,
  'reminder: not before 10:00 in the client''s time zone'
);
select is(
  private.queue_homework_reminders(date_trunc('day', now()) + interval '10 hours 1 minute'), 1,
  'reminder: queued at 10:00 for the open occurrence due today'
);
select is(
  private.queue_homework_reminders(date_trunc('day', now()) + interval '10 hours 6 minutes'), 0,
  'reminder: once per occurrence'
);
select results_eq(
  $$ select user_id, payload ->> 'title', payload ->> 'first_name' from public.notification_outbox
     where type = 'homework_reminder' $$,
  $$ values (tests.user_id('client_c'), 'Планка', 'trainer_a') $$,
  'reminder: to the client, with the title and the trainer''s name'
);

-- =========================================================================================================
-- Archive

select tests.authenticate_as('trainer_b');
select throws_ok(
  format('select public.archive_homework(%L)', :'hw_once'), 'P0002', 'not_found', 'archive: only the pair''s trainer'
);
select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = :'pair_a';
select is(
  (select count(*)::int from public.homework where coaching_id = :'pair_a' and archived_at is null), 0,
  'archive: ending the pair archives its homework'
);

select * from finish();
rollback;

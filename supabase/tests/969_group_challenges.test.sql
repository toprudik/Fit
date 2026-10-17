-- Group challenges and leaderboards (migration 20261017103914_group_challenges.sql, PRD wave-3 §2.3–2.4): who
-- creates them and with which metrics, opt-in joining with the metric shared, who sees which rows of the
-- leaderboard, the frozen score of a hidden participant, finishing with badges, and leaving with the pair.
begin;
\ir _helpers.psql
select plan(38);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_free');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_x');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c') as pair_c \gset
select tests.create_pair('trainer_a', 'client_d') as pair_d \gset
select tests.create_pair('trainer_a', 'client_e') as pair_e \gset
select tests.create_pair('trainer_a', 'client_x') as pair_x \gset
update public.user_settings set time_zone = 'UTC'
where user_id in (select tests.user_id(h) from unnest(array['trainer_a', 'client_c', 'client_d', 'client_e', 'client_x']) h);
select (now() at time zone 'UTC')::date as today \gset

select tests.authenticate_as('trainer_a');
insert into public.groups (trainer_id, name, goal) values (auth.uid(), 'Сброс веса', 'lose');
select g.id as group_id from public.groups g where g.name = 'Сброс веса' \gset
select public.add_group_member(:'group_id', p) from unnest(array[:'pair_c', :'pair_d', :'pair_e']::uuid[]) p;

-- =========================================================================================================
-- Creating

select tests.authenticate_as('trainer_free');
select throws_ok(format($$ select public.create_challenge(%L, 'Шаги', 'steps', 2::smallint, %L) $$, :'group_id', :'today'),
  '42501', 'plan_required', 'a trainer without groups in the plan cannot run challenges');

select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.create_challenge(%L, 'Минус пять', 'weight', 4::smallint, %L) $$, :'group_id', :'today'),
  'P0001', 'bad_metric', '2.4: there is no weight metric');
select throws_ok(format($$ select public.create_challenge(%L, 'Год шагов', 'steps', 13::smallint, %L) $$, :'group_id', :'today'),
  '22023', 'invalid_challenge', 'a challenge lasts 1 to 12 weeks');
select throws_ok(format($$ select public.create_challenge(%L, 'Вчера', 'steps', 2::smallint, %L) $$, :'group_id', :'today'::date - 1),
  '22023', 'invalid_challenge', 'a challenge starts today or later');

select public.create_challenge(:'group_id', '  Октябрь на ногах ', 'steps', 2::smallint, :'today', 10000, true) as ch \gset
select is((select row(title, ends_on) from public.challenges where id = :'ch'), row('Октябрь на ногах'::text, :'today'::date + 13),
  'the trainer creates a two-week challenge');

select tests.clear_authentication();
select is(
  (select array_agg(user_id order by user_id) from public.notification_outbox where type = 'challenge'),
  (select array_agg(id order by id) from public.profiles where id in (tests.user_id('client_c'), tests.user_id('client_d'), tests.user_id('client_e'))),
  'every member of the group is invited by the bot');
select throws_ok(
  format($$ insert into public.challenges (trainer_id, group_id, title, metric, starts_on, ends_on) values (%L, %L, 'x', 'weight', %L, %L) $$,
         tests.user_id('trainer_a'), :'group_id', :'today', :'today'::date + 6),
  '23514', null, '2.4: the table refuses a weight metric too');

-- =========================================================================================================
-- Joining

select tests.authenticate_as('client_x');
select is((select count(*)::int from public.challenges), 0, 'a client outside the group does not see the challenge');
select throws_ok(format('select public.join_challenge(%L)', :'ch'), 'P0001', 'not_allowed', 'and cannot join it');

select tests.authenticate_as('client_c');
select is((select row(joined, shared, state) from public.my_challenges()), row(false, true, 'active'::text),
  'a member sees the invitation, not joined yet');

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_d', 'steps', false);
select tests.authenticate_as('client_d');
select throws_ok(format('select public.join_challenge(%L)', :'ch'), 'P0001', 'share_needed',
  '2.3-12: the metric must be shared with the trainer to join');

select tests.authenticate_as('client_c');
select lives_ok(format($$ select public.join_challenge(%L, true, ' Ракета ') $$, :'ch'), 'client c joins and shows on the board');
select tests.authenticate_as('client_e');
select lives_ok(format('select public.join_challenge(%L)', :'ch'), 'client e joins, the leaderboard off by default');
select is((select show_on_leaderboard from public.challenge_participants where user_id = auth.uid()), false,
  'Q40: the leaderboard is off unless asked for');

select tests.clear_authentication();
insert into public.activity_entries (client_id, local_date, metric, value, source) values
  (tests.user_id('client_c'), :'today', 'steps', 9000, 'manual'),
  (tests.user_id('client_c'), :'today', 'steps', 15000, 'ios_shortcut'),
  (tests.user_id('client_c'), :'today'::date - 1, 'steps', 30000, 'manual'),
  (tests.user_id('client_e'), :'today', 'steps', 12000, 'ios_shortcut'),
  (tests.user_id('client_d'), :'today', 'steps', 50000, 'manual');

-- =========================================================================================================
-- The leaderboard

select tests.authenticate_as('client_c');
select results_eq(format('select place, name, score, is_me from public.challenge_board(%L)', :'ch'),
  $$ values (2, 'Ракета'::text, 9000, true) $$,
  '2.6: a participant sees their own place; one who did not agree to the board is not shown to them');

select tests.authenticate_as('client_e');
select results_eq(format('select place, name, score, is_me, shown from public.challenge_board(%L)', :'ch'),
  $$ values (1, 'client_e'::text, 12000, true, false), (2, 'Ракета'::text, 9000, false, true) $$,
  'a participant sees the shown ones and themselves; the manual steps of a day win, days before the start do not count');

select tests.authenticate_as('trainer_a');
select results_eq(format('select name, alias from public.challenge_board(%L)', :'ch'),
  $$ values ('client_e'::text, null::text), ('client_c', 'Ракета') $$,
  '2.4-18: the trainer sees every participant by name, with the alias');

select tests.authenticate_as('client_d');
select is((select count(*)::int from public.challenge_board(:'ch')), 0, '2.5: a member who did not join reads nothing');
select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.challenge_board(:'ch')), 0, 'a stranger reads nothing');
select is((select count(*)::int from public.challenge_participants), 0, 'a stranger reads no participants');

select tests.authenticate_as('client_e');
select lives_ok(format('select public.set_challenge_leaderboard(%L, true)', :'ch'), 'client e shows on the board later');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.challenge_board(:'ch')), 2, 'now client c sees client e too');
select throws_ok(
  format('insert into public.challenge_participants (challenge_id, coaching_id, user_id, score) values (%L, %L, auth.uid(), 99999)', :'ch', :'pair_c'),
  '42501', null, 'nobody writes participants or scores directly');

-- A participant who stops sharing the metric keeps their last score, marked hidden.
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'steps', false);
update public.activity_entries set value = 20000 where client_id = tests.user_id('client_c') and local_date = :'today' and source = 'manual';
select tests.authenticate_as('trainer_a');
select is((select row(score, hidden) from public.challenge_board(:'ch') where alias = 'Ракета'), row(9000, true),
  'a revoked share freezes the score and hides it');

-- =========================================================================================================
-- Finishing

select tests.authenticate_as('client_e');
select lives_ok(format('select public.leave_challenge(%L)', :'ch'), 'client e leaves');
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.challenge_board(:'ch')), 1, 'and is gone from the board');

select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'steps', true);
update public.challenges set starts_on = :'today'::date - 14, ends_on = :'today'::date - 1 where id = :'ch';
insert into public.activity_entries (client_id, local_date, metric, value, source)
values (tests.user_id('client_c'), :'today'::date - 3, 'steps', 11000, 'manual');
select is(private.finish_challenges(), 1, 'a challenge whose last day is over finishes');
select is((select score from public.challenge_participants where challenge_id = :'ch'), 41000,
  'its score counts the days of the challenge only');
select results_eq(
  $$ select badge_code from public.user_badges where user_id = tests.user_id('client_c') and badge_code like 'challenge%' order by 1 $$,
  $$ values ('challenge_done'), ('challenge_winner') $$,
  '2.3-13: the goal reached and a place in the top three award their badges');
select is((select count(*)::int from public.notification_outbox where type = 'badge' and payload ->> 'badge' like 'challenge%'), 2,
  'each badge queues a bot message');
select is(private.finish_challenges(), 0, 'a finished challenge is not finished again');

select tests.authenticate_as('client_e');
select throws_ok(format('select public.join_challenge(%L)', :'ch'), 'P0001', 'challenge_closed', 'nobody joins a finished challenge');

-- =========================================================================================================
-- Cancelling, and leaving with the pair

select tests.authenticate_as('trainer_a');
select public.create_challenge(:'group_id', 'Дневник', 'diary_days', 1::smallint, :'today') as ch2 \gset
select tests.authenticate_as('client_c');
select public.join_challenge(:'ch2');
select tests.authenticate_as('client_e');
select public.join_challenge(:'ch2');

select tests.authenticate_as('trainer_a');
select ok(public.add_group_member(:'group_id', :'pair_x') is not null, 'client x joins the group');
delete from public.group_members where group_id = :'group_id' and coaching_id = :'pair_e';
select is((select count(*)::int from public.challenge_participants where challenge_id = :'ch2'), 1,
  'a pair removed from the group leaves its challenges');

select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = :'pair_c';
select is((select count(*)::int from public.challenge_participants where challenge_id = :'ch2'), 0,
  'an ended pair leaves the trainer''s running challenges');
select is((select count(*)::int from public.user_badges where user_id = tests.user_id('client_c') and badge_code like 'challenge%'), 2,
  'the badges stay with the client');

select tests.authenticate_as('client_x');
select throws_ok(format('select public.cancel_challenge(%L)', :'ch2'), 'P0001', 'not_allowed', 'a client cannot cancel');
select tests.authenticate_as('trainer_a');
select lives_ok(format('select public.cancel_challenge(%L)', :'ch2'), 'the trainer cancels a challenge');

select * from finish();
rollback;

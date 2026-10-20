-- A trainer's challenge for all of their clients (migration 20261020180241_trainer_wide_challenges.sql, marketing
-- viral item 5): any trainer runs one without groups in the plan, every live pair is invited and can join, other
-- trainers' clients see nothing, and an ended pair loses it.
begin;
\ir _helpers.psql
select plan(19);

select tests.create_trainer('trainer_t');
select tests.create_trainer('trainer_o');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_o');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_t', 'client_c') as pair_c \gset
select tests.create_pair('trainer_t', 'client_d') as pair_d \gset
select tests.create_pair('trainer_o', 'client_o') as pair_o \gset
update public.user_settings set time_zone = 'UTC'
where user_id in (select tests.user_id(h) from unnest(array['trainer_t', 'trainer_o', 'client_c', 'client_d', 'client_o']) h);
select (now() at time zone 'UTC')::date as today \gset

-- =========================================================================================================
-- Creating

select tests.authenticate_as('stranger_s');
select throws_ok(format($$ select public.create_challenge(null, 'Шаги', 'steps', 2::smallint, %L) $$, :'today'),
  '42501', 'not_a_trainer', 'only a trainer runs a challenge for their clients');

select tests.clear_authentication();
select is(private.has_entitlement(tests.user_id('trainer_t'), 'trainer.groups'), false, 'the trainer has no groups in the plan');
select tests.authenticate_as('trainer_t');
select throws_ok(format($$ select public.create_challenge(null, 'Минус пять', 'weight', 4::smallint, %L) $$, :'today'),
  'P0001', 'bad_metric', 'the same metrics as in a group: no weight');
select throws_ok(format($$ select public.create_challenge(null, 'Год шагов', 'steps', 13::smallint, %L) $$, :'today'),
  '22023', 'invalid_challenge', 'the same 1 to 12 weeks');

select public.create_challenge(null, ' 10 тренировок до Нового года ', 'workouts', 4::smallint, :'today', 10, true) as ch \gset
select is((select row(group_id, title, ends_on) from public.challenges where id = :'ch'),
  row(null::uuid, '10 тренировок до Нового года'::text, :'today'::date + 27),
  'a trainer without groups creates a challenge for all clients');

select tests.clear_authentication();
select is(
  (select array_agg(user_id order by user_id) from public.notification_outbox where type = 'challenge'),
  (select array_agg(id order by id) from public.profiles where id in (tests.user_id('client_c'), tests.user_id('client_d'))),
  'every live client of the trainer is invited by the bot, nobody else');

-- =========================================================================================================
-- Seeing and joining

select tests.authenticate_as('client_c');
select is((select count(*)::int from public.challenges where id = :'ch'), 1, 'a client of the trainer reads the challenge');
select is((select row(joined, shared, state) from public.my_challenges() where id = :'ch'), row(false, true, 'active'::text),
  'and sees the invitation, not joined yet');
select lives_ok(format($$ select public.join_challenge(%L, true, 'Ракета') $$, :'ch'), 'client c joins');
select is((select coaching_id from public.challenge_participants where challenge_id = :'ch' and user_id = auth.uid()), :'pair_c'::uuid,
  'through their pair with the trainer');

select tests.authenticate_as('client_o');
select is((select count(*)::int from public.challenges), 0, 'another trainer''s client does not see it');
select is((select count(*)::int from public.my_challenges()), 0, 'nor among their challenges');
select throws_ok(format('select public.join_challenge(%L)', :'ch'), 'P0001', 'not_allowed', 'and cannot join it');

select tests.authenticate_as('stranger_s');
select throws_ok(format('select public.join_challenge(%L)', :'ch'), 'P0001', 'not_allowed', 'nor can a stranger');

select tests.authenticate_as('trainer_t');
select is((select array_agg(name order by name) from public.challenge_board(:'ch')), array['client_c'],
  'the trainer sees the participant on the board');

select tests.authenticate_as('trainer_o');
select throws_ok(format('select public.cancel_challenge(%L)', :'ch'), 'P0001', 'not_allowed', 'another trainer cannot cancel it');

-- =========================================================================================================
-- An ended pair

select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = :'pair_c';
select is((select count(*)::int from public.challenge_participants where challenge_id = :'ch'), 0,
  'an ended pair leaves the challenge');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.my_challenges()), 0, 'and no longer sees it');

select tests.authenticate_as('trainer_t');
select lives_ok(format('select public.cancel_challenge(%L)', :'ch'), 'the trainer cancels it like a group challenge');

select * from finish();
rollback;

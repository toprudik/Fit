-- Story cards of a milestone or a badge (marketing backlog 4), migration 20261021014513_moment_story_cards.sql, and
-- the trainer's name on a client's card only with the trainer's own consent to publish (152-FZ art. 10.1 part 8).
begin;
\ir _helpers.psql
select plan(18);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
update public.profiles set first_name = 'Ира', last_name = 'Тренер' where id = tests.user_id('trainer_a');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
insert into public.milestones (id, coaching_id, kind, achieved_at) values
  ('00000000-0000-4000-8000-00000000a001', tests.pair_id('trainer_a', 'client_c'), 'sessions_10', '2026-09-30 22:30+00');
insert into public.user_badges (user_id, badge_code, awarded_at) values
  (tests.user_id('client_c'), 'sessions_1', '2026-08-02 10:00+00'),
  (tests.user_id('client_c'), 'sessions_10', '2026-09-30 22:30+00');

create table tests.cards (label text, id uuid);
grant insert, select on tests.cards to authenticated;
grant select on tests.cards to anon;

select tests.authenticate_as('client_c');
insert into tests.cards values ('milestone', public.create_moment_card('milestone', '00000000-0000-4000-8000-00000000a001'));
insert into tests.cards values ('badge', public.create_moment_card('badge', 'sessions_10'));
select is(
  (select c.data from public.story_cards c join tests.cards t using (id) where t.label = 'milestone'),
  jsonb_build_object('count', 10, 'name', 'Ира Тренер',
    'slug', (select slug from public.trainer_profiles where user_id = tests.user_id('trainer_a'))),
  'milestone: the count, the trainer''s name and showcase address');
select is(
  (select c.month from public.story_cards c join tests.cards t using (id) where t.label = 'milestone'), '2026-10-01'::date,
  'milestone: the month is the moment''s in the client''s time zone (Moscow by default)');
select is(
  (select c.data from public.story_cards c join tests.cards t using (id) where t.label = 'badge'),
  '{"code": "sessions_10", "count": 2}'::jsonb,
  'badge: the code and how many badges the client holds');
select throws_ok(
  $$ select public.create_moment_card('badge', 'diary_100') $$, 'P0001', 'nothing_to_show', 'badge: only one the client earned');
select throws_ok(
  $$ select public.create_moment_card('milestone', 'not-a-uuid') $$, 'P0001', 'nothing_to_show', 'milestone: a bad id shows nothing');
select throws_ok(
  $$ select public.create_moment_card('weight', 'x') $$, '22023', 'unknown kind', 'an unknown kind is refused');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select throws_ok(
  $$ select public.create_moment_card('milestone', '00000000-0000-4000-8000-00000000a001') $$, 'P0001', 'nothing_to_show',
  'milestone: another client''s milestone shows nothing');
select tests.clear_authentication();

select tests.authenticate_as_anon();
select is(
  public.story_card((select id from tests.cards where label = 'badge')) ->> 'kind', 'badge',
  'the card opens without a session through story_card');
select throws_ok(
  $$ select public.create_moment_card('badge', 'sessions_10') $$, '42501', null, 'anon cannot make a card');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
update public.trainer_profiles set story_card_showcase = false where user_id = tests.user_id('trainer_a');
select tests.clear_authentication();
select tests.authenticate_as('client_c');
insert into tests.cards values ('off', public.create_moment_card('milestone', '00000000-0000-4000-8000-00000000a001'));
select is(
  public.story_card((select id from tests.cards where label = 'off')) -> 'data',
  '{"count": 10}'::jsonb, 'milestone: switched off, neither the name nor the address');

-- The trainer's name needs the trainer's showcase consent, on the milestone card and the monthly trainer card.
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
update public.trainer_profiles set story_card_showcase = true where user_id = tests.user_id('trainer_a');
select tests.clear_authentication();
select tests.create_session('trainer_a', '2026-09-10 07:00+00') as s1 \gset
select tests.create_booking(:'s1', 'trainer_a', 'client_c', 'attended');
select tests.authenticate_as('client_c');
insert into tests.cards values ('named', public.create_moment_card('milestone', '00000000-0000-4000-8000-00000000a001'));
insert into tests.cards values ('month', public.create_story_card('2026-09-01', 'trainer', tests.pair_id('trainer_a', 'client_c')));
select is(
  (select c.trainer_id from public.story_cards c join tests.cards t using (id) where t.label = 'named'), tests.user_id('trainer_a'),
  'a card printing the trainer''s name keeps whose name it is');
select is(
  public.story_card((select id from tests.cards where label = 'month')) #>> '{data,name}', 'Ира Тренер',
  'the monthly trainer card prints the name while the trainer consents');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select public.revoke_public_data_consent('showcase');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select is(public.story_card((select id from tests.cards where label = 'named')), null,
  'the trainer''s revoke closes the client''s milestone card with their name');
select is(public.story_card((select id from tests.cards where label = 'month')), null,
  'and the monthly trainer card with their name');
select isnt(public.story_card((select id from tests.cards where label = 'off')), null,
  'a card without the trainer''s name stays open');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
insert into tests.cards values ('unconsented', public.create_moment_card('milestone', '00000000-0000-4000-8000-00000000a001'));
insert into tests.cards values ('month2', public.create_story_card('2026-09-01', 'trainer', tests.pair_id('trainer_a', 'client_c')));
select is(
  (select c.data from public.story_cards c join tests.cards t using (id) where t.label = 'unconsented'), '{"count": 10}'::jsonb,
  'without the trainer''s consent the milestone card has the count only');
select is(
  (select c.data from public.story_cards c join tests.cards t using (id) where t.label = 'month2'), '{"count": 1}'::jsonb,
  'and the monthly trainer card too');

select public.revoke_public_data_consent('story');
select throws_ok(
  $$ select public.create_moment_card('badge', 'sessions_1') $$, 'P0001', 'consent_required',
  'without the consent to publish story cards no card is made');
select tests.clear_authentication();

select * from finish();
rollback;

-- Withdrawing the consent to story cards closes the cards already shared (152-FZ art. 10.1 part 14), migration
-- 20261021001317_story_cards_close_on_revoke.sql: revoke_public_data_consent expires them, story_card opens a card
-- only while its author's consent is in force.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_user('client_s');
select tests.create_user('client_t');
select tests.authenticate_as('client_s');
select public.give_public_data_consent('story', 'v1');
select tests.authenticate_as('client_t');
select public.give_public_data_consent('story', 'v1');
select tests.clear_authentication();
insert into public.story_cards (id, user_id, month, kind, data) values
  ('00000000-0000-4000-8000-0000000005a1', tests.user_id('client_s'), '2026-09-01', 'sessions', '{"count": 2}'),
  ('00000000-0000-4000-8000-0000000005a2', tests.user_id('client_s'), '2026-08-01', 'sessions', '{"count": 5}'),
  ('00000000-0000-4000-8000-0000000005b1', tests.user_id('client_t'), '2026-09-01', 'sessions', '{"count": 3}');

select tests.authenticate_as_anon();
select isnt(public.story_card('00000000-0000-4000-8000-0000000005a1'), null, 'story: a card opens while the consent is in force');

select tests.authenticate_as('client_s');
select is(public.revoke_public_data_consent('story'), true, 'story: the client withdraws the consent');
select tests.authenticate_as_anon();
select is(public.story_card('00000000-0000-4000-8000-0000000005a1'), null, 'story: the card shared before closes at once');
select is(public.story_card('00000000-0000-4000-8000-0000000005a2'), null, 'story: every card of that person closes');
select isnt(public.story_card('00000000-0000-4000-8000-0000000005b1'), null, 'story: another person''s card stays open');

select tests.authenticate_as('client_s');
select public.give_public_data_consent('story', 'v1');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.story_cards where user_id = tests.user_id('client_s') and expires_at > now()), 0,
  'story: the closed cards stay closed if the consent is given again'
);

-- A card left from before the consents to publish, whose author never consented, does not open.
delete from public.public_data_consents where user_id = tests.user_id('client_t');
select tests.authenticate_as_anon();
select is(public.story_card('00000000-0000-4000-8000-0000000005b1'), null, 'story: a card without its author''s consent does not open');

select * from finish();
rollback;

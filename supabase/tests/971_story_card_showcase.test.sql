-- The trainer's name and showcase QR on a story card (migration 20261017191056_story_card_showcase.sql, PRD
-- wave-3 §4 rule 7): on by default, the address only while the showcase is open, nothing with the switch off.
begin;
\ir _helpers.psql
select plan(7);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
update public.profiles set first_name = 'Ира', last_name = 'Тренер' where id = tests.user_id('trainer_a');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_booking(tests.create_session('trainer_a', '2026-09-10 07:00+00'), 'trainer_a', 'client_c', 'attended');

create function tests.trainer_card() returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_id uuid := public.create_story_card('2026-09-01', 'trainer', tests.pair_id('trainer_a', 'client_c'));
begin
  return (select c.data from public.story_cards c where c.id = v_id);
end $$;
grant execute on function tests.trainer_card() to authenticated;
create table tests.first_card (id uuid);
grant insert, select on tests.first_card to authenticated;

select is(
  (select story_card_showcase from public.trainer_profiles where user_id = tests.user_id('trainer_a')), true,
  'acceptance 24: on by default');

select tests.authenticate_as('client_c');
insert into tests.first_card values (public.create_story_card('2026-09-01', 'trainer', tests.pair_id('trainer_a', 'client_c')));
select is(
  (select c.data from public.story_cards c join tests.first_card f using (id)),
  jsonb_build_object('count', 1, 'name', 'Ира Тренер',
    'slug', (select slug from public.trainer_profiles where user_id = tests.user_id('trainer_a'))),
  '§4-7: the trainer card carries the name and the showcase address');
update public.trainer_profiles set story_card_showcase = false where user_id = tests.user_id('trainer_a');
select is(
  (select story_card_showcase from public.trainer_profiles where user_id = tests.user_id('trainer_a')), true,
  'a client cannot switch it for the trainer');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.clear_authentication();
select tests.authenticate_as('client_c');
select is(tests.trainer_card(), '{"count": 1, "name": "Ира Тренер"}'::jsonb, 'a closed showcase gives no address');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ update public.trainer_profiles set is_public = true, story_card_showcase = false where user_id = tests.user_id('trainer_a') $$,
  'the trainer switches it off');
select tests.clear_authentication();
select tests.authenticate_as('client_c');
select is(tests.trainer_card(), '{"count": 1}'::jsonb, 'switched off: neither the name nor the address');
select is(
  (public.story_card((select id from tests.first_card)) -> 'data') ? 'slug', true,
  'a card made earlier keeps what it froze');
select tests.clear_authentication();

select * from finish();
rollback;

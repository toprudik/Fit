-- Homework for delegates (migration 20261017125130_homework_delegates.sql, PRD wave-3 §1): an assistant with the
-- 'homework' scope gives homework with the owner's exercises and archives it; without the scope, or as another
-- trainer, save and archive answer not_found.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_trainer('owner_a');
select tests.create_trainer('helper_h');
select tests.create_trainer('helper_n');
select tests.create_trainer('other_o');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id in (tests.user_id('owner_a'), tests.user_id('helper_h'), tests.user_id('helper_n'));
update public.user_settings set time_zone = 'UTC' where user_id = tests.user_id('client_c');

insert into public.exercises (id, source, owner_id, name)
values ('7a1e0000-0000-4000-8000-000000000001', 'custom', tests.user_id('owner_a'), 'Owner sled'),
       ('7a1e0000-0000-4000-8000-000000000002', 'custom', tests.user_id('other_o'), 'Other sled');

select tests.pair_id('owner_a', 'client_c') as pair, (now() at time zone 'UTC')::date as today \gset

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;

select tests.authenticate_as('owner_a');
insert into tests.tokens select 'h', token from public.create_delegation('assistant', null, '{homework}', true);
insert into tests.tokens select 'n', token from public.create_delegation('assistant', null, '{workouts}', true);
select tests.authenticate_as('helper_h');
select public.accept_delegation((select token from tests.tokens where name = 'h'));
select tests.authenticate_as('helper_n');
select public.accept_delegation((select token from tests.tokens where name = 'n'));

-- An assistant with homework gives it, with the owner's exercise.
select tests.authenticate_as('helper_h');
select lives_ok(
  format('select public.save_homework(%L)', jsonb_build_object(
    'coaching_id', :'pair', 'title', 'Plank', 'due_date', :'today',
    'exercises', jsonb_build_array(jsonb_build_object('exercise_id', '7a1e0000-0000-4000-8000-000000000001')))),
  'an assistant with homework gives homework with the owner''s exercise'
);
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object(
    'coaching_id', :'pair', 'title', 'Sled', 'due_date', :'today',
    'exercises', jsonb_build_array(jsonb_build_object('exercise_id', '7a1e0000-0000-4000-8000-000000000002')))),
  'P0001', 'bad_exercise', 'but not another trainer''s exercise'
);
select tests.clear_authentication();
select id as hw from public.homework where title = 'Plank' \gset
select is((select count(*)::int from public.homework_exercises where homework_id = :'hw'), 1, 'the exercise is saved');

-- Without the scope, or as another trainer: not_found.
select tests.authenticate_as('helper_n');
select throws_ok(
  format('select public.save_homework(%L)', jsonb_build_object('coaching_id', :'pair', 'title', 'x', 'due_date', :'today')),
  'P0002', 'not_found', 'an assistant without homework cannot give it'
);
select throws_ok(format('select public.archive_homework(%L)', :'hw'), 'P0002', 'not_found',
  'nor archive it');
select tests.authenticate_as('other_o');
select throws_ok(format('select public.archive_homework(%L)', :'hw'), 'P0002', 'not_found',
  'another trainer cannot archive it');

-- The assistant with homework archives it.
select tests.authenticate_as('helper_h');
select lives_ok(format('select public.archive_homework(%L)', :'hw'), 'the assistant with homework archives it');
select tests.clear_authentication();
select isnt((select archived_at from public.homework where id = :'hw'), null, 'the homework is archived');

select * from finish();
rollback;

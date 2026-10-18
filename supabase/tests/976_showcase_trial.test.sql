-- "Записаться на пробное" on the showcase, migration 20261018063517_showcase_trial.sql (PRD wave-1 §2.3 rules 1
-- and 6): trial_links.on_showcase and get_showcase_trial.
begin;
\ir _helpers.psql
select plan(11);

select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_trainer('trainer_b', 'boris');
select tests.create_user('client_c');
select tests.create_user('client_d');

insert into public.trial_links (id, trainer_id, title, currency, token)
values
  ('00000000-0000-4000-8000-000000000a01', tests.user_id('trainer_a'), 'Первое занятие', 'RUB', 'AAAAAAAAAAAAAAAAAAAAA1'),
  ('00000000-0000-4000-8000-000000000a02', tests.user_id('trainer_a'), 'Онлайн-знакомство', 'RUB', 'AAAAAAAAAAAAAAAAAAAAA2'),
  ('00000000-0000-4000-8000-000000000b01', tests.user_id('trainer_b'), 'Пробное', 'RUB', 'BBBBBBBBBBBBBBBBBBBBB1');

select tests.authenticate_as_anon();
select is(public.get_showcase_trial('anna-fit'), null, 'showcase trial: no button until the trainer picks a link');

-- The trainer puts a link on the showcase with their own client.
select tests.authenticate_as('trainer_a');
update public.trial_links set on_showcase = true where id = '00000000-0000-4000-8000-000000000a01';
select is(
  (select on_showcase from public.trial_links where id = '00000000-0000-4000-8000-000000000a01'), true,
  'showcase trial: the trainer marks their own link'
);
select throws_ok(
  $$ update public.trial_links set on_showcase = true where id = '00000000-0000-4000-8000-000000000a02' $$,
  '23505', null, 'showcase trial: only one live link is on the showcase'
);
select is(public.get_showcase_trial('anna-fit'), null, 'showcase trial: the trainer sees no button on their own showcase');

select tests.authenticate_as('trainer_b');
update public.trial_links set on_showcase = true where id = '00000000-0000-4000-8000-000000000a01';
select tests.clear_authentication();
select is(
  (select on_showcase from public.trial_links where id = '00000000-0000-4000-8000-000000000a01'), true,
  'showcase trial: another trainer cannot touch the link (RLS)'
);

select tests.authenticate_as_anon();
select is(public.get_showcase_trial('ANNA-FIT'), 'AAAAAAAAAAAAAAAAAAAAA1', 'showcase trial: a visitor gets the link token');
select is(public.get_showcase_trial('boris'), null, 'showcase trial: another trainer''s link stays off their showcase');

select tests.authenticate_as('client_c');
select is(public.get_showcase_trial('anna-fit'), 'AAAAAAAAAAAAAAAAAAAAA1', 'showcase trial: a signed-in newcomer gets it too');

select tests.clear_authentication();
select tests.create_pair('trainer_a', 'client_d');
select tests.authenticate_as('client_d');
select is(public.get_showcase_trial('anna-fit'), null, 'showcase trial: a live client gets no trial (one per pair)');

select tests.clear_authentication();
update public.trial_links set is_enabled = false where id = '00000000-0000-4000-8000-000000000a01';
select tests.authenticate_as_anon();
select is(public.get_showcase_trial('anna-fit'), null, 'showcase trial: a switched-off link shows no button');

select tests.clear_authentication();
update public.trial_links set is_enabled = true where id = '00000000-0000-4000-8000-000000000a01';
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is(public.get_showcase_trial('anna-fit'), null, 'showcase trial: a closed showcase shows no button');

select * from finish();
rollback;

-- Ending passes in the admin analytics of migration 20261017222540_admin_ending_passes.sql (plan §8.3): the
-- trainers slice counts passes by the §7 rule, 2 sessions or fewer or 7 days or fewer, only for live pairs.
begin;
\ir _helpers.psql
select plan(3);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_user(c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f']) c;
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f']) c;

-- c: 2 sessions left, no expiry (ending); d: 10 sessions, expires in 5 days (ending);
-- e: 10 sessions, expires in 10 days (not ending by §7, the old 14-day rule counted it);
-- f: 1 session left, but the pair has ended (not counted).
select tests.create_pass('trainer_a', 'client_c', 2);
select tests.create_pass('trainer_a', 'client_d', 10, 0, 'RUB', now() + interval '5 days');
select tests.create_pass('trainer_a', 'client_e', 10, 0, 'RUB', now() + interval '10 days');
select tests.create_pass('trainer_a', 'client_f', 1);
update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_a', 'client_f');

select count(*)::integer as own_count from private.trainer_ending_passes(tests.user_id('trainer_a')) \gset
select tests.authenticate_as('admin_x');
select is((select t.ending_passes from public.admin_analytics_trainers(30) t where t.trainer_id = tests.user_id('trainer_a')), 2,
  'trainers: 2 sessions or 7 days left, live pairs only');
select is((select t.ending_passes from public.admin_analytics_trainer(tests.user_id('trainer_a'), 30) t), 2,
  'trainer: the same count on the trainer''s card');
select is(
  (select t.ending_passes from public.admin_analytics_trainers(30) t where t.trainer_id = tests.user_id('trainer_a')),
  :own_count,
  'the admin count matches the trainer''s own analytics');

select * from finish();
rollback;

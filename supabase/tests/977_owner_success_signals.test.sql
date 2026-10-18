-- Wave-3 success signals of migration 20261018062147_owner_success_signals.sql: only admins call it, a client
-- counts with a weekly streak of one week or more, cards and ended pairs stay out, and a trainer counts with a
-- live offer now or with any offer ever.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_c');
select tests.create_user('client_s');
select tests.create_user('client_n');
select tests.create_user('client_e');
select tests.create_pair('trainer_a', 'client_s');
select tests.create_pair('trainer_a', 'client_n');
select tests.create_pair('trainer_b', 'client_e', 'ended');
select tests.create_card('trainer_a', 'client_card');

-- Client s met the goal of 2 last week (the current week is still open and never breaks a streak); client n
-- logged one workout last week only; client e has a streak too, but no live pair.
create function tests.log_last_week(p_handle text, p_day smallint) returns void language sql as $$
  insert into public.workout_logs (client_id, performed_at, local_date)
  select tests.user_id(p_handle), d + time '10:00', d
  from (select private.user_today(tests.user_id(p_handle))
               - (extract(isodow from private.user_today(tests.user_id(p_handle)))::integer - 1) - 7 + p_day as d) w
$$;
select tests.log_last_week('client_s', 0::smallint);
select tests.log_last_week('client_s', 2::smallint);
select tests.log_last_week('client_n', 1::smallint);
select tests.log_last_week('client_e', 0::smallint);
select tests.log_last_week('client_e', 3::smallint);

-- Trainer a runs an offer; trainer b stopped theirs; trainer c never made one.
insert into public.referral_offers (trainer_id, referrer_sessions) values (tests.user_id('trainer_a'), 1);
insert into public.referral_offers (trainer_id, referrer_sessions, archived_at)
values (tests.user_id('trainer_b'), 2, now() - interval '1 day');

-- =========================================================================================================

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_owner_success() $$, '42501', null, 'a trainer is refused');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_owner_success() $$, '42501', null, 'anon cannot call it');

select tests.authenticate_as('admin_x');
select is((select clients from public.admin_owner_success()), 2, 'clients: accounts with a live pair, no card');
select is((select clients_with_streak from public.admin_owner_success()), 1,
  'a client with the weekly goal met last week has a streak, one workout is not enough');
select is((select trainers from public.admin_owner_success()), 3, 'trainers: every trainer');
select is((select trainers_offer_live from public.admin_owner_success()), 1, 'a live offer counts now');
select is((select trainers_offer_ever from public.admin_owner_success()), 2, 'a stopped offer still counts as ever');

-- An offer past its last day is not live.
select tests.clear_authentication();
update public.referral_offers set active_to = current_date - 2 where trainer_id = tests.user_id('trainer_a');
select tests.authenticate_as('admin_x');
select is((select trainers_offer_live from public.admin_owner_success()), 0, 'an offer past its last day is not live');

select * from finish();
rollback;

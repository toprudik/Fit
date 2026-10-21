-- Season challenges of migration 20261021003117_season_challenges.sql (marketing 12): the admin starts one for a
-- month, clients join by choice, and after the month the ones who came at least once and missed nothing get the
-- "season_done" badge.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_admin('admin_a');
select tests.create_trainer('trainer_a');
select tests.create_user('client_ok');
select tests.create_user('client_miss');
select tests.create_user('client_none');
select tests.create_user('client_out');
select tests.create_pair('trainer_a', c) from unnest(array['client_ok', 'client_miss', 'client_none', 'client_out']) c;
select date_trunc('month', private.user_today(tests.user_id('admin_a')))::date as this_month \gset

-- =========================================================================================================
-- Starting

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.admin_create_season_challenge('Январь без пропусков', date_trunc('month', now())::date) $$,
  '42501', 'forbidden', 'start: only an admin starts one');
select throws_ok($$ select * from public.admin_season_challenges() $$, '42501', 'forbidden', 'list: only an admin lists them');

select tests.authenticate_as('admin_a');
select throws_ok(format($$ select public.admin_create_season_challenge('Ок', %L) $$, :'this_month'),
  '22023', 'invalid_title', 'start: the title is at least 3 characters');
select throws_ok(format($$ select public.admin_create_season_challenge('Месяц без пропусков', %L) $$, (:'this_month'::date + 3)),
  '22023', 'invalid_month', 'start: the month is given by its first day');
select throws_ok(format($$ select public.admin_create_season_challenge('Месяц без пропусков', %L) $$, (:'this_month'::date - interval '1 month')::date),
  '22023', 'invalid_month', 'start: not a month that is over');
select public.admin_create_season_challenge(' Месяц без пропусков ', :'this_month') as ch \gset
select throws_ok(format($$ select public.admin_create_season_challenge('Ещё один', %L) $$, :'this_month'),
  'P0001', 'month_taken', 'start: one challenge a month');
select is((select action from public.admin_audit_log where target_id = :'ch'::uuid), 'season_challenge.create', 'start: audited');

-- =========================================================================================================
-- Joining

select tests.authenticate_as('client_ok');
select results_eq($$ select title, joined, finished from public.my_season_challenge() $$,
  $$ values ('Месяц без пропусков'::text, false, false) $$, 'client: sees the challenge, not joined yet');
select lives_ok(format($$ select public.set_season_challenge_joined(%L, true) $$, :'ch'), 'client: joins');
select tests.authenticate_as('client_miss');
select public.set_season_challenge_joined(:'ch', true);
select tests.authenticate_as('client_none');
select public.set_season_challenge_joined(:'ch', true);
select tests.authenticate_as('client_out');
select public.set_season_challenge_joined(:'ch', true);
select lives_ok(format($$ select public.set_season_challenge_joined(%L, false) $$, :'ch'), 'client: leaves again');
select is((select count(*)::int from public.season_challenge_participants), 0, 'read: a client sees only own participation');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.season_challenge_participants $$, '42501', null, 'read: anon has no access');

-- =========================================================================================================
-- The month is over: moved two months back, with sessions in it

select tests.clear_authentication();
update public.season_challenges set month = (:'this_month'::date - interval '2 months')::date where id = :'ch';
create function pg_temp.visit(p_client text, p_day integer, p_status public.booking_status) returns void language plpgsql as $$
declare
  v_booking uuid := tests.create_booking(
    tests.create_session('trainer_a', ((date_trunc('month', now()) - interval '2 months')::date + p_day)::timestamp at time zone 'Europe/Moscow' + interval '10 hours'),
    'trainer_a', p_client, 'confirmed');
begin
  update public.bookings set status = p_status,
    cancelled_at = case when p_status in ('cancelled', 'late_cancelled') then now() end,
    cancelled_by_role = case when p_status in ('cancelled', 'late_cancelled') then 'client'::public.actor_role end,
    attendance_marked_at = case when p_status in ('attended', 'no_show') then now() end
  where id = v_booking;
end $$;
select pg_temp.visit('client_ok', 2, 'attended');
select pg_temp.visit('client_ok', 9, 'attended');
select pg_temp.visit('client_ok', 12, 'cancelled');
select pg_temp.visit('client_miss', 3, 'attended');
select pg_temp.visit('client_miss', 10, 'late_cancelled');

select tests.authenticate_as('client_ok');
select results_eq($$ select attended, missed from public.my_season_challenge() $$, $$ values (2, 0) $$,
  'client: attendance counts the month''s sessions, an early cancellation is not a miss');
select tests.authenticate_as('client_ok');
select throws_ok(format($$ select public.set_season_challenge_joined(%L, false) $$, :'ch'),
  'P0001', 'challenge_closed', 'client: no leaving after the month');

select tests.clear_authentication();
select is(private.finish_season_challenges(), 1, 'finish: the challenge finishes');
select results_eq(
  $$ select (select u.handle from tests.users u where u.id = user_id), result from public.season_challenge_participants order by 1 $$,
  $$ values ('client_miss'::text, 'missed'::text), ('client_none', 'missed'), ('client_ok', 'done') $$,
  'finish: done only with a visit and no miss');
select results_eq(
  $$ select (select u.handle from tests.users u where u.id = user_id) from public.user_badges where badge_code = 'season_done' $$,
  $$ values ('client_ok'::text) $$, 'finish: the badge goes to who made it');
select is((select count(*)::int from public.notification_outbox where type = 'badge' and payload ->> 'badge' = 'season_done'), 1,
  'finish: with one badge message');

select tests.authenticate_as('admin_a');
select results_eq($$ select participants, done from public.admin_season_challenges() $$, $$ values (3, 1) $$,
  'list: the admin sees how many joined and made it');

-- =========================================================================================================
-- Cancelling

select public.admin_create_season_challenge('Следующий месяц', (:'this_month'::date + interval '1 month')::date) as next \gset
select tests.authenticate_as('trainer_a');
select throws_ok(format($$ select public.admin_cancel_season_challenge(%L) $$, :'next'),
  '42501', 'forbidden', 'cancel: only an admin cancels');
select tests.authenticate_as('admin_a');
select lives_ok(format($$ select public.admin_cancel_season_challenge(%L) $$, :'next'), 'cancel: the admin cancels');
select throws_ok(format($$ select public.admin_cancel_season_challenge(%L) $$, :'next'),
  'P0001', 'already_cancelled', 'cancel: a second time says it is cancelled already');
select is((select count(*)::int from public.admin_audit_log where target_id = :'next'::uuid and action = 'season_challenge.cancel'), 1,
  'cancel: audited once');
select throws_ok(format($$ select public.admin_cancel_season_challenge(%L) $$, :'ch'),
  'P0001', 'challenge_not_found', 'cancel: not a finished one');

select * from finish();
rollback;

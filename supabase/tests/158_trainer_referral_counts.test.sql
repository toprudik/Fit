-- How many invited trainers are active, migration 20261018135217_trainer_referral_counts.sql (marketing backlog 6):
-- 3+ held sessions in the last 7 days, the flag in my_trainer_referral and the admin list of trainers who invite.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('newbie_n');
select tests.create_user('newbie_m');
select tests.create_user('client_c');
update public.profiles set first_name = 'Ника' where id = tests.user_id('newbie_n');
update public.profiles set first_name = 'Марк' where id = tests.user_id('newbie_m');

create table tests.codes (name text primary key, code text not null);
grant select, insert on tests.codes to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.codes select 'a', code from public.my_trainer_referral();
select tests.authenticate_as('newbie_n');
select public.redeem_trainer_invite((select code from tests.codes where name = 'a'));
select tests.authenticate_as('newbie_m');
select public.redeem_trainer_invite((select code from tests.codes where name = 'a'));
select tests.clear_authentication();

-- Ника held three sessions this week, Марк two this week and one ten days ago.
select tests.create_pair('newbie_n', 'client_c');
select tests.create_pair('newbie_m', 'client_c');
select tests.create_booking(tests.create_session('newbie_n', now() - interval '1 day'), 'newbie_n', 'client_c', 'attended');
select tests.create_booking(tests.create_session('newbie_n', now() - interval '2 days'), 'newbie_n', 'client_c', 'attended');
select tests.create_booking(tests.create_session('newbie_n', now() - interval '3 days'), 'newbie_n', 'client_c', 'confirmed');
select tests.create_booking(tests.create_session('newbie_m', now() - interval '1 day'), 'newbie_m', 'client_c', 'attended');
select tests.create_booking(tests.create_session('newbie_m', now() - interval '2 days'), 'newbie_m', 'client_c', 'attended');
select tests.create_booking(tests.create_session('newbie_m', now() - interval '10 days'), 'newbie_m', 'client_c', 'attended');
-- A cancelled session and one still ahead are not held.
select tests.create_booking(tests.create_session('newbie_m', now() + interval '1 day'), 'newbie_m', 'client_c', 'confirmed');
update public.sessions set status = 'cancelled'
where id = tests.create_session('newbie_m', now() - interval '4 days');

select ok(private.trainer_is_active(tests.user_id('newbie_n')), 'active: three held sessions in 7 days');
select ok(not private.trainer_is_active(tests.user_id('newbie_m')), 'active: two this week and one older are not enough');

select tests.authenticate_as('trainer_a');
select is((select pg_catalog.jsonb_agg(e order by e) from public.my_trainer_referral(),
                  pg_catalog.jsonb_array_elements(trainers) as x(item),
                  pg_catalog.jsonb_build_object('name', item->>'first_name', 'active', item->'active') as y(e)),
          '[{"name": "Марк", "active": false}, {"name": "Ника", "active": true}]'::jsonb,
          'my_trainer_referral: each invited trainer says whether they are active');
select tests.clear_authentication();

-- =========================================================================================================
-- admin_trainer_referrers

select tests.authenticate_as('trainer_a');
select throws_ok($$ select * from public.admin_trainer_referrers() $$, '42501', null, 'admin list: a trainer gets none');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_trainer_referrers() $$, '42501', null, 'admin list: anon cannot call it');

select tests.authenticate_as('admin_x');
select is((select count(*)::integer from public.admin_trainer_referrers()), 1, 'admin list: only trainers who invited someone');
select is((select invited || ':' || active || ':' || bonuses_pending || ':' || bonuses_granted
           from public.admin_trainer_referrers() where trainer_id = tests.user_id('trainer_a')),
          '2:1:2:0', 'admin list: two came, one is active, two bonuses wait');
select tests.clear_authentication();

-- A void referral stays in "came" but is never active, and its bonus no longer waits.
update public.referrals set status = 'void', voided_at = now(), void_reason = 'verification_rejected'
where referee_id = tests.user_id('newbie_n');
update public.bonuses set status = 'void', voided_at = now()
where referral_id = (select id from public.referrals where referee_id = tests.user_id('newbie_n'));

select tests.authenticate_as('admin_x');
select is((select invited || ':' || active || ':' || bonuses_pending
           from public.admin_trainer_referrers() where trainer_id = tests.user_id('trainer_a')),
          '2:0:1', 'admin list: a void referral is not active and its bonus does not wait');
select ok(not exists (select 1 from public.admin_trainer_referrers() where trainer_id = tests.user_id('trainer_b')),
          'admin list: a trainer who invited nobody is not listed');
select tests.clear_authentication();

select * from finish();
rollback;

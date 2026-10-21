-- The "Друг по приглашению" badge of migration 20261020173917_referral_friend_badge.sql (marketing 15): the referrer gets
-- it when a friend's referral becomes qualified, once, and loses it when the only qualified referral is voided.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_trainer('trainer_a');
select tests.create_user('client_a');
select tests.create_user('friend_1');
select tests.create_user('friend_2');
select tests.create_pair('trainer_a', 'client_a');
select tests.create_pair('trainer_a', 'friend_1');
select tests.create_pair('trainer_a', 'friend_2');

insert into public.referrals (trainer_id, referrer_id, referee_id, coaching_id, referrer_coaching_id)
select tests.user_id('trainer_a'), tests.user_id('client_a'), tests.user_id(f), tests.pair_id('trainer_a', f),
       tests.pair_id('trainer_a', 'client_a')
from unnest(array['friend_1', 'friend_2']) f;

create function pg_temp.has_badge() returns boolean language sql as $$
  select exists (select 1 from public.user_badges u where u.user_id = tests.user_id('client_a') and u.badge_code = 'referral_friend')
$$;
create function pg_temp.qualify(p_friend text) returns void language sql as $$
  update public.referrals set status = 'qualified', qualified_at = now() where referee_id = tests.user_id(p_friend)
$$;
create function pg_temp.void(p_friend text) returns void language sql as $$
  update public.referrals set status = 'void', voided_at = now(), void_reason = 'payment_voided' where referee_id = tests.user_id(p_friend)
$$;

select ok(not pg_temp.has_badge(), 'a friend who joined but has not paid gives no badge');
select pg_temp.qualify('friend_1');
select ok(pg_temp.has_badge(), 'the friend''s first counting payment gives the referrer the badge');
select is(
  (select count(*)::int from public.notification_outbox o
   where o.user_id = tests.user_id('client_a') and o.type = 'badge' and o.payload ->> 'badge' = 'referral_friend'),
  1, 'and queues one badge message');
select ok(
  not exists (select 1 from public.user_badges u where u.user_id = tests.user_id('friend_1') and u.badge_code = 'referral_friend'),
  'the friend gets nothing');

select pg_temp.qualify('friend_2');
select is(
  (select count(*)::int from public.notification_outbox o
   where o.user_id = tests.user_id('client_a') and o.payload ->> 'badge' = 'referral_friend'),
  1, 'a second friend sends no second message');
select pg_temp.void('friend_1');
select ok(pg_temp.has_badge(), 'a voided payment keeps the badge while another friend still counts');
select pg_temp.void('friend_2');
select ok(not pg_temp.has_badge(), 'the badge goes when no referral counts any more');

select is(
  (select family from public.badges where code = 'referral_friend'), 'referral', 'the badge is in the catalogue');

select * from finish();
rollback;

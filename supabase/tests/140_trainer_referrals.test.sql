-- Trainers bring trainers, migration 20261017081730_trainer_referrals.sql (PRD wave-3 §3.2): the trainer's code,
-- a person becoming a trainer by it with a pending bonus for the referrer, the admin's bonus size, and a rejected
-- verification voiding the referral.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_user('newbie_n');
select tests.create_user('newbie_m');
select tests.create_user('client_c');
update public.profiles set first_name = 'Ника' where id = tests.user_id('newbie_n');

create table tests.codes (name text primary key, code text not null);
grant select, insert on tests.codes to authenticated;
create function tests.code(p_name text) returns text language sql stable set search_path = '' as $$
  select code from tests.codes where name = p_name
$$;

-- =========================================================================================================
-- my_trainer_referral

select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.my_trainer_referral() $$, '42501', null, 'code: a non-trainer gets none');
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.my_trainer_referral() $$, '42501', null, 'code: anon cannot call it');

select tests.authenticate_as('trainer_a');
insert into tests.codes select 'a', code from public.my_trainer_referral();
select matches(tests.code('a'), '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$', 'code: 12 characters of the invite alphabet');
select is((select code from public.my_trainer_referral()), tests.code('a'), 'code: the same code on the next call');
select is((select trainers from public.my_trainer_referral()), '[]'::jsonb, 'code: nobody invited yet');
select tests.clear_authentication();

-- =========================================================================================================
-- trainer_invite_status and redeem_trainer_invite with a referral code

select tests.authenticate_as('newbie_n');
select is(public.trainer_invite_status(lower(tests.code('a'))), 'referral', 'status: a referral code in any case');
select is(public.trainer_invite_status('NOPE-NOPE-NOPE'), 'invalid', 'status: an unknown code stays invalid');
select lives_ok($$ select public.redeem_trainer_invite(tests.code('a')) $$, 'redeem: a person becomes a trainer by the code');
select tests.clear_authentication();

select ok(exists (select 1 from public.trainer_profiles t where t.user_id = tests.user_id('newbie_n')
                  and t.trainer_invite_id is null and t.verification_status = 'not_submitted'),
          'redeem: a trainer profile without an invite');
select is((select s.last_zone::text from public.user_settings s where s.user_id = tests.user_id('newbie_n')), 'trainer',
          'redeem: the trainer zone opens');
select ok(not exists (select 1 from public.plan_grants s where s.user_id = tests.user_id('newbie_n')),
          'redeem: no Pro, the new trainer is on Free');
select is((select r.status::text from public.referrals r where r.kind = 'trainer_to_trainer'
           and r.referee_id = tests.user_id('newbie_n') and r.referrer_id = tests.user_id('trainer_a')
           and r.trainer_id is null and r.coaching_id is null), 'pending', 'redeem: a pending trainer referral');
select is((select b.kind::text || ':' || b.status::text from public.bonuses b join public.referrals r on r.id = b.referral_id
           where r.referee_id = tests.user_id('newbie_n') and b.beneficiary_id = tests.user_id('trainer_a')),
          'plan_month:pending', 'redeem: the referrer has a pending month of Pro');

select tests.authenticate_as('newbie_n');
select throws_ok($$ select public.redeem_trainer_invite(tests.code('a')) $$, 'P0001', 'already_trainer',
                 'redeem: a trainer cannot use it again');
select tests.clear_authentication();

-- =========================================================================================================
-- admin_set_trainer_referral_bonus and trainer_referral_terms

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', 20::smallint) $$, '42501', null,
                 'terms: a trainer cannot set the bonus');
select is((select bonus_kind::text from public.trainer_referral_terms()), 'plan_month', 'terms: a trainer reads the bonus');
select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.trainer_referral_terms()), 0, 'terms: a non-trainer reads nothing');

select tests.authenticate_as('admin_x');
select throws_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', null) $$, '22023', null,
                 'terms: a discount needs a percent');
select throws_ok($$ select public.admin_set_trainer_referral_bonus('sessions', null) $$, '22023', null,
                 'terms: sessions are not a trainer bonus');
select lives_ok($$ select public.admin_set_trainer_referral_bonus('plan_discount', 30::smallint) $$, 'terms: an admin sets a 30% discount');
select tests.clear_authentication();
select ok(exists (select 1 from public.admin_audit_log l where l.action = 'trainer_referral.set_bonus'
                  and l.actor_id = tests.user_id('admin_x')), 'terms: the change is audited');

select tests.authenticate_as('newbie_m');
select public.redeem_trainer_invite(tests.code('a'));
select tests.clear_authentication();
select is((select b.kind::text || ':' || b.discount_percent from public.bonuses b join public.referrals r on r.id = b.referral_id
           where r.referee_id = tests.user_id('newbie_m')), 'plan_discount:30', 'terms: new referrals get the new bonus');

-- =========================================================================================================
-- A rejected verification voids the referral; the trainer sees both

insert into public.trainer_verifications (trainer_id, decision) values (tests.user_id('newbie_n'), 'pending');
update public.trainer_profiles set verification_status = 'pending' where user_id = tests.user_id('newbie_n');
select tests.authenticate_as('admin_x');
select public.admin_decide_verification(tests.user_id('newbie_n'), 'rejected', 'Сертификат не читается');
select tests.clear_authentication();
select is((select r.status::text || ':' || r.void_reason::text || ':' || b.status::text
           from public.referrals r join public.bonuses b on b.referral_id = r.id
           where r.referee_id = tests.user_id('newbie_n')), 'void:verification_rejected:void',
          'reject: the referral and its bonus are void');

select tests.authenticate_as('trainer_a');
select is((select pg_catalog.jsonb_agg(e order by e) from public.my_trainer_referral(),
                  pg_catalog.jsonb_array_elements(trainers) as x(item), pg_catalog.jsonb_build_object(
                    'name', item->>'first_name', 'status', item->>'status', 'bonus', item->>'bonus_status') as y(e)),
          '[{"name": "newbie_m", "bonus": "pending", "status": "pending"}, {"name": "Ника", "bonus": "void", "status": "void"}]'::jsonb,
          'list: both invited trainers with their status and the bonus');
select tests.clear_authentication();

select * from finish();
rollback;

-- Trainer referral bonuses in the beta (20261020140317_referral_bonus_beta.sql, marketing backlog 7): an invited
-- trainer's active weeks in a row, the admin list and giving a due bonus as a month of Pro from a chosen day.
begin;
\ir _helpers.psql
select plan(22);

select tests.create_admin('admin_m');
select tests.create_trainer(t) from unnest(array['inviter_a', 'busy_b', 'patchy_c', 'void_d', 'discount_e']) t;
select tests.create_user(c) from unnest(array['client_b', 'client_c', 'client_d']) c;
select tests.create_pair('busy_b', 'client_b');
select tests.create_pair('patchy_c', 'client_c');
select tests.create_pair('void_d', 'client_d');

-- a invited b, c and d five weeks and a day ago, e an hour ago.
insert into public.referrals (kind, referrer_id, referee_id, status, created_at, voided_at, void_reason)
values
  ('trainer_to_trainer', tests.user_id('inviter_a'), tests.user_id('busy_b'), 'pending', now() - interval '36 days', null, null),
  ('trainer_to_trainer', tests.user_id('inviter_a'), tests.user_id('patchy_c'), 'pending', now() - interval '36 days', null, null),
  ('trainer_to_trainer', tests.user_id('inviter_a'), tests.user_id('void_d'), 'void', now() - interval '36 days', now(),
   'verification_rejected'),
  ('trainer_to_trainer', tests.user_id('inviter_a'), tests.user_id('discount_e'), 'pending', now() - interval '1 hour', null, null);
insert into public.bonuses (referral_id, beneficiary_id, kind, discount_percent, status, voided_at)
select r.id, r.referrer_id,
       case when r.referee_id = tests.user_id('discount_e') then 'plan_discount' else 'plan_month' end::public.bonus_kind,
       case when r.referee_id = tests.user_id('discount_e') then 20 end,
       case when r.status = 'void' then 'void' else 'pending' end::public.bonus_status,
       case when r.status = 'void' then now() end
from public.referrals r where r.kind = 'trainer_to_trainer';
-- d's bonus is pending in the list below on purpose: a void referral keeps a bonus that is not due.
update public.bonuses set status = 'pending', voided_at = null
where referral_id = (select id from public.referrals where referee_id = tests.user_id('void_d'));

create function tests.bonus(p_referee text) returns uuid language sql stable security definer set search_path = '' as $$
  select b.id from public.bonuses b join public.referrals r on r.id = b.referral_id
  where r.referee_id = tests.user_id(p_referee)
$$;

-- Three held sessions on days 0, 1 and 2 of the given weeks after the invitation.
create function tests.hold(p_trainer text, p_client text, p_weeks integer[]) returns void language plpgsql set search_path = '' as $$
declare
  v_week integer;
  v_day integer;
begin
  foreach v_week in array p_weeks loop
    for v_day in 0..2 loop
      perform tests.create_booking(
        tests.create_session(p_trainer, now() - interval '36 days' + make_interval(days => v_week * 7 + v_day, hours => 2)),
        p_trainer, p_client, 'attended');
    end loop;
  end loop;
end $$;
select tests.hold('busy_b', 'client_b', array[0, 1, 2, 3]);
select tests.hold('patchy_c', 'client_c', array[0, 1, 3, 4]);
select tests.hold('void_d', 'client_d', array[0, 1, 2, 3, 4]);
-- Two sessions in b's fifth week do not make it a fifth active week, and a cancelled one is not held.
select tests.create_booking(tests.create_session('busy_b', now() - interval '36 days' + interval '28 days 3 hours'), 'busy_b', 'client_b', 'attended');
select tests.create_booking(tests.create_session('busy_b', now() - interval '36 days' + interval '29 days 3 hours'), 'busy_b', 'client_b', 'attended');
select tests.create_booking(tests.create_session('busy_b', now() - interval '36 days' + interval '30 days 3 hours'), 'busy_b', 'client_b') as cancelled \gset
update public.sessions set status = 'cancelled', cancelled_at = now()
where id = (select session_id from public.bookings where id = :'cancelled');

-- Active weeks ----------------------------------------------------------------------------------------------------

select is(private.trainer_active_weeks(tests.user_id('busy_b'), now() - interval '36 days'), 4, 'b: four weeks in a row');
select is(private.trainer_active_weeks(tests.user_id('patchy_c'), now() - interval '36 days'), 2,
  'c: a quiet week breaks the run, so two');
select is(private.trainer_active_weeks(tests.user_id('inviter_a'), now() - interval '36 days'), 0, 'a held nothing');
select is(private.trainer_active_weeks(tests.user_id('busy_b'), now() - interval '1 hour'), 0,
  'no whole week has passed since an hour ago');

-- The admin list --------------------------------------------------------------------------------------------------

select tests.authenticate_as('inviter_a');
select throws_ok($$ select * from public.admin_trainer_referral_bonuses() $$, '42501', 'forbidden', 'a trainer cannot list bonuses');
select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('busy_b'), current_date + 1) $$, '42501', 'forbidden',
  'nor give one');

select tests.authenticate_as('admin_m');
select is(
  (select array_agg(l.referee_first_name || ':' || l.active_weeks || ':' || l.due order by l.referee_first_name)
   from public.admin_trainer_referral_bonuses() l),
  (select array_agg(p.first_name || ':' || x.weeks || ':' || x.due order by p.first_name)
   from (values ('busy_b', 4, true), ('patchy_c', 2, false), ('void_d', 5, false), ('discount_e', 0, false)) x (handle, weeks, due)
   join public.profiles p on p.id = tests.user_id(x.handle)),
  'the admin sees every bonus with the active weeks; only b is due (d''s referral is void)');

-- Giving it -------------------------------------------------------------------------------------------------------

select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('patchy_c'), current_date + 1) $$, 'P0001', 'bonus_not_due',
  'c is not due');
select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('void_d'), current_date + 1) $$, 'P0001', 'bonus_not_due',
  'a void referral is not due');
select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('discount_e'), current_date + 1) $$, 'P0001',
  'bonus_kind_unsupported', 'a discount waits for purchases');
select throws_ok($$ select public.admin_grant_referral_bonus(gen_random_uuid(), current_date + 1) $$, 'P0001', 'bonus_not_found',
  'an unknown bonus');
select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('busy_b'), current_date - 2) $$, '22023', 'invalid_start',
  'the month cannot start in the past');

select lives_ok($$ select public.admin_grant_referral_bonus(tests.bonus('busy_b'), date '2027-02-01') $$, 'b''s bonus is given');
select tests.clear_authentication();

select is(
  (select array[g.plan_code, g.source::text, g.reason] from public.plan_grants g
   join public.bonuses b on b.plan_grant_id = g.id where b.id = tests.bonus('busy_b')),
  array['trainer_pro', 'referral_bonus', 'Бонус за приглашение тренера'], 'as a referral_bonus grant of Pro');
select is(
  (select array[(g.starts_at at time zone p.time_zone)::text, (g.expires_at at time zone p.time_zone)::text]
   from public.plan_grants g join public.bonuses b on b.plan_grant_id = g.id join public.profiles p on p.id = g.user_id
   where b.id = tests.bonus('busy_b')),
  array['2027-02-01 00:00:00', '2027-03-01 00:00:00'], 'for one month from the chosen day in the trainer''s time zone');
select is((select b.status::text from public.bonuses b where b.id = tests.bonus('busy_b')), 'granted', 'the bonus is granted');
select is((select r.status::text from public.referrals r where r.referee_id = tests.user_id('busy_b')), 'qualified',
  'the referral qualified');
select is((select count(*)::int from public.admin_audit_log a where a.action = 'referral_bonus.grant'
           and a.target_id = tests.user_id('inviter_a')), 1, 'the grant is audited');
select is(
  (select array_agg(o.type::text order by o.type::text) from public.notification_outbox o where o.user_id = tests.user_id('inviter_a')),
  array['plan_expiring', 'plan_granted'], 'a hears about it and gets the reminder before the end');
select ok(
  (select o.payload ? 'starts_at' from public.notification_outbox o
   where o.user_id = tests.user_id('inviter_a') and o.type = 'plan_granted'),
  'plan_granted carries the start');
select ok(not exists (select 1 from public.plan_grants g where g.user_id = tests.user_id('inviter_a')
                      and g.starts_at <= now() and g.revoked_at is null), 'the month has not started yet');

select tests.authenticate_as('admin_m');
select throws_ok($$ select public.admin_grant_referral_bonus(tests.bonus('busy_b'), date '2027-02-01') $$, 'P0001', 'bonus_not_pending',
  'a bonus is given once');
select tests.clear_authentication();

select * from finish();
rollback;

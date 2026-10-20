-- Trainer referral bonuses in the beta (marketing backlog 7, ambassadors §4, decisions Q50 as changed 20.10.2026):
-- plans are not sold in the beta, so a trainer's bonus for an invited colleague no longer waits for a bought plan.
-- It is due once the invited trainer has been active four weeks in a row (3 or more held sessions in each week
-- since the invitation), and an admin gives it by hand: a month of Pro from a date the admin picks, by default
-- the first day after the beta, since every beta trainer is on Pro anyway. The bonus is marked granted and keeps
-- its plan grant. Bonuses and trainer referrals: 20261017040300_referral_offers.sql, 20261017090519_trainer_referrals.sql.

-- No foreign key: plan_grants is append-only and refuses truncate, which a referencing table would turn into a
-- foreign-key error. The grant and the bonus belong to the same trainer and go together when the account does.
alter table public.bonuses add column plan_grant_id uuid;
comment on column public.bonuses.plan_grant_id is 'The plan grant that paid a plan_month bonus, set when an admin gives it.';
create index bonuses_plan_grant_idx on public.bonuses (plan_grant_id);

-- Held sessions as the owner statistics count them (Q26, private.analytics_held_sessions), for one trainer: the
-- longest run of whole weeks in a row since p_since, counted in 7-day steps from it, with 3 or more in each.
create function private.trainer_active_weeks(p_trainer_id uuid, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  with span as (
    select pg_catalog.floor(extract(epoch from pg_catalog.now() - p_since) / 604800)::integer as weeks
  ), held as (
    select pg_catalog.floor(extract(epoch from s.starts_at - p_since) / 604800)::integer as week
    from public.sessions s, span
    where s.trainer_id = p_trainer_id
      and s.starts_at >= p_since and s.starts_at < p_since + pg_catalog.make_interval(weeks => span.weeks)
      and s.ends_at <= pg_catalog.now() and s.status <> 'cancelled'
      and exists (select 1 from public.bookings b where b.session_id = s.id and b.status in ('confirmed', 'attended'))
  ), active as (
    select h.week, h.week - pg_catalog.row_number() over (order by h.week) as run
    from held h
    group by h.week
    having pg_catalog.count(*) >= 3
  )
  select coalesce(pg_catalog.max(r.weeks), 0)::integer
  from (select pg_catalog.count(*) as weeks from active a group by a.run) r
$$;

comment on function private.trainer_active_weeks(uuid, timestamptz) is
  'The longest run of consecutive weeks since the given moment with 3 or more held sessions in each '
  '(marketing backlog 7): 4 makes an invited trainer''s referral bonus due in the beta.';
revoke all on function private.trainer_active_weeks(uuid, timestamptz) from public;

-- admin_trainer_referral_bonuses -----------------------------------------------------------------------------------

-- Every bonus of a trainer referral with both trainers, how long the invited one has been active and whether the
-- bonus is due. Pending ones first, then the given ones, newest first.
create function public.admin_trainer_referral_bonuses()
returns table (
  bonus_id           uuid,
  bonus_kind         public.bonus_kind,
  discount_percent   smallint,
  bonus_status       public.bonus_status,
  granted_at         timestamptz,
  plan_starts_at     timestamptz,
  plan_expires_at    timestamptz,
  referral_status    public.referral_status,
  invited_at         timestamptz,
  referrer_id        uuid,
  referrer_first_name text,
  referrer_last_name text,
  referrer_username  text,
  referee_id         uuid,
  referee_first_name text,
  referee_last_name  text,
  referee_username   text,
  active_weeks       integer,
  due                boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins see referral bonuses';
  end if;

  return query
  select b.id, b.kind, b.discount_percent, b.status, b.granted_at, g.starts_at, g.expires_at, r.status, r.created_at,
         r.referrer_id, rp.first_name, rp.last_name, rp.username,
         r.referee_id, ep.first_name, ep.last_name, ep.username,
         w.weeks,
         b.status = 'pending' and r.status <> 'void' and w.weeks >= 4
  from public.bonuses b
  join public.referrals r on r.id = b.referral_id and r.kind = 'trainer_to_trainer' and b.beneficiary_id = r.referrer_id
  join public.profiles rp on rp.id = r.referrer_id
  join public.profiles ep on ep.id = r.referee_id
  left join public.plan_grants g on g.id = b.plan_grant_id
  cross join lateral (
    select case when b.status = 'pending' then private.trainer_active_weeks(r.referee_id, r.created_at) else 0 end as weeks
  ) w
  order by (b.status = 'pending') desc, coalesce(b.granted_at, r.created_at) desc;
end $$;

comment on function public.admin_trainer_referral_bonuses() is
  'Admin: bonuses of trainer referrals with both trainers, the invited trainer''s active weeks in a row and '
  'whether the bonus is due (4 weeks, referral not void; marketing backlog 7). Raises forbidden.';
revoke all on function public.admin_trainer_referral_bonuses() from public, anon;
grant execute on function public.admin_trainer_referral_bonuses() to authenticated;

-- admin_grant_referral_bonus ---------------------------------------------------------------------------------------

-- Gives a due plan_month bonus: Pro for one month from the start of p_starts_on in the inviting trainer's time
-- zone, as a referral_bonus grant. The referral counts as qualified from now on. Audited, and the trainer gets
-- plan_granted with the start (and plan_expiring three days before the end).
create function public.admin_grant_referral_bonus(p_bonus_id uuid, p_starts_on date)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bonus public.bonuses%rowtype;
  v_referral public.referrals%rowtype;
  v_zone text;
  v_starts timestamptz;
  v_expires timestamptz;
  v_grant uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins give referral bonuses';
  end if;

  select * into v_bonus from public.bonuses b where b.id = p_bonus_id for update;
  if not found then
    raise exception 'bonus_not_found' using errcode = 'P0001';
  end if;
  select * into v_referral from public.referrals r where r.id = v_bonus.referral_id;
  if v_referral.kind <> 'trainer_to_trainer' or v_bonus.beneficiary_id <> v_referral.referrer_id then
    raise exception 'bonus_not_found' using errcode = 'P0001';
  end if;
  if v_bonus.status <> 'pending' then
    raise exception 'bonus_not_pending' using errcode = 'P0001', detail = 'the bonus was given or voided already';
  end if;
  if v_bonus.kind <> 'plan_month' then
    raise exception 'bonus_kind_unsupported' using errcode = 'P0001',
      detail = 'a plan discount needs plan purchases, which come after the beta';
  end if;
  if v_referral.status = 'void' or private.trainer_active_weeks(v_referral.referee_id, v_referral.created_at) < 4 then
    raise exception 'bonus_not_due' using errcode = 'P0001',
      detail = 'the invited trainer has not been active four weeks in a row';
  end if;
  if not exists (select 1 from public.trainer_profiles t where t.user_id = v_referral.referrer_id) then
    raise exception 'not_a_trainer' using errcode = 'P0001';
  end if;

  select coalesce(p.time_zone, 'UTC') into v_zone from public.profiles p where p.id = v_referral.referrer_id;
  if p_starts_on is null or p_starts_on < (pg_catalog.now() at time zone v_zone)::date then
    raise exception 'invalid_start' using errcode = '22023', detail = 'the month starts today or later';
  end if;
  v_starts := p_starts_on::timestamp at time zone v_zone;
  v_expires := (p_starts_on + interval '1 month')::timestamp at time zone v_zone;

  insert into public.plan_grants (user_id, plan_code, source, granted_by, reason, starts_at, expires_at)
  values (v_referral.referrer_id, 'trainer_pro', 'referral_bonus', auth.uid(), 'Бонус за приглашение тренера',
          v_starts, v_expires)
  returning id into v_grant;

  update public.bonuses
  set status = 'granted', granted_at = pg_catalog.now(), plan_grant_id = v_grant
  where id = v_bonus.id;
  update public.referrals
  set status = 'qualified', qualified_at = pg_catalog.now()
  where id = v_referral.id and status = 'pending';

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'referral_bonus.grant', 'user', v_referral.referrer_id, 'Бонус за приглашение тренера',
          pg_catalog.jsonb_build_object('bonus_id', v_bonus.id, 'grant_id', v_grant, 'plan', 'trainer_pro',
                                        'starts_at', v_starts, 'expires_at', v_expires));

  perform private.enqueue_notification(
    p_type => 'plan_granted',
    p_dedupe_key => 'plan_granted:' || v_grant,
    p_payload => pg_catalog.jsonb_build_object('plan', 'trainer_pro', 'starts_at', v_starts, 'expires_at', v_expires),
    p_user => v_referral.referrer_id);
  perform private.enqueue_notification(
    p_type => 'plan_expiring',
    p_dedupe_key => 'plan_expiring:' || v_grant,
    p_payload => pg_catalog.jsonb_build_object('plan', 'trainer_pro', 'expires_at', v_expires),
    p_user => v_referral.referrer_id,
    p_scheduled_for => v_expires - interval '3 days');

  return v_grant;
end $$;

comment on function public.admin_grant_referral_bonus(uuid, date) is
  'Admin: gives a due trainer referral bonus (marketing backlog 7) as a month of Pro from the given day in the '
  'inviting trainer''s time zone, marks it granted and the referral qualified, audits referral_bonus.grant and '
  'queues plan_granted and plan_expiring. Raises forbidden, bonus_not_found, bonus_not_pending, '
  'bonus_kind_unsupported, bonus_not_due, not_a_trainer or invalid_start.';
revoke all on function public.admin_grant_referral_bonus(uuid, date) from public, anon;
grant execute on function public.admin_grant_referral_bonus(uuid, date) to authenticated;

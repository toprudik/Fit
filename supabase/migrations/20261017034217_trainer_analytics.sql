-- Trainer analytics (PRD wave-2 §7, Q31; screens.md «Аналитика» /trainer/analytics):
--   * trainer_analytics: attendance, cancellations by who and how, sessions held, clients with debt and passes
--     ending, for a period of local dates in the trainer's time zone (Pro feature trainer.analytics).
--   * trainer_finance: earned (charges at their money value, waived ones left out) and received (confirmed
--     payments by paid_at) per currency, never added across currencies (trainer.finance).
--   * trainer_ending_passes, trainer_churn_risk (+ trainer_dismiss_churn for 30 days), trainer_price_hints.
--   * private.trainer_earned: the one definition of "earned". A charge settled later by a pass counts at the
--     settlement amount, not both (data-model §3.3); admin analytics now reads it too, where a settled debt
--     charge used to count twice.
-- Money itself is only read here: every amount comes from ledger_entries, payments, pass_balances,
-- coaching_balances and price_grid as the money functions wrote them.

-- trainer_churn_dismissals -----------------------------------------------------------------------------------

create table public.trainer_churn_dismissals (
  coaching_id  uuid primary key references public.coachings (id) on delete cascade,
  hidden_until timestamptz not null,
  created_at   timestamptz not null default now()
);

comment on table public.trainer_churn_dismissals is
  'A client the trainer hid from «Под угрозой ухода» until hidden_until (PRD wave-2 §7 rule 6). Written only by trainer_dismiss_churn.';

alter table public.trainer_churn_dismissals enable row level security;
revoke all on table public.trainer_churn_dismissals from anon, authenticated;

-- Helpers ----------------------------------------------------------------------------------------------------

-- The signed-in trainer with the plan feature, or an error: not_a_trainer (42501), plan_required (42501).
create function private.assert_trainer_feature(p_feature text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  if not private.has_entitlement(v_trainer, p_feature) then
    raise exception 'plan_required' using errcode = '42501', detail = p_feature;
  end if;
  return v_trainer;
end $$;

comment on function private.assert_trainer_feature(text) is
  'Returns the signed-in trainer when their plan has the feature; raises not_a_trainer or plan_required.';
revoke all on function private.assert_trainer_feature(text) from public;

-- Local dates [p_from, p_to) of the trainer's time zone as instants; invalid_period (22023) for an empty or
-- over-long range (a year plus a little, the longest period the screen asks for).
create function private.trainer_period(p_trainer uuid, p_from date, p_to date, out from_at timestamptz, out to_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 400 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  select p.time_zone into v_tz from public.profiles p where p.id = p_trainer;
  from_at := p_from::timestamp at time zone v_tz;
  to_at := p_to::timestamp at time zone v_tz;
end $$;

comment on function private.trainer_period(uuid, date, date) is
  'The instants of local dates [p_from, p_to) in the trainer time zone; raises invalid_period.';
revoke all on function private.trainer_period(uuid, date, date) from public;

-- Earned (PRD wave-2 §7 rule 2): charges whose session started in [p_from, p_to), net of waivers. A charge
-- covered by a settlement counts at the settlement's amount and currency (a debt paid later by a pass is worth
-- the pass share, data-model §3.3); a settlement is undone only together with a waiver, so a waived charge
-- never counts. Charges without money (a pass worth 0) are left out of the currencies.
create function private.trainer_earned(p_trainer uuid, p_from timestamptz, p_to timestamptz)
returns table (currency text, earned_minor bigint, charges integer)
language sql
stable
set search_path = ''
as $$
  select v.currency::text, sum(v.amount_minor)::bigint, count(*)::integer
  from public.ledger_entries ch
  left join lateral (
    select st.amount_minor, st.currency
    from public.ledger_entries st
    where st.related_entry_id = ch.id and st.entry_type = 'settlement'
    order by st.created_at desc
    limit 1
  ) st on true
  cross join lateral (
    select coalesce(st.currency, ch.currency) as currency, coalesce(st.amount_minor, ch.amount_minor) as amount_minor
  ) v
  where ch.trainer_id = p_trainer and ch.entry_type = 'charge'
    and ch.occurred_at >= p_from and ch.occurred_at < p_to
    and not exists (select 1 from public.ledger_entries w where w.related_entry_id = ch.id and w.entry_type = 'waiver')
    and v.currency is not null
  group by v.currency
$$;

comment on function private.trainer_earned(uuid, timestamptz, timestamptz) is
  'Earned per currency: charges of the period at their money value (settlement amount when settled), waived ones left out.';
revoke all on function private.trainer_earned(uuid, timestamptz, timestamptz) from public;

-- Received (§7 rule 3): confirmed payments by paid_at, refunds subtracted.
create function private.trainer_received(p_trainer uuid, p_from timestamptz, p_to timestamptz)
returns table (currency text, received_minor bigint)
language sql
stable
set search_path = ''
as $$
  select y.currency::text, sum(case when y.direction = 'in' then y.amount_minor else -y.amount_minor end)::bigint
  from public.payments y
  where y.trainer_id = p_trainer and y.status = 'confirmed' and y.paid_at >= p_from and y.paid_at < p_to
  group by y.currency
$$;

comment on function private.trainer_received(uuid, timestamptz, timestamptz) is
  'Received per currency: confirmed payments of the period by paid_at, refunds subtracted.';
revoke all on function private.trainer_received(uuid, timestamptz, timestamptz) from public;

-- trainer_analytics ------------------------------------------------------------------------------------------

-- Counts of the period (sessions that started in it) plus the current debt and ending passes. A session is held
-- when one of its bookings is attended; attendance = attended / (attended + no-shows) (§7 metrics).
create function public.trainer_analytics(p_from date, p_to date)
returns table (
  held_sessions       integer,
  attended            integer,
  no_shows            integer,
  client_cancels      integer,
  late_cancels        integer,
  trainer_cancels     integer,
  active_clients      integer,
  debt_clients        integer,
  debt                jsonb,
  ending_passes       integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.analytics');
  v_from timestamptz;
  v_to timestamptz;
begin
  select pr.from_at, pr.to_at into v_from, v_to from private.trainer_period(v_trainer, p_from, p_to) pr;

  return query
  with period_bookings as (
    select b.client_id, b.session_id, b.status, b.cancelled_by_role
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.trainer_id = v_trainer and s.starts_at >= v_from and s.starts_at < v_to
  ),
  debts as (
    select cb.coaching_id, cb.debt_sessions, cb.debt_amounts
    from public.coaching_balances cb
    where cb.trainer_id = v_trainer and cb.debt_sessions > 0
  )
  select
    (select count(distinct pb.session_id)::integer from period_bookings pb where pb.status = 'attended'),
    (select count(*)::integer from period_bookings pb where pb.status = 'attended'),
    (select count(*)::integer from period_bookings pb where pb.status = 'no_show'),
    (select count(*)::integer from period_bookings pb where pb.status = 'cancelled' and pb.cancelled_by_role = 'client'),
    (select count(*)::integer from period_bookings pb where pb.status = 'late_cancelled'),
    (select count(*)::integer from period_bookings pb where pb.status = 'cancelled' and pb.cancelled_by_role = 'trainer'),
    (select count(distinct pb.client_id)::integer from period_bookings pb where pb.status = 'attended'),
    (select count(*)::integer from debts),
    coalesce((
      select pg_catalog.jsonb_object_agg(x.key, x.total)
      from (
        select e.key, sum(e.value::bigint) as total
        from debts d cross join lateral pg_catalog.jsonb_each_text(d.debt_amounts) e
        group by e.key
      ) x), '{}'::jsonb),
    (select count(*)::integer from private.trainer_ending_passes(v_trainer));
end $$;

comment on function public.trainer_analytics(date, date) is
  'Trainer: attendance, cancellations and sessions of local dates [p_from, p_to), current debt and ending passes (PRD wave-2 §7).';
revoke all on function public.trainer_analytics(date, date) from public, anon;
grant execute on function public.trainer_analytics(date, date) to authenticated;

-- trainer_finance --------------------------------------------------------------------------------------------

create function public.trainer_finance(p_from date, p_to date)
returns table (currency text, earned_minor bigint, charges integer, received_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.finance');
  v_from timestamptz;
  v_to timestamptz;
begin
  select pr.from_at, pr.to_at into v_from, v_to from private.trainer_period(v_trainer, p_from, p_to) pr;

  return query
  select coalesce(e.currency, r.currency), coalesce(e.earned_minor, 0)::bigint, coalesce(e.charges, 0)::integer,
    coalesce(r.received_minor, 0)::bigint
  from private.trainer_earned(v_trainer, v_from, v_to) e
  full join private.trainer_received(v_trainer, v_from, v_to) r on r.currency = e.currency
  order by 1;
end $$;

comment on function public.trainer_finance(date, date) is
  'Trainer: earned, charges and received per currency for local dates [p_from, p_to) (PRD wave-2 §7 rules 2-5).';
revoke all on function public.trainer_finance(date, date) from public, anon;
grant execute on function public.trainer_finance(date, date) to authenticated;

-- trainer_ending_passes --------------------------------------------------------------------------------------

-- Active passes with 2 sessions or fewer left or 7 days or fewer to their expiry with freezes (§7 metrics).
create function private.trainer_ending_passes(p_trainer uuid)
returns table (coaching_id uuid, pass_id uuid, title text, remaining integer, effective_expires_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select pb.coaching_id, pb.pass_id, pb.title, pb.remaining, pb.effective_expires_at
  from public.pass_balances pb
  join public.coachings c on c.id = pb.coaching_id and c.status in ('trial', 'active')
  where pb.trainer_id = p_trainer and pb.status in ('active', 'frozen')
    and (pb.remaining <= 2 or pb.effective_expires_at <= pg_catalog.now() + interval '7 days')
$$;

comment on function private.trainer_ending_passes(uuid) is
  'Live passes of the trainer''s live pairs with at most 2 sessions or 7 days left.';
revoke all on function private.trainer_ending_passes(uuid) from public;

create function public.trainer_ending_passes()
returns table (
  coaching_id          uuid,
  client_id            uuid,
  client_alias         text,
  display_name         text,
  first_name           text,
  last_name            text,
  username             text,
  title                text,
  remaining            integer,
  effective_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.analytics');
begin
  return query
  select e.coaching_id, c.client_id, m.client_alias, p.display_name, p.first_name, p.last_name, p.username, e.title,
    e.remaining, e.effective_expires_at
  from private.trainer_ending_passes(v_trainer) e
  join public.coachings c on c.id = e.coaching_id
  join public.profiles p on p.id = c.client_id
  left join public.coaching_trainer_meta m on m.coaching_id = c.id
  order by e.remaining, e.effective_expires_at nulls last;
end $$;

comment on function public.trainer_ending_passes() is 'Trainer: passes ending soon, with the client''s name (PRD wave-2 §7).';
revoke all on function public.trainer_ending_passes() from public, anon;
grant execute on function public.trainer_ending_passes() to authenticated;

-- trainer_churn_risk -----------------------------------------------------------------------------------------

-- Live active pairs that match any rule of §7 rule 6, with every reason that applies:
--   no_sessions: no attended session for 14 days after at least 8 in the 8 weeks before those 14 days;
--   pass_ended:  no live pass, and the last one ran out or expired 7 days ago or earlier;
--   cancels:     2 or more of the last 4 past bookings are client cancellations, late cancellations or no-shows.
-- days_absent is whole days since the last attended session (null when never). Hidden pairs are left out.
create function public.trainer_churn_risk()
returns table (
  coaching_id  uuid,
  client_id    uuid,
  client_alias text,
  display_name text,
  first_name   text,
  last_name    text,
  username     text,
  reasons      text[],
  days_absent  integer,
  pass_ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.analytics');
begin
  return query
  with pairs as (
    select c.id, c.client_id
    from public.coachings c
    where c.trainer_id = v_trainer and c.status = 'active'
      and not exists (
        select 1 from public.trainer_churn_dismissals d where d.coaching_id = c.id and d.hidden_until > pg_catalog.now())
  ),
  facts as (
    select
      pr.id, pr.client_id,
      (select max(s.starts_at) from public.bookings b join public.sessions s on s.id = b.session_id
       where b.coaching_id = pr.id and b.status = 'attended') as last_attended,
      (select count(*) from public.bookings b join public.sessions s on s.id = b.session_id
       where b.coaching_id = pr.id and b.status = 'attended'
         and s.starts_at >= pg_catalog.now() - interval '70 days' and s.starts_at < pg_catalog.now() - interval '14 days')
        as attended_before,
      exists (select 1 from public.pass_balances pb where pb.coaching_id = pr.id and pb.status in ('active', 'frozen'))
        as has_live_pass,
      -- When the latest pass ended: its expiry, or the last session it paid for when it ran out first.
      (select max(case
                    when pb.status = 'expired' then pb.effective_expires_at
                    else (select max(le.occurred_at) from public.ledger_entries le
                          where le.pass_id = pb.pass_id and le.sessions_delta < 0)
                  end)
       from public.pass_balances pb where pb.coaching_id = pr.id and pb.status in ('expired', 'exhausted')) as pass_ended,
      (select count(*) filter (where r.bad) from (
         select b.status in ('no_show', 'late_cancelled') or (b.status = 'cancelled' and b.cancelled_by_role = 'client') as bad
         from public.bookings b join public.sessions s on s.id = b.session_id
         where b.coaching_id = pr.id and s.starts_at < pg_catalog.now()
           and (b.status in ('attended', 'no_show', 'late_cancelled') or (b.status = 'cancelled' and b.cancelled_by_role = 'client'))
         order by s.starts_at desc
         limit 4) r) as bad_of_last_4
    from pairs pr
  ),
  flagged as (
    select f.*, array_remove(array[
      case when f.attended_before >= 8 and (f.last_attended is null or f.last_attended < pg_catalog.now() - interval '14 days')
        then 'no_sessions' end,
      case when not f.has_live_pass and f.pass_ended <= pg_catalog.now() - interval '7 days' then 'pass_ended' end,
      case when f.bad_of_last_4 >= 2 then 'cancels' end
    ], null) as reasons
    from facts f
  )
  select fl.id, fl.client_id, m.client_alias, p.display_name, p.first_name, p.last_name, p.username, fl.reasons,
    pg_catalog.floor(extract(epoch from pg_catalog.now() - fl.last_attended) / 86400)::integer, fl.pass_ended
  from flagged fl
  join public.profiles p on p.id = fl.client_id
  left join public.coaching_trainer_meta m on m.coaching_id = fl.id
  where pg_catalog.cardinality(fl.reasons) > 0
  order by pg_catalog.cardinality(fl.reasons) desc, fl.last_attended nulls first;
end $$;

comment on function public.trainer_churn_risk() is
  'Trainer: clients at risk of leaving with their reasons (PRD wave-2 §7 rule 6); dismissed pairs are left out.';
revoke all on function public.trainer_churn_risk() from public, anon;
grant execute on function public.trainer_churn_risk() to authenticated;

-- The trainer hides a client from the list for 30 days. Raises not_a_trainer, plan_required, pair_not_found.
create function public.trainer_dismiss_churn(p_coaching_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.analytics');
  v_until timestamptz := pg_catalog.now() + interval '30 days';
begin
  if not exists (select 1 from public.coachings c where c.id = p_coaching_id and c.trainer_id = v_trainer) then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
  insert into public.trainer_churn_dismissals (coaching_id, hidden_until) values (p_coaching_id, v_until)
  on conflict (coaching_id) do update set hidden_until = excluded.hidden_until;
  return v_until;
end $$;

comment on function public.trainer_dismiss_churn(uuid) is 'Trainer: hides a client from «Под угрозой ухода» for 30 days.';
revoke all on function public.trainer_dismiss_churn(uuid) from public, anon;
grant execute on function public.trainer_dismiss_churn(uuid) to authenticated;

-- trainer_price_hints ----------------------------------------------------------------------------------------

-- Rule-based price hints (§7 rule 8), one row per finding:
--   inverted:    a bigger pack costs more per session than a smaller one (a = bigger, b = smaller, value = bigger's
--                per-session price in minor units);
--   high_demand: 85 % or more of the slots of the last 4 weeks were booked (value = percent; at least 8 slots);
--   stale:       no live package changed its price for 12 months (value = months since the latest change);
--   weak_bundle: a pack of 20 sessions or more saves under 5 % against the drop-in (a = pack, value = percent).
create function public.trainer_price_hints()
returns table (kind text, currency text, a text, b text, value integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.finance');
begin
  return query
  select 'inverted', big.currency::text, big.title, small.title, big.per_session_minor::integer
  from public.price_grid big
  join public.price_grid small
    on small.trainer_id = big.trainer_id and small.currency = big.currency and small.applies_to = big.applies_to
   and small.sessions_count < big.sessions_count and small.per_session_minor < big.per_session_minor
  where big.trainer_id = v_trainer
  union all
  select 'high_demand', null, null, null, (100 * x.booked / x.total)::integer
  from (
    select count(*) filter (where sl.status = 'booked') as booked, count(*) as total
    from public.slots sl
    where sl.trainer_id = v_trainer and sl.status <> 'closed'
      and sl.starts_at >= pg_catalog.now() - interval '28 days' and sl.starts_at < pg_catalog.now()
  ) x
  where x.total >= 8 and x.booked * 100 >= x.total * 85
  union all
  select 'stale', null, null, null,
    (extract(year from age(pg_catalog.now(), y.latest)) * 12 + extract(month from age(pg_catalog.now(), y.latest)))::integer
  from (
    select max(pk.price_updated_at) as latest
    from public.packages pk
    where pk.trainer_id = v_trainer and pk.archived_at is null
  ) y
  where y.latest < pg_catalog.now() - interval '12 months'
  union all
  select 'weak_bundle', g.currency::text, g.title, null, coalesce(g.savings_pct, 0)
  from public.price_grid g
  where g.trainer_id = v_trainer and g.sessions_count >= 20 and g.drop_in_price_minor > 0
    and coalesce(g.savings_pct, 0) < 5;
end $$;

comment on function public.trainer_price_hints() is 'Trainer: rule-based price hints (PRD wave-2 §7 rule 8).';
revoke all on function public.trainer_price_hints() from public, anon;
grant execute on function public.trainer_price_hints() to authenticated;

-- Admin analytics: earned through private.trainer_earned -------------------------------------------------------

create or replace function private.analytics_trainers(p_days integer, p_trainer_id uuid)
returns table (
  trainer_id          uuid,
  first_name          text,
  last_name           text,
  username            text,
  verification_status public.verification_status,
  clients             integer,
  held_sessions       integer,
  attended            integer,
  no_shows            integer,
  earned              jsonb,
  received            jsonb,
  ending_passes       integer,
  last_active         timestamptz,
  opens               integer,
  uses_passes         boolean,
  uses_repeats        boolean,
  uses_groups         boolean,
  uses_workout_templates boolean
)
language sql
stable
set search_path = ''
as $$
  select
    t.user_id, p.first_name, p.last_name, p.username, t.verification_status,
    (select count(*)::integer from public.coachings c where c.trainer_id = t.user_id and c.status in ('trial', 'active')),
    (select count(*)::integer from private.analytics_held_sessions(pg_catalog.now() - pg_catalog.make_interval(days => p_days),
       pg_catalog.now()) h where h.trainer_id = t.user_id),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.trainer_id = t.user_id and b.status = 'attended'
       and s.starts_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    (select count(*)::integer from public.bookings b join public.sessions s on s.id = b.session_id
     where b.trainer_id = t.user_id and b.status = 'no_show'
       and s.starts_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    coalesce((
      select pg_catalog.jsonb_object_agg(e.currency, e.earned_minor)
      from private.trainer_earned(t.user_id, pg_catalog.now() - pg_catalog.make_interval(days => p_days), 'infinity') e
      where e.earned_minor <> 0), '{}'::jsonb),
    coalesce((
      select pg_catalog.jsonb_object_agg(r.currency, r.received_minor)
      from private.trainer_received(t.user_id, pg_catalog.now() - pg_catalog.make_interval(days => p_days), 'infinity') r),
      '{}'::jsonb),
    (select count(*)::integer from public.passes ps
     where ps.trainer_id = t.user_id and ps.status = 'active'
       and ps.expires_at > pg_catalog.now() and ps.expires_at <= pg_catalog.now() + interval '14 days'),
    private.analytics_last_active(t.user_id),
    (select count(*)::integer from public.app_opens o
     where o.user_id = t.user_id and o.opened_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
    exists (select 1 from public.passes ps where ps.trainer_id = t.user_id),
    exists (select 1 from public.recurrences r where r.trainer_id = t.user_id),
    exists (select 1 from public.sessions s where s.trainer_id = t.user_id and s.kind = 'group'),
    exists (select 1 from public.workout_templates w where w.owner_id = t.user_id)
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  where p_trainer_id is null or t.user_id = p_trainer_id
$$;

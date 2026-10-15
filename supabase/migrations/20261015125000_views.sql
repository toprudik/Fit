-- Derived data (data-model §3.2, §5.1, contract §1.5 file 25): public_profiles, pass_balances,
-- coaching_balances, coaching_stats, price_grid, plus two definer read functions for sessions.
-- Every view is security_invoker, so it shows exactly the rows and columns the caller may read in the tables
-- under it: no view widens access, and an ended pair keeps its accounting (passes, ledger, payments) for both
-- sides. Nothing here is stored; balances are sums over the append-only ledger (data-model §3.1).

-- public_profiles

-- R6: a person as others see them. Reads only granted profiles columns, so the profiles policy (self, pair
-- partners, own cards, admins) applies as is and PostgREST can embed it through profiles foreign keys.
-- No telegram_id.
create view public.public_profiles
with (security_invoker = true)
as
select
  p.id,
  coalesce(p.display_name, nullif(concat_ws(' ', p.first_name, p.last_name), ''), p.username) as display_name,
  p.avatar_path,
  p.photo_url,
  p.username,
  p.time_zone,
  p.managed_by_trainer_id is not null as is_managed_card
from public.profiles p;

comment on view public.public_profiles is
  'A person as other signed-in users see them: name, avatar and time zone; rows follow the profiles policy.';
comment on column public.public_profiles.display_name is
  'Name chosen in the settings, else the Telegram first and last name, else the Telegram username.';
comment on column public.public_profiles.is_managed_card is
  'True for a client card the trainer keeps without an account.';

revoke all on table public.public_profiles from anon, authenticated;
grant select on table public.public_profiles to authenticated;

-- pass_balances

-- One row per visible pass. Dates of the pass (expiry, freezes, "today") are local dates of the trainer time
-- zone, read from the trainer's profile, which both sides of the pair may read (if it were hidden, the date
-- columns would be NULL rather than guessed). Never reads sessions.meeting_url.
create view public.pass_balances
with (security_invoker = true)
as
select
  p.id as pass_id,
  p.coaching_id,
  p.trainer_id,
  p.client_id,
  p.title,
  p.currency,
  p.sessions_total,
  p.price_minor,
  p.expires_at,
  l.remaining,
  r.reserved_future,
  l.remaining - r.reserved_future as available,
  f.freeze_days,
  e.effective_expires_at,
  f.frozen_today,
  case
    when p.status = 'cancelled' then 'cancelled'
    when l.remaining <= 0 then 'exhausted'
    when e.effective_expires_at <= pg_catalog.now() then 'expired'
    when f.frozen_today then 'frozen'
    else 'active'
  end as status,
  m.paid_minor,
  p.price_minor - m.paid_minor as unpaid_minor
from public.passes p
left join public.profiles tr on tr.id = p.trainer_id
cross join lateral (
  select coalesce(sum(le.sessions_delta), 0)::integer as remaining
  from public.ledger_entries le
  where le.pass_id = p.id
) l
cross join lateral (
  select count(*)::integer as reserved_future
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.reserved_pass_id = p.id and b.status = 'confirmed' and s.starts_at > pg_catalog.now()
) r
-- Freezes that start before the base expiry move it (data-model §3.2); without an expiry every freeze counts.
cross join lateral (
  select
    coalesce(sum(upper(fr.period) - lower(fr.period)) filter (
      where p.expires_at is null or lower(fr.period) < (p.expires_at at time zone tr.time_zone)::date), 0)::integer
      as freeze_days,
    coalesce(bool_or((pg_catalog.now() at time zone tr.time_zone)::date <@ fr.period), false) as frozen_today
  from public.pass_freezes fr
  where fr.pass_id = p.id
) f
-- Local wall time plus whole days, back to an instant: a day stays a calendar day across DST changes.
cross join lateral (
  select ((p.expires_at at time zone tr.time_zone) + f.freeze_days * interval '1 day') at time zone tr.time_zone
    as effective_expires_at
) e
cross join lateral (
  select coalesce(sum(case pm.direction when 'in' then pm.amount_minor else -pm.amount_minor end), 0)::bigint
    as paid_minor
  from public.payments pm
  where pm.pass_id = p.id and pm.status = 'confirmed'
) m;

comment on view public.pass_balances is
  'Balance, expiry with freezes, derived status and payment state of each pass the caller can see.';
comment on column public.pass_balances.remaining is 'Sessions left: sum of the pass ledger rows.';
comment on column public.pass_balances.reserved_future is
  'Confirmed future bookings reserved against the pass (bookings.reserved_pass_id).';
comment on column public.pass_balances.available is 'Sessions free for new bookings: remaining minus reserved_future.';
comment on column public.pass_balances.freeze_days is
  'Frozen days that move the expiry: days of freezes starting before the base expiry (all freezes without one).';
comment on column public.pass_balances.effective_expires_at is
  'Exclusive end instant with freezes: expires_at moved by freeze_days local days; null = no expiry.';
comment on column public.pass_balances.frozen_today is 'Today, in the trainer time zone, falls inside a freeze.';
comment on column public.pass_balances.status is
  'First match of cancelled, exhausted (nothing left), expired, frozen, active.';
comment on column public.pass_balances.paid_minor is
  'Confirmed incoming payments minus confirmed refunds on the pass, in minor units of the pass currency.';
comment on column public.pass_balances.unpaid_minor is
  'Price minus paid_minor, in minor units; below zero when overpaid (MONEY-9: partial when between).';

revoke all on table public.pass_balances from anon, authenticated;
grant select on table public.pass_balances to authenticated;


-- coaching_balances

-- One row per visible pair, in any status. Money is a jsonb object keyed by currency code, because amounts in
-- different currencies are never added together.
create view public.coaching_balances
with (security_invoker = true)
as
select
  c.id as coaching_id,
  c.trainer_id,
  c.client_id,
  a.available_sessions,
  d.debt_sessions,
  d.debt_amounts,
  u.unpaid_amounts
from public.coachings c
cross join lateral (
  select coalesce(sum(pb.available), 0)::integer as available_sessions
  from public.pass_balances pb
  where pb.coaching_id = c.id and pb.status = 'active'
) a
-- Debt: charges without a pass that are neither waived nor covered by a settlement. A settlement undone by a
-- settlement_reversal no longer covers its charge (data-model §3.2); the waiver check alone already covers that
-- case in practice, because a reversal is written only together with a waiver (R34).
cross join lateral (
  select
    coalesce(sum(dc.n), 0)::integer as debt_sessions,
    coalesce(
      jsonb_object_agg(dc.currency, dc.amount_minor) filter (where dc.currency is not null and dc.amount_minor <> 0),
      '{}'::jsonb) as debt_amounts
  from (
    select ch.currency, count(*) as n, sum(ch.amount_minor) as amount_minor
    from public.ledger_entries ch
    where ch.coaching_id = c.id and ch.entry_type = 'charge' and ch.pass_id is null
      and not exists (
        select 1 from public.ledger_entries w
        where w.related_entry_id = ch.id and w.entry_type = 'waiver')
      and not exists (
        select 1 from public.ledger_entries st
        where st.related_entry_id = ch.id and st.entry_type = 'settlement'
          and not exists (
            select 1 from public.ledger_entries rv
            where rv.related_entry_id = ch.id and rv.entry_type = 'settlement_reversal'))
    group by ch.currency
  ) dc
) d
cross join lateral (
  select coalesce(jsonb_object_agg(y.currency, y.unpaid_minor), '{}'::jsonb) as unpaid_amounts
  from (
    select pb.currency, sum(pb.unpaid_minor) as unpaid_minor
    from public.pass_balances pb
    where pb.coaching_id = c.id and pb.status <> 'cancelled'
    group by pb.currency
    having sum(pb.unpaid_minor) <> 0
  ) y
) u;

comment on view public.coaching_balances is
  'Sessions available, debt and unpaid money of each pair the caller can see; money keyed by currency.';
comment on column public.coaching_balances.available_sessions is
  'Sum of available over the pair passes with status active.';
comment on column public.coaching_balances.debt_sessions is
  'Charges without a pass that are neither waived nor covered by a settlement (data-model §3.2).';
comment on column public.coaching_balances.debt_amounts is
  'Money of those charges as {currency: minor units}; charges without an amount are left out.';
comment on column public.coaching_balances.unpaid_amounts is
  'Unpaid money of the pair passes that are not cancelled, as {currency: minor units}; zero sums are left out.';

revoke all on table public.coaching_balances from anon, authenticated;
grant select on table public.coaching_balances to authenticated;

-- coaching_stats

-- One row per visible pair. Counts come from booking statuses (an attended <-> no_show correction moves a
-- booking between counts without a ledger row, data-model §3.3).
create view public.coaching_stats
with (security_invoker = true)
as
select
  c.id as coaching_id,
  c.trainer_id,
  c.client_id,
  st.attended_count,
  st.no_show_count,
  st.late_cancel_count,
  st.last_attended_at,
  st.next_session_at
from public.coachings c
cross join lateral (
  select
    (count(*) filter (where b.status = 'attended'))::integer as attended_count,
    (count(*) filter (where b.status = 'no_show'))::integer as no_show_count,
    (count(*) filter (where b.status = 'late_cancelled'))::integer as late_cancel_count,
    max(s.starts_at) filter (where b.status = 'attended') as last_attended_at,
    min(s.starts_at) filter (where b.status = 'confirmed' and s.starts_at > pg_catalog.now()) as next_session_at
  from public.bookings b
  left join public.sessions s on s.id = b.session_id
  where b.coaching_id = c.id
) st;

comment on view public.coaching_stats is
  'Attendance counts and the last and next session of each pair the caller can see.';
comment on column public.coaching_stats.last_attended_at is 'Start of the latest session with an attended booking.';
comment on column public.coaching_stats.next_session_at is
  'Start of the earliest future session with a confirmed booking.';

revoke all on table public.coaching_stats from anon, authenticated;
grant select on table public.coaching_stats to authenticated;

-- price_grid

-- R21 (PRD 2.8-2, MONEY-1/2): one row per live package. Per-session price rounds half up; savings round down
-- against the drop-in price (the live 1-session package of the same trainer and currency, for the same session
-- type or else for any type); only one row per trainer, currency and type gets the best value badge.
create view public.price_grid
with (security_invoker = true)
as
with live as (
  select
    pk.id, pk.trainer_id, pk.title, pk.currency, pk.applies_to, pk.sessions_count, pk.price_minor,
    (pk.price_minor * 2 + pk.sessions_count) / (2 * pk.sessions_count) as per_session_minor
  from public.packages pk
  where pk.archived_at is null
),
priced as (
  select
    l.*,
    di.id as drop_in_package_id,
    di.price_minor as drop_in_price_minor,
    case
      when l.sessions_count > 1 and di.price_minor > 0 and l.per_session_minor < di.price_minor
        then floor(100 - l.per_session_minor * 100.0 / di.price_minor)::integer
    end as savings_pct
  from live l
  left join lateral (
    select d.id, d.price_minor
    from live d
    where d.trainer_id = l.trainer_id and d.currency = l.currency and d.sessions_count = 1
      and d.applies_to in (l.applies_to, 'any')
    order by d.applies_to = l.applies_to desc
    limit 1
  ) di on true
)
select
  p.id as package_id,
  p.trainer_id,
  p.title,
  p.currency,
  p.applies_to,
  p.sessions_count,
  p.price_minor,
  p.per_session_minor,
  p.drop_in_package_id,
  p.drop_in_price_minor,
  p.savings_pct,
  coalesce(
    p.savings_pct > 0
      and row_number() over (
        partition by p.trainer_id, p.currency, p.applies_to
        order by p.savings_pct desc nulls last, p.sessions_count desc, p.id) = 1,
    false) as is_best_value
from priced p;

comment on view public.price_grid is
  'The price grid: each live package with its per-session price, savings against the drop-in and the best value badge.';
comment on column public.price_grid.per_session_minor is 'Price per session in minor units, rounded half up.';
comment on column public.price_grid.drop_in_price_minor is
  'Price of the drop-in package (1 session) used for the savings, in minor units; null when there is none.';
comment on column public.price_grid.savings_pct is
  'Whole percent saved per session against the drop-in, rounded down; null for the drop-in itself or no saving.';
comment on column public.price_grid.is_best_value is
  'True for one package per trainer, currency and type: the highest savings above 0, ties to the larger pack.';

revoke all on table public.price_grid from anon, authenticated;
grant select on table public.price_grid to authenticated;

-- session_occupancy

-- Seats taken on a session (R18: requested, confirmed, attended and no_show hold a seat). Definer, because a
-- client cannot see other clients' bookings; it returns only the two numbers, and only to the trainer, a
-- participant, or a client of a live pair when the session is open for booking. Anyone else gets no row.
create function public.session_occupancy(p_session_id uuid)
returns table (occupied integer, capacity smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer
     from public.bookings b
     where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show')),
    s.capacity
  from public.sessions s
  where s.id = p_session_id
    and (
      (s.open_for_booking and s.status = 'scheduled'
       and s.trainer_id in (select private.trainer_ids_visible(true)))
      or private.can_manage_session(s.id)
      or private.is_session_participant(s.id)
    )
$$;

comment on function public.session_occupancy(uuid) is
  'Seats taken and capacity of a session, for its trainer, its participants and clients who may book it; else no row.';
revoke all on function public.session_occupancy(uuid) from public, anon;
grant execute on function public.session_occupancy(uuid) to authenticated, service_role;

-- session_meeting_url

-- R25 (PRD 2.6.2-3, SCHED-21): sessions.meeting_url is not granted for SELECT. The trainer gets the link, and
-- so does a client whose booking on the session is confirmed or attended; a request, a cancelled booking or an
-- open session seen from outside gets NULL.
create function public.session_meeting_url(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.meeting_url
  from public.sessions s
  where s.id = p_session_id
    and (
      exists (
        select 1 from public.bookings b
        where b.session_id = s.id and b.client_id = auth.uid() and b.status in ('confirmed', 'attended'))
      or private.can_manage_session(s.id)
    )
$$;

comment on function public.session_meeting_url(uuid) is
  'Online link of a session for its trainer and for clients with a confirmed or attended booking; else NULL.';
revoke all on function public.session_meeting_url(uuid) from public, anon;
grant execute on function public.session_meeting_url(uuid) to authenticated, service_role;

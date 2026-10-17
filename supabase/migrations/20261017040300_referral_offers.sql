-- Referral offers of a trainer for their clients (PRD wave-3 §3.1; data-model "Рефералка"; screens.md
-- /trainer/referrals). The trainer runs one offer at a time: N sessions to the client who brought a friend, and
-- optionally M sessions to the friend, once the friend pays (Q50). A client of a live pair gets a personal link
-- r/<code>; a person new to the trainer who joins by it becomes their client like by the client link, and a
-- pending referral is made. The first confirmed payment in the friend's pair that meets the offer's condition (a
-- minimal sum or one package) qualifies it: each side gets a bonus pass of its sessions at price 0, so the bonus
-- never counts as earned money. A payment voided within 14 days takes back the bonuses nobody has used yet.
-- Bonuses for trainers who bring trainers (§3.2) come later; their enum values are here already.
--   * Tables: referral_offers, referral_codes, referrals, bonuses; RLS on, no grants: every read and write goes
--     through the functions below.
--   * passes.is_bonus marks a bonus pass (data-model R60).

alter table public.passes add column is_bonus boolean not null default false;
comment on column public.passes.is_bonus is 'A bonus pass of a referral (PRD wave-3 §3.1-6): price 0, made by the database.';

create table public.referral_offers (
  id                uuid primary key default gen_random_uuid(),
  trainer_id        uuid not null references public.trainer_profiles (user_id) on delete cascade,
  referrer_sessions smallint not null check (referrer_sessions between 1 and 5),
  referee_sessions  smallint not null default 0 check (referee_sessions between 0 and 5),
  min_amount_minor  bigint check (min_amount_minor > 0),
  currency          public.currency_code,
  package_id        uuid,
  active_to         date,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint referral_offers_amount_check check ((min_amount_minor is null) = (currency is null)),
  constraint referral_offers_condition_check check (min_amount_minor is null or package_id is null),
  constraint referral_offers_package_fkey foreign key (package_id, trainer_id)
    references public.packages (id, trainer_id) on delete set null (package_id)
);

comment on table public.referral_offers is
  'A trainer''s «Приведи друга» offer (PRD wave-3 §3.1-1): sessions to both sides once the friend pays; one live '
  'offer per trainer, ended by archiving. Written only by save_referral_offer and stop_referral_offer.';

create unique index referral_offers_one_live_idx on public.referral_offers (trainer_id) where archived_at is null;
create index referral_offers_trainer_idx on public.referral_offers (trainer_id);
create index referral_offers_package_idx on public.referral_offers (package_id, trainer_id);

alter table public.referral_offers enable row level security;
revoke all on table public.referral_offers from anon, authenticated;

-- The personal link of a client in one pair: r/<code>.
create table public.referral_codes (
  coaching_id uuid primary key references public.coachings (id) on delete cascade,
  code        text not null unique check (code ~ '^[a-z0-9]{10}$'),
  created_at  timestamptz not null default now()
);

comment on table public.referral_codes is
  'The personal referral link of a client of one trainer (PRD wave-3 §3.1-3), made on first use by client_referral.';

alter table public.referral_codes enable row level security;
revoke all on table public.referral_codes from anon, authenticated;

create type public.referral_kind as enum ('client_to_client', 'trainer_to_trainer');
create type public.referral_status as enum ('pending', 'qualified', 'void');
create type public.referral_void_reason as enum ('declined', 'pair_ended', 'payment_voided');

create table public.referrals (
  id                    uuid primary key default gen_random_uuid(),
  kind                  public.referral_kind not null default 'client_to_client',
  offer_id              uuid references public.referral_offers (id) on delete set null,
  trainer_id            uuid not null references public.profiles (id) on delete cascade,
  referrer_id           uuid not null references public.profiles (id) on delete cascade,
  referee_id            uuid not null references public.profiles (id) on delete cascade,
  coaching_id           uuid not null unique references public.coachings (id) on delete cascade,  -- the friend's pair
  referrer_coaching_id  uuid references public.coachings (id) on delete set null,
  status                public.referral_status not null default 'pending',
  qualifying_payment_id uuid references public.payments (id) on delete set null,
  qualified_at          timestamptz,
  voided_at             timestamptz,
  void_reason           public.referral_void_reason,
  created_at            timestamptz not null default now(),
  constraint referrals_self_check check (referrer_id <> referee_id),
  constraint referrals_qualified_check check (status <> 'qualified' or qualified_at is not null),
  constraint referrals_void_check check ((status = 'void') = (voided_at is not null and void_reason is not null))
);

comment on table public.referrals is
  'A friend who joined a trainer by a client''s referral link (PRD wave-3 §3.1): pending until a payment that '
  'meets the offer, then qualified; void when declined, when a pair ends, or when the payment is voided.';

create index referrals_offer_idx on public.referrals (offer_id);
create index referrals_trainer_idx on public.referrals (trainer_id, created_at);
create index referrals_referrer_idx on public.referrals (referrer_id);
create index referrals_referee_idx on public.referrals (referee_id);
create index referrals_referrer_coaching_idx on public.referrals (referrer_coaching_id);
create index referrals_payment_idx on public.referrals (qualifying_payment_id);

alter table public.referrals enable row level security;
revoke all on table public.referrals from anon, authenticated;

create type public.bonus_kind as enum ('sessions', 'plan_month', 'plan_discount');
create type public.bonus_status as enum ('pending', 'granted', 'void');

create table public.bonuses (
  id             uuid primary key default gen_random_uuid(),
  referral_id    uuid not null references public.referrals (id) on delete cascade,
  beneficiary_id uuid not null references public.profiles (id) on delete cascade,
  kind           public.bonus_kind not null,
  sessions       smallint check (sessions > 0),
  pass_id        uuid references public.passes (id) on delete set null,
  status         public.bonus_status not null default 'pending',
  granted_at     timestamptz,
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  constraint bonuses_kind_sessions_check check ((kind = 'sessions') = (sessions is not null)),
  constraint bonuses_granted_check check (status <> 'granted' or granted_at is not null),
  constraint bonuses_void_check check ((status = 'void') = (voided_at is not null))
);

comment on table public.bonuses is
  'A bonus of a referral: sessions granted as a bonus pass (PRD wave-3 §3.1-6), taken back with the payment '
  'while unused (§3.1-7).';

create index bonuses_referral_idx on public.bonuses (referral_id);
create index bonuses_beneficiary_idx on public.bonuses (beneficiary_id);
create index bonuses_pass_idx on public.bonuses (pass_id);

alter table public.bonuses enable row level security;
revoke all on table public.bonuses from anon, authenticated;

-- Helpers -------------------------------------------------------------------------------------------------------

-- Whether an offer takes new friends now: not archived and not past its last day in the trainer's time zone.
create function private.referral_offer_live(p_offer public.referral_offers)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_offer.id is not null and p_offer.archived_at is null
     and (p_offer.active_to is null
          or p_offer.active_to >= (select (pg_catalog.now() at time zone pr.time_zone)::date
                                   from public.profiles pr where pr.id = p_offer.trainer_id))
$$;

revoke all on function private.referral_offer_live(public.referral_offers) from public;

-- The client's pair behind a referral code, when that pair is live.
create function private.find_referral_code(p_code text)
returns public.coachings
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.referral_codes rc join public.coachings c on c.id = rc.coaching_id
  where rc.code = pg_catalog.lower(pg_catalog.btrim(p_code)) and c.status in ('trial', 'active')
$$;

revoke all on function private.find_referral_code(text) from public;

-- Gives one side of a qualified referral its sessions: a bonus pass at price 0 in that side's pair, its grant,
-- the debt it settles, the bonus row and a message (К-referral_bonus). Nothing for a pair that is not live.
create function private.grant_referral_bonus(
  p_referral public.referrals,
  p_coaching_id uuid,
  p_sessions integer,
  p_currency public.currency_code,
  p_side text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair   public.coachings;
  v_tz     text;
  v_locale public.app_locale;
  v_pass   uuid;
  v_friend uuid;
begin
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.status = 'ended' or p_sessions <= 0 then
    return;
  end if;
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_pair.trainer_id;
  select coalesce((select s.locale from public.user_settings s where s.user_id = v_pair.client_id), 'ru') into v_locale;

  insert into public.passes (coaching_id, title, sessions_total, price_minor, currency, applies_to, is_drop_in,
                             starts_on, is_bonus)
  values (v_pair.id, case when v_locale = 'en' then 'Referral bonus' else 'Бонус за друга' end, p_sessions, 0,
          p_currency, 'any', false, (pg_catalog.now() at time zone v_tz)::date, true)
  returning id into v_pass;
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
  values (v_pair.id, 'grant', v_pass, p_sessions, 0, pg_catalog.now());
  perform private.settle_debt(v_pass);

  insert into public.bonuses (referral_id, beneficiary_id, kind, sessions, pass_id, status, granted_at)
  values (p_referral.id, v_pair.client_id, 'sessions', p_sessions, v_pass, 'granted', pg_catalog.now());

  v_friend := case when p_side = 'referrer' then p_referral.referee_id else p_referral.referrer_id end;
  perform private.enqueue_notification(
    'referral_bonus',
    pg_catalog.format('referral_bonus:%s:%s', p_referral.id, p_side),
    pg_catalog.jsonb_build_object('pass_id', v_pass, 'sessions', p_sessions, 'side', p_side,
                                  'friend', private.person_name(v_friend), 'trainer', private.person_name(v_pair.trainer_id)),
    v_pair.client_id);
end $$;

revoke all on function private.grant_referral_bonus(public.referrals, uuid, integer, public.currency_code, text) from public;

-- A confirmed incoming payment in a friend's pair: the pending referral qualifies when the payment meets its
-- offer (Q50, §3.1-5): the package of the paid pass, or the sum in the offer's currency. The client who brought
-- the friend gets at most 10 bonuses per offer (§3.1-8); the friend gets theirs either way.
create function private.qualify_referral(p_payment public.payments)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_offer    public.referral_offers;
  v_package  uuid;
  v_granted  integer;
begin
  select r.* into v_referral from public.referrals r
  where r.coaching_id = p_payment.coaching_id and r.status = 'pending'
  for update;
  if v_referral.id is null then
    return;
  end if;
  select o.* into v_offer from public.referral_offers o where o.id = v_referral.offer_id;
  if v_offer.id is null then
    return;
  end if;
  if v_offer.package_id is not null then
    select p.package_id into v_package from public.passes p where p.id = p_payment.pass_id;
    if v_package is distinct from v_offer.package_id then
      return;
    end if;
  end if;
  if v_offer.min_amount_minor is not null
     and (p_payment.currency <> v_offer.currency or p_payment.amount_minor < v_offer.min_amount_minor) then
    return;
  end if;

  update public.referrals r
  set status = 'qualified', qualifying_payment_id = p_payment.id, qualified_at = pg_catalog.now()
  where r.id = v_referral.id
  returning * into v_referral;

  select pg_catalog.count(*)::integer into v_granted
  from public.bonuses b join public.referrals r on r.id = b.referral_id
  where r.offer_id = v_offer.id and b.beneficiary_id = v_referral.referrer_id and b.status = 'granted';
  if v_granted < 10 then
    perform private.grant_referral_bonus(v_referral, v_referral.referrer_coaching_id, v_offer.referrer_sessions,
                                         p_payment.currency, 'referrer');
  end if;
  perform private.grant_referral_bonus(v_referral, v_referral.coaching_id, v_offer.referee_sessions,
                                       p_payment.currency, 'referee');
end $$;

revoke all on function private.qualify_referral(public.payments) from public;

-- The qualifying payment is voided: within 14 days of the qualification every bonus nobody has used is taken
-- back (its pass is cancelled with a refund of the rest) and the referral is void; a bonus with a charge or a
-- settled debt on it stays, and after
-- 14 days everything stays (§3.1-7).
create function private.revoke_referral(p_payment public.payments)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_bonus    public.bonuses;
  v_left     integer;
begin
  select r.* into v_referral from public.referrals r
  where r.qualifying_payment_id = p_payment.id and r.status = 'qualified'
    and r.qualified_at > pg_catalog.now() - interval '14 days'
  for update;
  if v_referral.id is null then
    return;
  end if;

  for v_bonus in
    select b.* from public.bonuses b
    where b.referral_id = v_referral.id and b.status = 'granted'
      and not exists (select 1 from public.ledger_entries e where e.pass_id = b.pass_id and e.entry_type in ('charge', 'settlement'))
  loop
    if v_bonus.pass_id is not null then
      select coalesce(pg_catalog.sum(e.sessions_delta), 0)::integer into v_left
      from public.ledger_entries e where e.pass_id = v_bonus.pass_id;
      if v_left > 0 then
        insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
        select p.coaching_id, 'refund', p.id, -v_left, 0, pg_catalog.now(), 'payment_voided'
        from public.passes p where p.id = v_bonus.pass_id;
      end if;
      update public.bookings b
      set reserved_pass_id = null
      from public.sessions s
      where b.reserved_pass_id = v_bonus.pass_id and s.id = b.session_id and b.status = 'confirmed'
        and s.starts_at > pg_catalog.now();
      update public.passes p
      set status = 'cancelled', cancelled_at = pg_catalog.now(), cancel_reason = 'payment_voided'
      where p.id = v_bonus.pass_id and p.status = 'active';
    end if;
    update public.bonuses b set status = 'void', voided_at = pg_catalog.now() where b.id = v_bonus.id;
  end loop;

  update public.referrals r
  set status = 'void', voided_at = pg_catalog.now(), void_reason = 'payment_voided'
  where r.id = v_referral.id;
end $$;

revoke all on function private.revoke_referral(public.payments) from public;

create function private.payments_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'in' and new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    perform private.qualify_referral(new);
  elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'voided' then
    perform private.revoke_referral(new);
  end if;
  return null;
end $$;

comment on function private.payments_referral() is
  'Qualifies a pending referral on a confirmed payment that meets its offer, and takes the bonuses back when that '
  'payment is voided within 14 days (PRD wave-3 §3.1-5, §3.1-7).';
revoke all on function private.payments_referral() from public;

create trigger payments_referral
  after insert or update of status on public.payments
  for each row execute function private.payments_referral();

-- A pair that ends voids the pending referrals it is part of, on either side (wave-3 edge cases).
create function private.coachings_void_referrals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referrals r
  set status = 'void', voided_at = pg_catalog.now(), void_reason = 'pair_ended'
  where r.status = 'pending' and (r.coaching_id = new.id or r.referrer_coaching_id = new.id);
  return null;
end $$;

revoke all on function private.coachings_void_referrals() from public;

create trigger coachings_void_referrals
  after update of status on public.coachings
  for each row when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function private.coachings_void_referrals();

-- The trainer --------------------------------------------------------------------------------------------------

-- Starts a new offer in place of the live one (pending referrals keep the terms they came with). Raises
-- forbidden for a non-trainer, plan_required without trainer.referral_offers, package_not_found, offer_invalid.
create function public.save_referral_offer(
  p_referrer_sessions integer,
  p_referee_sessions  integer default 0,
  p_min_amount_minor  bigint default null,
  p_currency          text default null,
  p_package_id        uuid default null,
  p_active_to         date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_today date;
  v_id    uuid;
begin
  if v_user is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.has_entitlement(v_user, 'trainer.referral_offers') then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  select (pg_catalog.now() at time zone pr.time_zone)::date into v_today from public.profiles pr where pr.id = v_user;
  if p_referrer_sessions is null or p_referrer_sessions not between 1 and 5
     or coalesce(p_referee_sessions, 0) not between 0 and 5
     or (p_min_amount_minor is null) <> (p_currency is null)
     or (p_min_amount_minor is not null and p_min_amount_minor <= 0)
     or (p_min_amount_minor is not null and p_package_id is not null)
     or (p_active_to is not null and p_active_to < v_today) then
    raise exception 'offer_invalid' using errcode = '22023';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.packages pk where pk.id = p_package_id and pk.trainer_id = v_user and pk.archived_at is null
  ) then
    raise exception 'package_not_found' using errcode = 'P0001';
  end if;

  update public.referral_offers o set archived_at = pg_catalog.now() where o.trainer_id = v_user and o.archived_at is null;
  insert into public.referral_offers (trainer_id, referrer_sessions, referee_sessions, min_amount_minor, currency,
                                      package_id, active_to)
  values (v_user, p_referrer_sessions, coalesce(p_referee_sessions, 0), p_min_amount_minor,
          p_currency::public.currency_code, p_package_id, p_active_to)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.save_referral_offer(integer, integer, bigint, text, uuid, date) is
  'Trainer: starts a referral offer in place of the live one. Raises forbidden, plan_required, offer_invalid or '
  'package_not_found.';
revoke all on function public.save_referral_offer(integer, integer, bigint, text, uuid, date) from public, anon;
grant execute on function public.save_referral_offer(integer, integer, bigint, text, uuid, date) to authenticated;

-- Ends the live offer: links stop making referrals; pending ones still qualify by their terms.
create function public.stop_referral_offer()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.referral_offers o set archived_at = pg_catalog.now()
  where o.trainer_id = auth.uid() and o.archived_at is null
$$;

comment on function public.stop_referral_offer() is 'Trainer: ends the live referral offer.';
revoke all on function public.stop_referral_offer() from public, anon;
grant execute on function public.stop_referral_offer() to authenticated;

-- The trainer's offer that is not archived (live = still within its last day), or no row.
create function public.trainer_referral_offer()
returns table (
  id uuid, referrer_sessions smallint, referee_sessions smallint, min_amount_minor bigint, currency text,
  package_id uuid, package_title text, active_to date, live boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.referrer_sessions, o.referee_sessions, o.min_amount_minor, o.currency::text, o.package_id,
         pk.title, o.active_to, private.referral_offer_live(o), o.created_at
  from public.referral_offers o left join public.packages pk on pk.id = o.package_id
  where o.trainer_id = auth.uid() and o.archived_at is null
$$;

comment on function public.trainer_referral_offer() is 'Trainer: the referral offer that is not archived, if any.';
revoke all on function public.trainer_referral_offer() from public, anon;
grant execute on function public.trainer_referral_offer() to authenticated;

-- Every referral to the trainer, newest first, with both people and the sessions granted to each side.
create function public.trainer_referrals()
returns table (
  id uuid, status text, void_reason text, created_at timestamptz, qualified_at timestamptz,
  referrer_coaching_id uuid, referrer jsonb, referee_coaching_id uuid, referee jsonb,
  referrer_sessions integer, referee_sessions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status::text, r.void_reason::text, r.created_at, r.qualified_at,
         r.referrer_coaching_id, private.person_name(r.referrer_id), r.coaching_id, private.person_name(r.referee_id),
         coalesce((select pg_catalog.sum(b.sessions)::integer from public.bonuses b
                   where b.referral_id = r.id and b.beneficiary_id = r.referrer_id and b.status = 'granted'), 0),
         coalesce((select pg_catalog.sum(b.sessions)::integer from public.bonuses b
                   where b.referral_id = r.id and b.beneficiary_id = r.referee_id and b.status = 'granted'), 0)
  from public.referrals r
  where r.trainer_id = auth.uid()
  order by r.created_at desc
$$;

comment on function public.trainer_referrals() is 'Trainer: their referrals, newest first, with the bonuses granted.';
revoke all on function public.trainer_referrals() from public, anon;
grant execute on function public.trainer_referrals() to authenticated;

-- The trainer declines a pending referral before it is paid (§3.1-8). Raises referral_not_found.
create function public.decline_referral(p_referral_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.referrals r
  set status = 'void', voided_at = pg_catalog.now(), void_reason = 'declined'
  where r.id = p_referral_id and r.trainer_id = auth.uid() and r.status = 'pending';
  if not found then
    raise exception 'referral_not_found' using errcode = 'P0001';
  end if;
end $$;

comment on function public.decline_referral(uuid) is 'Trainer: declines a pending referral. Raises referral_not_found.';
revoke all on function public.decline_referral(uuid) from public, anon;
grant execute on function public.decline_referral(uuid) to authenticated;

-- The client -----------------------------------------------------------------------------------------------------

-- The client's offer in a live pair: their code (made now on first use), the terms, and the friends who came by
-- it. No row when the caller is not the client of a live pair or the trainer has no live offer.
create function public.client_referral(p_coaching_id uuid)
returns table (
  code text, referrer_sessions smallint, referee_sessions smallint, min_amount_minor bigint, currency text,
  package_title text, active_to date, friends jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair  public.coachings;
  v_offer public.referral_offers;
  v_code  text;
begin
  select c.* into v_pair from public.coachings c
  where c.id = p_coaching_id and c.client_id = auth.uid() and c.status in ('trial', 'active');
  if v_pair.id is null then
    return;
  end if;
  select o.* into v_offer from public.referral_offers o where o.trainer_id = v_pair.trainer_id and o.archived_at is null;
  if not private.referral_offer_live(v_offer) then
    return;
  end if;

  select rc.code into v_code from public.referral_codes rc where rc.coaching_id = v_pair.id;
  while v_code is null loop
    insert into public.referral_codes (coaching_id, code)
    values (v_pair.id, pg_catalog.substr(pg_catalog.encode(extensions.gen_random_bytes(8), 'hex'), 1, 10))
    on conflict do nothing
    returning referral_codes.code into v_code;
  end loop;

  return query
  select v_code, v_offer.referrer_sessions, v_offer.referee_sessions, v_offer.min_amount_minor, v_offer.currency::text,
         (select pk.title from public.packages pk where pk.id = v_offer.package_id), v_offer.active_to,
         coalesce((
           select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('status', r.status, 'created_at', r.created_at,
                    'first_name', p.first_name) order by r.created_at desc)
           from public.referrals r join public.profiles p on p.id = r.referee_id
           where r.referrer_coaching_id = v_pair.id and r.status <> 'void'), '[]'::jsonb);
end $$;

comment on function public.client_referral(uuid) is
  'Client: their referral link and the trainer''s live offer in a live pair, with the friends who came by it.';
revoke all on function public.client_referral(uuid) from public, anon;
grant execute on function public.client_referral(uuid) to authenticated;

-- A referral link for whoever opens it, like resolve_client_invite: invalid, unavailable (blocked trainer), own
-- (the trainer), self (the client whose link it is), joined (with coaching_id) or valid, with the trainer card,
-- the first name of the client who shares it and the sessions the friend gets while the offer is live.
create function public.resolve_referral(p_code text)
returns table (
  status text, trainer_id uuid, first_name text, last_name text, photo_url text, headline text, specialties text[],
  works_offline boolean, works_online boolean, verified boolean, coaching_id uuid, referrer_first_name text,
  referee_sessions smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_pair  public.coachings;
  v_own   public.coachings;
  v_offer public.referral_offers;
begin
  v_pair := private.find_referral_code(p_code);
  if v_pair.id is null then
    status := 'invalid';
    return next;
    return;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_pair.trainer_id and p.blocked_at is not null) then
    status := 'unavailable';
    return next;
    return;
  end if;
  select c.* into v_own from public.coachings c where c.trainer_id = v_pair.trainer_id and c.client_id = v_user;
  status := case
    when v_user = v_pair.trainer_id then 'own'
    when v_user = v_pair.client_id then 'self'
    when v_own.id is not null and v_own.status <> 'ended' then 'joined'
    else 'valid'
  end;
  coaching_id := case when status = 'joined' then v_own.id end;
  select o.* into v_offer from public.referral_offers o where o.trainer_id = v_pair.trainer_id and o.archived_at is null;
  referee_sessions := case when private.referral_offer_live(v_offer) and v_offer.referee_sessions > 0
                           then v_offer.referee_sessions end;
  select p.first_name into referrer_first_name from public.profiles p where p.id = v_pair.client_id;

  select v_pair.trainer_id, p.first_name, p.last_name, p.photo_url, t.headline, t.specialties,
         t.works_offline, t.works_online, t.verification_status = 'verified'
  into trainer_id, first_name, last_name, photo_url, headline, specialties, works_offline, works_online, verified
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  where t.user_id = v_pair.trainer_id;
  return next;
end $$;

comment on function public.resolve_referral(text) is
  'Status of a referral link for the caller with the trainer card: valid, invalid, unavailable, own, self or '
  'joined (with coaching_id).';
revoke all on function public.resolve_referral(text) from public;
grant execute on function public.resolve_referral(text) to anon, authenticated;

-- «Стать клиентом» by a referral link: the caller joins the trainer like by the client link (the Free limit and
-- account checks of join_pair apply). A person new to the trainer, while the offer is live, becomes a pending
-- referral of the client who shared the link (§3.1-3, §3.1-4). Raises invite_invalid for an unknown link or a
-- pair that ended, trainer_unavailable for a blocked trainer.
create function public.join_by_referral(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_pair  public.coachings;
  v_offer public.referral_offers;
  v_new   boolean;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_pair := private.find_referral_code(p_code);
  if v_pair.id is null then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_pair.trainer_id and p.blocked_at is not null) then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  if v_user = v_pair.trainer_id then
    raise exception 'own_invite' using errcode = 'P0001';
  end if;

  v_new := not exists (select 1 from public.coachings c where c.trainer_id = v_pair.trainer_id and c.client_id = v_user);
  v_id := private.join_pair(v_pair.trainer_id, 'referral', null, null);

  select o.* into v_offer from public.referral_offers o where o.trainer_id = v_pair.trainer_id and o.archived_at is null;
  if v_new and private.referral_offer_live(v_offer) then
    insert into public.referrals (offer_id, trainer_id, referrer_id, referee_id, coaching_id, referrer_coaching_id)
    values (v_offer.id, v_pair.trainer_id, v_pair.client_id, v_user, v_id, v_pair.id)
    on conflict (coaching_id) do nothing;
  end if;
  return v_id;
end $$;

comment on function public.join_by_referral(text) is
  'Joins the trainer by a client''s referral link and, for a person new to the trainer while the offer is live, '
  'records a pending referral. Raises invite_invalid, trainer_unavailable or own_invite (and what join_pair raises).';
revoke all on function public.join_by_referral(text) from public, anon;
grant execute on function public.join_by_referral(text) to authenticated;

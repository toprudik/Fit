-- Referral bonus sessions go into the active pass (PRD wave-3 §3.1-6): instead of a separate bonus pass, each
-- side's sessions are added to its active pass by an adjustment at price 0. Without an active pass the bonus
-- waits (pending) and goes into the next pass of that pair as soon as it is granted. A pass earns its price over
-- its first N sessions only (private.pass_share_minor), so the added sessions never count as earned money.
--   * bonuses.coaching_id: the pair a sessions bonus belongs to, so a pending one finds its next pass.
--   * private.referral_bonus_pass: the active pass of a pair a bonus goes into.
--   * private.grant_referral_bonus gains p_prefer (the friend's paid pass); qualify_referral counts pending
--     bonuses towards the limit of 10; revoke_referral takes back what is left of the bonus sessions.
--   * Trigger ledger_entries_referral_bonus: a grant of a regular pass takes the pair's pending bonuses.
-- Bonus passes made before this migration (passes.is_bonus) keep working and are taken back as before.

alter table public.bonuses add column coaching_id uuid references public.coachings (id) on delete set null;
comment on column public.bonuses.coaching_id is
  'Sessions bonus: the pair whose pass gets the sessions; a pending bonus goes into its next pass.';
update public.bonuses b set coaching_id = p.coaching_id from public.passes p where p.id = b.pass_id;
create index bonuses_coaching_idx on public.bonuses (coaching_id);

comment on table public.bonuses is
  'A bonus of a referral: sessions added to the active pass of a pair, or waiting for its next pass (PRD wave-3 '
  '§3.1-6), taken back with the payment while unused (§3.1-7); or a plan bonus of a trainer (§3.2).';

-- The active pass of the pair a bonus goes into: a live regular pass (not a drop-in or an old bonus pass) with
-- sessions left, p_prefer first, then the one that lasts longest. Null when the pair has none.
create function private.referral_bonus_pass(p_coaching_id uuid, p_prefer uuid default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pb.pass_id
  from public.pass_balances pb
  join public.passes p on p.id = pb.pass_id
  where pb.coaching_id = p_coaching_id
    and p.status = 'active' and not p.is_bonus and not p.is_drop_in
    and pb.status in ('active', 'frozen')
  order by pb.pass_id = p_prefer desc nulls last, pb.effective_expires_at desc nulls first, p.starts_on desc,
           p.created_at desc, p.id
  limit 1
$$;

comment on function private.referral_bonus_pass(uuid, uuid) is
  'The active regular pass of a pair that referral bonus sessions go into, p_prefer first; null when none.';
revoke all on function private.referral_bonus_pass(uuid, uuid) from public;

drop function private.grant_referral_bonus(public.referrals, uuid, integer, public.currency_code, text);

-- Gives one side of a qualified referral its sessions: an adjustment of the active pass of that side's pair, the
-- debt it settles, the bonus row and a message (К-referral_bonus). Without an active pass the bonus is pending
-- and the message says it waits for the next pass. Nothing for a pair that is not live.
create function private.grant_referral_bonus(
  p_referral public.referrals,
  p_coaching_id uuid,
  p_sessions integer,
  p_side text,
  p_prefer uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair   public.coachings;
  v_pass   uuid;
  v_friend uuid;
begin
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_pair.id is null or v_pair.status = 'ended' or p_sessions <= 0 then
    return;
  end if;

  v_pass := private.referral_bonus_pass(v_pair.id, p_prefer);
  if v_pass is not null then
    perform 1 from public.passes p where p.id = v_pass for no key update;
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
    values (v_pair.id, 'adjustment', v_pass, p_sessions, 0, pg_catalog.now(), 'referral_bonus');
    perform private.settle_debt(v_pass);
    insert into public.bonuses (referral_id, beneficiary_id, kind, sessions, coaching_id, pass_id, status, granted_at)
    values (p_referral.id, v_pair.client_id, 'sessions', p_sessions, v_pair.id, v_pass, 'granted', pg_catalog.now());
  else
    insert into public.bonuses (referral_id, beneficiary_id, kind, sessions, coaching_id, status)
    values (p_referral.id, v_pair.client_id, 'sessions', p_sessions, v_pair.id, 'pending');
  end if;

  v_friend := case when p_side = 'referrer' then p_referral.referee_id else p_referral.referrer_id end;
  perform private.enqueue_notification(
    'referral_bonus',
    pg_catalog.format('referral_bonus:%s:%s', p_referral.id, p_side),
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'pass_id', v_pass, 'sessions', p_sessions, 'side', p_side, 'waiting', v_pass is null,
      'friend', private.person_name(v_friend), 'trainer', private.person_name(v_pair.trainer_id))),
    v_pair.client_id);
end $$;

revoke all on function private.grant_referral_bonus(public.referrals, uuid, integer, text, uuid) from public;

-- A confirmed incoming payment in a friend's pair: the pending referral qualifies when the payment meets its
-- offer (Q50, §3.1-5): the package of the paid pass, or the sum in the offer's currency. The client who brought
-- the friend gets at most 10 bonuses per offer, waiting ones included (§3.1-8); the friend gets theirs either way,
-- into the pass they paid for.
create or replace function private.qualify_referral(p_payment public.payments)
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
  where r.offer_id = v_offer.id and b.beneficiary_id = v_referral.referrer_id and b.status in ('granted', 'pending');
  if v_granted < 10 then
    perform private.grant_referral_bonus(v_referral, v_referral.referrer_coaching_id, v_offer.referrer_sessions,
                                         'referrer');
  end if;
  perform private.grant_referral_bonus(v_referral, v_referral.coaching_id, v_offer.referee_sessions, 'referee',
                                       p_payment.pass_id);
end $$;

-- The qualifying payment is voided: within 14 days of the qualification the bonuses are taken back and the
-- referral is void (§3.1-7). A waiting bonus is void. A bonus in a pass takes back what is still free of its
-- sessions; one that is used up stays. An old bonus pass is cancelled with a refund of the rest unless it has
-- been used. After 14 days everything stays.
create or replace function private.revoke_referral(p_payment public.payments)
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
  v_bonus_pass boolean;
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
    where b.referral_id = v_referral.id and b.status in ('granted', 'pending')
    for update
  loop
    if v_bonus.status = 'pending' or v_bonus.pass_id is null then
      update public.bonuses b set status = 'void', voided_at = pg_catalog.now() where b.id = v_bonus.id;
      continue;
    end if;

    select p.is_bonus into v_bonus_pass from public.passes p where p.id = v_bonus.pass_id for no key update;
    if v_bonus_pass then
      continue when exists (select 1 from public.ledger_entries e
                            where e.pass_id = v_bonus.pass_id and e.entry_type in ('charge', 'settlement'));
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
    else
      -- Sessions of the pass that are neither used nor booked, at most the bonus.
      select least(v_bonus.sessions, greatest(pb.available, 0)) into v_left
      from public.pass_balances pb join public.passes p on p.id = pb.pass_id
      where pb.pass_id = v_bonus.pass_id and p.status = 'active';
      continue when coalesce(v_left, 0) = 0;
      insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
      select p.coaching_id, 'adjustment', p.id, -v_left, 0, pg_catalog.now(), 'referral_bonus_voided'
      from public.passes p where p.id = v_bonus.pass_id;
    end if;
    update public.bonuses b set status = 'void', voided_at = pg_catalog.now() where b.id = v_bonus.id;
  end loop;

  update public.referrals r
  set status = 'void', voided_at = pg_catalog.now(), void_reason = 'payment_voided'
  where r.id = v_referral.id;
end $$;

-- A new regular pass of a pair takes the bonus sessions waiting for it (§3.1-6): an adjustment per bonus, the
-- bonus is granted with this pass, and the client is told. The pass's own debt settlement follows its grant.
create function private.ledger_entries_referral_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass   public.passes;
  v_bonus  record;
begin
  select p.* into v_pass from public.passes p where p.id = new.pass_id;
  if v_pass.id is null or v_pass.is_bonus or v_pass.is_drop_in or v_pass.status <> 'active' then
    return null;
  end if;

  for v_bonus in
    select b.id, b.sessions, b.beneficiary_id, r.referrer_id, r.referee_id
    from public.bonuses b join public.referrals r on r.id = b.referral_id
    where b.coaching_id = v_pass.coaching_id and b.kind = 'sessions' and b.status = 'pending'
    order by b.created_at, b.id
    for update of b
  loop
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, note)
    values (v_pass.coaching_id, 'adjustment', v_pass.id, v_bonus.sessions, 0, pg_catalog.now(), 'referral_bonus');
    update public.bonuses b set status = 'granted', granted_at = pg_catalog.now(), pass_id = v_pass.id
    where b.id = v_bonus.id;
    perform private.enqueue_notification(
      'referral_bonus',
      pg_catalog.format('referral_bonus_applied:%s', v_bonus.id),
      pg_catalog.jsonb_build_object(
        'pass_id', v_pass.id, 'sessions', v_bonus.sessions, 'applied', true,
        'side', case when v_bonus.beneficiary_id = v_bonus.referrer_id then 'referrer' else 'referee' end,
        'friend', private.person_name(case when v_bonus.beneficiary_id = v_bonus.referrer_id
                                           then v_bonus.referee_id else v_bonus.referrer_id end),
        'trainer', private.person_name(v_pass.trainer_id)),
      v_bonus.beneficiary_id);
  end loop;
  return null;
end $$;

comment on function private.ledger_entries_referral_bonus() is
  'Trigger: the grant of a regular pass adds the referral bonus sessions waiting in its pair (PRD wave-3 §3.1-6).';
revoke all on function private.ledger_entries_referral_bonus() from public;

create trigger ledger_entries_referral_bonus
  after insert on public.ledger_entries
  for each row when (new.entry_type = 'grant')
  execute function private.ledger_entries_referral_bonus();

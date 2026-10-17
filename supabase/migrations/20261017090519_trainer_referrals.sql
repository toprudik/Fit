-- Trainers bring trainers (PRD wave-3 §3.2, decisions Q15, Q50, Q55, Q59): every trainer has a reusable
-- referral code of the same shape as an admin invite, so the link (startapp=ti_<code>) and the redeem screen are
-- the ones admins already use. A person who redeems it becomes a trainer at once (Free until an admin grants Pro)
-- and a trainer_to_trainer referral is recorded with a pending bonus for the referrer. Plans cannot be bought in
-- the beta, so the bonus stays pending (§3.2-11); an admin sets its size (§3.2-12). Rejecting the invited
-- trainer's verification voids the referral (acceptance 3.8). Client referrals: 20261017040300_referral_offers.sql.

alter type public.referral_void_reason add value 'verification_rejected';

-- A trainer referral has no pair: trainer_id and coaching_id stay empty, and one person is invited only once.
alter table public.referrals alter column trainer_id drop not null;
alter table public.referrals alter column coaching_id drop not null;
alter table public.referrals add constraint referrals_kind_pair_check check (
  (kind = 'client_to_client') = (trainer_id is not null and coaching_id is not null)
);
create unique index referrals_trainer_referee_key on public.referrals (referee_id) where kind = 'trainer_to_trainer';

comment on table public.referrals is
  'A friend who joined a trainer by a client''s referral link (PRD wave-3 §3.1), or a trainer invited by another '
  'trainer (§3.2, no pair). Pending until it qualifies (a matching payment; for trainers, a bought plan), void '
  'when declined, when a pair ends, when the payment is voided or when the invited trainer''s verification is '
  'rejected.';

alter table public.bonuses add column discount_percent smallint check (discount_percent between 1 and 100);
alter table public.bonuses add constraint bonuses_kind_discount_check check (
  (kind = 'plan_discount') = (discount_percent is not null)
);

-- trainer_referral_codes -----------------------------------------------------------------------------------------

create table public.trainer_referral_codes (
  trainer_id uuid primary key references public.trainer_profiles (user_id) on delete cascade,
  code       text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$'),
  created_at timestamptz not null default now()
);

comment on table public.trainer_referral_codes is
  'A trainer''s reusable code for inviting trainers (PRD wave-3 §3.2-9), made on first use. Same alphabet and '
  'length as trainer invites; unlike them it is not secret, so it is kept as is rather than hashed.';

alter table public.trainer_referral_codes enable row level security;
revoke all on table public.trainer_referral_codes from anon, authenticated;

-- trainer_referral_terms -----------------------------------------------------------------------------------------

create table public.trainer_referral_terms (
  id               boolean primary key default true check (id),
  bonus_kind       public.bonus_kind not null default 'plan_month' check (bonus_kind in ('plan_month', 'plan_discount')),
  discount_percent smallint check (discount_percent between 1 and 100),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null,
  constraint trainer_referral_terms_discount_check check ((bonus_kind = 'plan_discount') = (discount_percent is not null))
);

comment on table public.trainer_referral_terms is
  'The one row of the bonus a trainer gets for an invited trainer: a month of Pro or a plan discount, set by '
  'admins (PRD wave-3 §3.2-10, §3.2-12). New referrals copy it into their pending bonus.';

create index trainer_referral_terms_updated_by_idx on public.trainer_referral_terms (updated_by);

alter table public.trainer_referral_terms enable row level security;
revoke all on table public.trainer_referral_terms from anon, authenticated;

insert into public.trainer_referral_terms (id) values (true);

-- Helpers -------------------------------------------------------------------------------------------------------

create function private.gen_trainer_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  -- Never the code of an admin invite either: redeeming looks at invites first.
  loop
    v_code := private.gen_trainer_invite_code();
    exit when not exists (select 1 from public.trainer_referral_codes c where c.code = v_code)
      and not exists (select 1 from public.trainer_invites ti where ti.code_hash = private.trainer_invite_code_hash(v_code));
  end loop;
  return v_code;
end $$;

comment on function private.gen_trainer_referral_code() is 'Free 12-character trainer referral code, never equal to an invite code.';
revoke all on function private.gen_trainer_referral_code() from public;
grant execute on function private.gen_trainer_referral_code() to service_role;

-- The trainer behind a referral code, whatever separators or case it was typed with; null when there is none.
create function private.trainer_referral_owner(p_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select c.trainer_id from public.trainer_referral_codes c where c.code = private.normalize_trainer_invite_code(p_code)
$$;

comment on function private.trainer_referral_owner(text) is 'Trainer whose referral code this is, or null.';
revoke all on function private.trainer_referral_owner(text) from public;
grant execute on function private.trainer_referral_owner(text) to service_role;

-- trainer_invite_status: referral codes too ---------------------------------------------------------------------

create or replace function public.trainer_invite_status(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.trainer_invites;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_trainer() then
    return 'already_trainer';
  end if;

  select ti.* into v_invite from public.trainer_invites ti where ti.code_hash = private.trainer_invite_code_hash(p_code);
  return case
    when v_invite.id is null and private.trainer_referral_owner(p_code) is not null then 'referral'
    when v_invite.id is null then 'invalid'
    when v_invite.revoked_at is not null then 'revoked'
    when v_invite.redeemed_at is not null then 'redeemed'
    when v_invite.expires_at <= pg_catalog.now() then 'expired'
    else 'valid'
  end;
end $$;

comment on function public.trainer_invite_status(text) is
  'Status of a trainer invite code for the caller: valid, redeemed, expired, revoked, invalid, referral (another '
  'trainer''s referral code, always usable) or already_trainer when the caller has a trainer profile (the code is '
  'then left alone).';

-- redeem_trainer_invite: referral codes too ---------------------------------------------------------------------

-- Opens the trainer zone right away (Q15, Q55): the profile starts as not_submitted, and the profile wizard
-- fills in the rest. The invite row is locked, so two people racing for one code get one profile between them.
-- A referral code can be used by anyone any number of times; each use records who brought whom.
create or replace function public.redeem_trainer_invite(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.trainer_invites;
  v_referrer uuid;
  v_terms public.trainer_referral_terms;
  v_referral uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_trainer() then
    raise exception 'already_trainer' using errcode = 'P0001', detail = 'the invite was not used';
  end if;

  select ti.* into v_invite
  from public.trainer_invites ti
  where ti.code_hash = private.trainer_invite_code_hash(p_code)
  for update;
  if v_invite.id is null then
    v_referrer := private.trainer_referral_owner(p_code);
    if v_referrer is null then
      raise exception 'invite_invalid' using errcode = 'P0001';
    end if;
  elsif v_invite.revoked_at is not null then
    raise exception 'invite_revoked' using errcode = 'P0001';
  elsif v_invite.redeemed_at is not null then
    raise exception 'invite_redeemed' using errcode = 'P0001';
  elsif v_invite.expires_at <= pg_catalog.now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  begin
    insert into public.trainer_profiles (user_id, slug, trainer_invite_id)
    values (v_user, private.gen_trainer_slug(), v_invite.id);
  exception when unique_violation then
    -- The same user redeeming two invites at once: the other call made them a trainer first.
    raise exception 'already_trainer' using errcode = 'P0001', detail = 'the invite was not used';
  end;

  if v_invite.id is not null then
    update public.trainer_invites ti
    set redeemed_by = v_user, redeemed_at = pg_catalog.now()
    where ti.id = v_invite.id;
  else
    -- The bonus waits for the invited trainer to buy a plan, which the beta does not sell (§3.2-10, §3.2-11).
    -- A person who was a trainer before and came back keeps the first referral only.
    insert into public.referrals (kind, referrer_id, referee_id)
    values ('trainer_to_trainer', v_referrer, v_user)
    on conflict (referee_id) where kind = 'trainer_to_trainer' do nothing
    returning id into v_referral;
    if v_referral is not null then
      select t.* into v_terms from public.trainer_referral_terms t;
      insert into public.bonuses (referral_id, beneficiary_id, kind, discount_percent)
      values (v_referral, v_referrer, v_terms.bonus_kind, v_terms.discount_percent);
    end if;
  end if;

  -- "/" opens the new zone from now on, on every device (ADR 0015).
  update public.user_settings s set last_zone = 'trainer' where s.user_id = v_user;
end $$;

comment on function public.redeem_trainer_invite(text) is
  'Makes the caller a trainer with a valid invite code or another trainer''s referral code: creates '
  'trainer_profiles (not_submitted, random slug), marks the invite redeemed or records a trainer_to_trainer '
  'referral with a pending bonus for the referrer, and sets the last zone to trainer. Raises already_trainer '
  '(the code stays unused), invite_invalid, invite_revoked, invite_redeemed or invite_expired (TINV-2, TINV-3, '
  'PRD wave-3 §3.2-9).';

-- Rejected verification voids the referral (acceptance 3.8) -------------------------------------------------------

-- The trainer keeps access and clients (Q55); only the referral and its pending bonus go.
create function private.void_trainer_referral_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with voided as (
    update public.referrals r
    set status = 'void', voided_at = pg_catalog.now(), void_reason = 'verification_rejected'
    where r.kind = 'trainer_to_trainer' and r.referee_id = new.trainer_id and r.status = 'pending'
    returning r.id
  )
  update public.bonuses b
  set status = 'void', voided_at = pg_catalog.now()
  from voided
  where b.referral_id = voided.id and b.status = 'pending';
  return null;
end $$;

comment on function private.void_trainer_referral_on_rejection() is
  'Trigger: a rejected verification voids the invited trainer''s pending referral and its bonus (PRD wave-3 3.8).';
revoke all on function private.void_trainer_referral_on_rejection() from public;

create trigger trainer_verifications_void_referral
after insert on public.trainer_verifications
for each row when (new.decision = 'rejected')
execute function private.void_trainer_referral_on_rejection();

-- trainer_referral_terms (read) ----------------------------------------------------------------------------------

create function public.trainer_referral_terms()
returns table (bonus_kind public.bonus_kind, discount_percent smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.bonus_kind, t.discount_percent from public.trainer_referral_terms t
  where auth.uid() is not null and (private.is_trainer() or private.is_admin())
$$;

comment on function public.trainer_referral_terms() is
  'The bonus for an invited trainer, for trainers and admins (PRD wave-3 §3.2-10); no row for anyone else.';
revoke all on function public.trainer_referral_terms() from public, anon;
grant execute on function public.trainer_referral_terms() to authenticated;

-- admin_set_trainer_referral_bonus -------------------------------------------------------------------------------

-- Changes the bonus for referrals made from now on; pending bonuses keep what they were promised.
create function public.admin_set_trainer_referral_bonus(p_kind public.bonus_kind, p_discount_percent smallint default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins set the trainer referral bonus';
  end if;
  if p_kind is null or p_kind not in ('plan_month', 'plan_discount')
     or (p_kind = 'plan_discount') <> (p_discount_percent is not null)
     or p_discount_percent not between 1 and 100 then
    raise exception 'bonus_invalid' using errcode = '22023',
      detail = 'a month of Pro, or a plan discount of 1 to 100 percent';
  end if;

  update public.trainer_referral_terms t
  set bonus_kind = p_kind, discount_percent = p_discount_percent, updated_at = pg_catalog.now(), updated_by = auth.uid()
  where t.id;

  insert into public.admin_audit_log (actor_id, action, target_type, metadata)
  values (auth.uid(), 'trainer_referral.set_bonus', 'trainer_referral_terms',
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind', p_kind, 'discount_percent', p_discount_percent)));
end $$;

comment on function public.admin_set_trainer_referral_bonus(public.bonus_kind, smallint) is
  'Admin: sets the bonus for an invited trainer, plan_month or plan_discount with a percent (PRD wave-3 '
  '§3.2-12). Applies to new referrals. Audited as trainer_referral.set_bonus. Raises forbidden or bonus_invalid.';
revoke all on function public.admin_set_trainer_referral_bonus(public.bonus_kind, smallint) from public, anon;
grant execute on function public.admin_set_trainer_referral_bonus(public.bonus_kind, smallint) to authenticated;

-- my_trainer_referral --------------------------------------------------------------------------------------------

-- The trainer's code (made on first call) and the trainers it brought, newest first: their first name, when they
-- came, where the referral is and where their bonus is. Nothing else about the invited trainer.
create function public.my_trainer_referral()
returns table (code text, trainers jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.is_trainer() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only trainers invite trainers';
  end if;

  insert into public.trainer_referral_codes (trainer_id, code)
  values (v_user, private.gen_trainer_referral_code())
  on conflict (trainer_id) do nothing;

  select c.code into code from public.trainer_referral_codes c where c.trainer_id = v_user;
  trainers := coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', r.id, 'first_name', p.first_name, 'created_at', r.created_at, 'status', r.status,
             'void_reason', r.void_reason, 'bonus_kind', b.kind, 'discount_percent', b.discount_percent,
             'bonus_status', b.status) order by r.created_at desc)
    from public.referrals r
    join public.profiles p on p.id = r.referee_id
    left join public.bonuses b on b.referral_id = r.id and b.beneficiary_id = v_user
    where r.kind = 'trainer_to_trainer' and r.referrer_id = v_user), '[]'::jsonb);
  return next;
end $$;

comment on function public.my_trainer_referral() is
  'Trainer: their referral code for inviting trainers (made on first call) and the trainers who came by it with '
  'referral and bonus status (PRD wave-3 §3.2-9, §3.2-11). Raises forbidden for anyone who is not a trainer.';
revoke all on function public.my_trainer_referral() from public, anon;
grant execute on function public.my_trainer_referral() to authenticated;

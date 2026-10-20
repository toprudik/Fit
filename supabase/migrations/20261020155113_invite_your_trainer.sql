-- "Пригласи своего тренера" (marketing backlog 16, decision 20.10 changing Q15): anyone who is not a trainer has a
-- reusable code of the same shape as a trainer invite, so the link opens the redeem screen admins and trainers
-- already use. A person who redeems it becomes a trainer at once, with no admin invite (Free, like a trainer
-- referral), and the person who invited them gets a bot message. The pair is not made here: the inviter starts it
-- from /invite-trainer with join_invited_trainer, so the client's own consent steps for a new pair still apply.
--
-- trainer_invite_status and redeem_trainer_invite are the bodies of 20261017090519_trainer_referrals.sql with the
-- inviter codes added after invites and trainer referral codes.

alter type public.coaching_source add value 'invited_trainer';
alter type public.notification_type add value 'invited_trainer_joined';

-- trainer_inviter_codes ------------------------------------------------------------------------------------------

create table public.trainer_inviter_codes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  code       text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$'),
  created_at timestamptz not null default now()
);

comment on table public.trainer_inviter_codes is
  'A person''s reusable code for inviting their own trainer to DaFit (marketing backlog 16), made on first use. '
  'Same alphabet and length as trainer invites and, like trainer referral codes, not secret.';

alter table public.trainer_inviter_codes enable row level security;
revoke all on table public.trainer_inviter_codes from anon, authenticated;

-- invited_trainers -----------------------------------------------------------------------------------------------

create table public.invited_trainers (
  trainer_id uuid primary key references public.trainer_profiles (user_id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.invited_trainers is
  'Trainers who became trainers by a person''s inviter code, and who invited them; a trainer counts once.';

create index invited_trainers_inviter_id_idx on public.invited_trainers (inviter_id, created_at desc);

alter table public.invited_trainers enable row level security;
revoke all on table public.invited_trainers from anon, authenticated;

-- Helpers -------------------------------------------------------------------------------------------------------

-- The person behind an inviter code, whatever separators or case it was typed with; null when there is none.
create function private.trainer_inviter_owner(p_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select c.user_id from public.trainer_inviter_codes c where c.code = private.normalize_trainer_invite_code(p_code)
$$;

comment on function private.trainer_inviter_owner(text) is 'Person whose inviter code this is, or null.';
revoke all on function private.trainer_inviter_owner(text) from public;

-- my_trainer_inviter_code ----------------------------------------------------------------------------------------

-- The caller's code, made on the first call. Never the code of an admin invite or a trainer referral code, since
-- redeeming looks at those first. A trainer has a referral code for other trainers instead (already_trainer).
create function public.my_trainer_inviter_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if private.is_trainer() then
    raise exception 'already_trainer' using errcode = 'P0001';
  end if;

  select c.code into v_code from public.trainer_inviter_codes c where c.user_id = v_user;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := private.gen_trainer_invite_code();
    exit when not exists (select 1 from public.trainer_inviter_codes c where c.code = v_code)
      and not exists (select 1 from public.trainer_referral_codes c where c.code = v_code)
      and not exists (select 1 from public.trainer_invites ti where ti.code_hash = private.trainer_invite_code_hash(v_code));
  end loop;
  insert into public.trainer_inviter_codes (user_id, code) values (v_user, v_code)
  on conflict (user_id) do nothing;
  -- Two first calls at once: both return the code that was stored.
  select c.code into v_code from public.trainer_inviter_codes c where c.user_id = v_user;
  return v_code;
end $$;

comment on function public.my_trainer_inviter_code() is
  'The caller''s reusable code for inviting their trainer to DaFit, made on first use; already_trainer for a trainer.';
revoke all on function public.my_trainer_inviter_code() from public, anon;
grant execute on function public.my_trainer_inviter_code() to authenticated;

-- my_invited_trainers --------------------------------------------------------------------------------------------

-- The trainers who came by the caller's code, newest first, with the caller's live pair with each (null when there
-- is none yet) and whether a pair can be started (the trainer is not blocked or being deleted).
create function public.my_invited_trainers()
returns table (
  trainer_id  uuid,
  first_name  text,
  last_name   text,
  photo_url   text,
  joined_at   timestamptz,
  coaching_id uuid,
  available   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
  select i.trainer_id, p.first_name, p.last_name, p.photo_url, i.created_at,
         (select c.id from public.coachings c
          where c.trainer_id = i.trainer_id and c.client_id = v_user and c.status <> 'ended'),
         p.blocked_at is null
           and not exists (select 1 from public.account_deletions d where d.user_id = i.trainer_id and d.cancelled_at is null)
  from public.invited_trainers i
  join public.profiles p on p.id = i.trainer_id
  where i.inviter_id = v_user
  order by i.created_at desc;
end $$;

comment on function public.my_invited_trainers() is
  'Trainers who came by the caller''s inviter code, with the caller''s live pair with each and whether a pair can start.';
revoke all on function public.my_invited_trainers() from public, anon;
grant execute on function public.my_invited_trainers() to authenticated;

-- join_invited_trainer -------------------------------------------------------------------------------------------

-- The inviter becomes the client of a trainer they invited, the same way as by the trainer's link (join_pair:
-- limits of the trainer's plan, a card of the trainer's to claim, an ended pair restored).
create function public.join_invited_trainer(p_trainer_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.invited_trainers i where i.trainer_id = p_trainer_id and i.inviter_id = v_user) then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_trainer_id and p.blocked_at is not null) then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  return private.join_pair(p_trainer_id, 'invited_trainer', null, null);
end $$;

comment on function public.join_invited_trainer(uuid) is
  'Starts (or restores) the caller''s pair with a trainer who came by the caller''s inviter code; not_invited otherwise.';
revoke all on function public.join_invited_trainer(uuid) from public, anon;
grant execute on function public.join_invited_trainer(uuid) to authenticated;

-- trainer_invite_status: inviter codes too -----------------------------------------------------------------------

create or replace function public.trainer_invite_status(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.trainer_invites;
  v_inviter uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_trainer() then
    return 'already_trainer';
  end if;

  select ti.* into v_invite from public.trainer_invites ti where ti.code_hash = private.trainer_invite_code_hash(p_code);
  if v_invite.id is null and private.trainer_referral_owner(p_code) is null then
    v_inviter := private.trainer_inviter_owner(p_code);
  end if;
  return case
    when v_invite.id is null and private.trainer_referral_owner(p_code) is not null then 'referral'
    -- The caller's own inviter code does not make them a trainer.
    when v_invite.id is null and v_inviter is not null and v_inviter <> auth.uid() then 'invited'
    when v_invite.id is null then 'invalid'
    when v_invite.revoked_at is not null then 'revoked'
    when v_invite.redeemed_at is not null then 'redeemed'
    when v_invite.expires_at <= pg_catalog.now() then 'expired'
    else 'valid'
  end;
end $$;

comment on function public.trainer_invite_status(text) is
  'Status of a trainer invite code for the caller: valid, redeemed, expired, revoked, invalid, referral (another '
  'trainer''s referral code, always usable), invited (a person''s code for inviting their trainer, always usable '
  'by anyone else) or already_trainer when the caller has a trainer profile (the code is then left alone).';

-- redeem_trainer_invite: inviter codes too -----------------------------------------------------------------------

-- Opens the trainer zone right away (Q15, Q55): the profile starts as not_submitted, and the profile wizard
-- fills in the rest. The invite row is locked, so two people racing for one code get one profile between them.
-- A referral code can be used by anyone any number of times; each use records who brought whom. An inviter code
-- works the same way for anyone but its owner, records the inviter and tells them in the bot.
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
  v_inviter uuid;
  v_terms public.trainer_referral_terms;
  v_referral uuid;
  v_trainer public.profiles;
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
      v_inviter := private.trainer_inviter_owner(p_code);
      if v_inviter is null or v_inviter = v_user then
        raise exception 'invite_invalid' using errcode = 'P0001';
      end if;
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
  elsif v_referrer is not null then
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
  else
    insert into public.invited_trainers (trainer_id, inviter_id) values (v_user, v_inviter);
    select p.* into v_trainer from public.profiles p where p.id = v_user;
    perform private.enqueue_notification(
      'invited_trainer_joined',
      'invited_trainer_joined:' || v_user::text,
      pg_catalog.jsonb_build_object('trainer_id', v_user, 'first_name', v_trainer.first_name,
        'last_name', v_trainer.last_name),
      v_inviter);
  end if;

  -- "/" opens the new zone from now on, on every device (ADR 0015).
  update public.user_settings s set last_zone = 'trainer' where s.user_id = v_user;
end $$;

comment on function public.redeem_trainer_invite(text) is
  'Makes the caller a trainer with a valid invite code, another trainer''s referral code or a person''s inviter '
  'code: creates trainer_profiles (not_submitted, random slug), marks the invite redeemed, records a '
  'trainer_to_trainer referral with a pending bonus for the referrer, or records the inviter and queues their bot '
  'message; sets the last zone to trainer. Raises already_trainer (the code stays unused), invite_invalid (also '
  'for the caller''s own inviter code), invite_revoked, invite_redeemed or invite_expired.';

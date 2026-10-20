-- How many colleagues a trainer brought and how many of them work (marketing backlog 6, ambassadors §4): an invited
-- trainer counts as active with 3 or more held sessions in the last 7 days, held as the owner statistics count it
-- (private.analytics_held_sessions, Q26). my_trainer_referral gains "active" per invited trainer, and admins get
-- every trainer who invited colleagues with the same numbers. Body of my_trainer_referral from
-- 20261017090519_trainer_referrals.sql.

-- Active invited trainer --------------------------------------------------------------------------------------------

create function private.trainer_is_active(p_trainer_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 3
  from private.analytics_held_sessions(pg_catalog.now() - interval '7 days', pg_catalog.now()) h
  where h.trainer_id = p_trainer_id
$$;

comment on function private.trainer_is_active(uuid) is
  'A trainer with 3 or more held sessions in the last 7 days (marketing backlog 6): how invited trainers are counted.';
revoke all on function private.trainer_is_active(uuid) from public;

-- my_trainer_referral: "active" per invited trainer -----------------------------------------------------------------

create or replace function public.my_trainer_referral()
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
             'bonus_status', b.status, 'active', private.trainer_is_active(r.referee_id)) order by r.created_at desc)
    from public.referrals r
    join public.profiles p on p.id = r.referee_id
    left join public.bonuses b on b.referral_id = r.id and b.beneficiary_id = v_user
    where r.kind = 'trainer_to_trainer' and r.referrer_id = v_user), '[]'::jsonb);
  return next;
end $$;

comment on function public.my_trainer_referral() is
  'Trainer: their referral code for inviting trainers (made on first call) and the trainers who came by it with '
  'referral and bonus status and whether each is active, 3+ held sessions in 7 days (PRD wave-3 §3.2-9, §3.2-11, '
  'marketing backlog 6). Raises forbidden for anyone who is not a trainer.';

-- admin_trainer_referrers --------------------------------------------------------------------------------------------

-- Only what the trainer sees on their own screen, per trainer who invited anyone, most invited first.
create function public.admin_trainer_referrers()
returns table (
  trainer_id     uuid,
  first_name     text,
  last_name      text,
  username       text,
  invited        integer,
  active         integer,
  bonuses_pending integer,
  bonuses_granted integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins see who invites trainers';
  end if;

  return query
  select r.referrer_id, p.first_name, p.last_name, p.username,
         count(*)::integer,
         count(*) filter (where r.status <> 'void' and private.trainer_is_active(r.referee_id))::integer,
         count(b.id) filter (where b.status = 'pending')::integer,
         count(b.id) filter (where b.status = 'granted')::integer
  from public.referrals r
  join public.profiles p on p.id = r.referrer_id
  left join public.bonuses b on b.referral_id = r.id and b.beneficiary_id = r.referrer_id
  where r.kind = 'trainer_to_trainer'
  group by r.referrer_id, p.first_name, p.last_name, p.username
  order by count(*) desc, p.first_name;
end $$;

comment on function public.admin_trainer_referrers() is
  'Admin: every trainer who invited trainers, with how many came, how many are active (3+ held sessions in 7 '
  'days, void referrals aside) and their pending and granted bonuses (marketing backlog 6). Raises forbidden.';
revoke all on function public.admin_trainer_referrers() from public, anon;
grant execute on function public.admin_trainer_referrers() to authenticated;

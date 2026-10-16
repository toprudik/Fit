-- Client links and the trainer code (PRD wave-1 §2.3 SHOP-2..4, §2.14 PLAN-1 and PLAN-9, §3 Т7 and Т7a;
-- data-model §2.1 "Ссылки клиента и на пробное", R91; decisions Q16, Q65). A trainer has a permanent link
-- with a QR and a six-character code; a signed-in person who opens the link or types the code becomes the
-- trainer's client without the trainer confirming it. Table and policies: 20261015120200_trainers_tables.sql
-- and 20261015123100_trainers_policies.sql; pairs are written only by the definer functions below.

-- The trainer's link ---------------------------------------------------------------------------------------

-- A link works while it is not archived, not expired and not used up. Archiving is final (SHOP-3).
create function private.client_invite_is_live(p_invite public.client_invites)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_invite.id is not null
    and p_invite.archived_at is null
    and (p_invite.expires_at is null or p_invite.expires_at > pg_catalog.now())
    and (p_invite.max_uses is null or p_invite.uses_count < p_invite.max_uses)
$$;

comment on function private.client_invite_is_live(public.client_invites) is
  'True while a client link is not archived, not expired and below its use limit.';
revoke all on function private.client_invite_is_live(public.client_invites) from public;

-- "QR и ссылки" and the profile wizard's last step show this link (screens.md: the client link is created
-- automatically). The trainer row is locked, so two screens opening at once still make one link.
create function public.my_client_invite()
returns table (invite_id uuid, token text, code text, uses_count integer, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.client_invites;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.trainer_profiles t where t.user_id = v_user for no key update;
  if not found then
    raise exception 'not_a_trainer' using errcode = 'P0001';
  end if;

  select ci.* into v_invite
  from public.client_invites ci
  where ci.trainer_id = v_user and private.client_invite_is_live(ci)
  order by ci.created_at desc
  limit 1;
  if v_invite.id is null then
    insert into public.client_invites (trainer_id) values (v_user) returning * into v_invite;
  end if;

  return query select v_invite.id, v_invite.token, v_invite.code, v_invite.uses_count, v_invite.created_at;
end $$;

comment on function public.my_client_invite() is
  'Trainer: the newest working client link (token, code, uses), created when there is none. Raises not_a_trainer.';
revoke all on function public.my_client_invite() from public, anon;
grant execute on function public.my_client_invite() to authenticated;

-- "Перевыпустить ссылку": every old link and its QR stop working at once (SHOP-3), the new one starts at 0.
create function public.reissue_client_invite()
returns table (invite_id uuid, token text, code text, uses_count integer, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.client_invites;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.trainer_profiles t where t.user_id = v_user for no key update;
  if not found then
    raise exception 'not_a_trainer' using errcode = 'P0001';
  end if;

  update public.client_invites ci set archived_at = pg_catalog.now()
  where ci.trainer_id = v_user and ci.archived_at is null;
  insert into public.client_invites (trainer_id) values (v_user) returning * into v_invite;

  return query select v_invite.id, v_invite.token, v_invite.code, v_invite.uses_count, v_invite.created_at;
end $$;

comment on function public.reissue_client_invite() is
  'Trainer: archives all their client links and returns a new one with a new token and code.';
revoke all on function public.reissue_client_invite() from public, anon;
grant execute on function public.reissue_client_invite() to authenticated;

-- Looking a link up ---------------------------------------------------------------------------------------

-- Codes are typed by hand: separators and case do not matter.
create function private.normalize_client_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

comment on function private.normalize_client_invite_code(text) is 'Trainer code without separators, in upper case.';
revoke all on function private.normalize_client_invite_code(text) from public;

-- The link by token or by code (exactly one of them), live or not. Null when nothing matches.
create function private.find_client_invite(p_token text, p_code text)
returns public.client_invites
language sql
stable
set search_path = ''
as $$
  select ci.*
  from public.client_invites ci
  where (p_token is not null and p_code is null and ci.token = p_token)
     or (p_code is not null and p_token is null and ci.code = private.normalize_client_invite_code(p_code))
$$;

comment on function private.find_client_invite(text, text) is 'Client link by token or by code; null when none or both are given.';
revoke all on function private.find_client_invite(text, text) from public;

-- What /i/<token> and /join show before anything happens. A link anyone may open shows the trainer card,
-- so a token works without sign-in; a code needs a signed-in caller, so codes cannot be tried out
-- anonymously. A dead link, a wrong code and a code of nobody look the same (SHOP-3, SHOP-4). A blocked
-- trainer shows nothing but "unavailable". A rejected trainer's link works, without the badge (TINV-7).
-- status: valid, invalid, unavailable, own (the caller's own link), joined (the caller is already a live
-- client; coaching_id says which pair). An ended pair counts as valid: joining again restores it.
create function public.resolve_client_invite(p_token text default null, p_code text default null)
returns table (
  status        text,
  trainer_id    uuid,
  first_name    text,
  last_name     text,
  photo_url     text,
  headline      text,
  specialties   text[],
  works_offline boolean,
  works_online  boolean,
  verified      boolean,
  coaching_id   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.client_invites;
  v_pair public.coachings;
begin
  if p_code is not null and v_user is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'sign in to use a trainer code';
  end if;

  v_invite := private.find_client_invite(p_token, p_code);
  if not private.client_invite_is_live(v_invite) then
    status := 'invalid';
    return next;
    return;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_invite.trainer_id and p.blocked_at is not null) then
    status := 'unavailable';
    return next;
    return;
  end if;

  select c.* into v_pair from public.coachings c where c.trainer_id = v_invite.trainer_id and c.client_id = v_user;
  status := case
    when v_user = v_invite.trainer_id then 'own'
    when v_pair.id is not null and v_pair.status <> 'ended' then 'joined'
    else 'valid'
  end;
  coaching_id := case when status = 'joined' then v_pair.id end;

  select v_invite.trainer_id, p.first_name, p.last_name, p.photo_url, t.headline, t.specialties,
         t.works_offline, t.works_online, t.verification_status = 'verified'
  into trainer_id, first_name, last_name, photo_url, headline, specialties, works_offline, works_online, verified
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  where t.user_id = v_invite.trainer_id;
  return next;
end $$;

comment on function public.resolve_client_invite(text, text) is
  'Status of a client link (by token, anyone) or trainer code (by code, signed-in only) for the caller, with '
  'the trainer card: valid, invalid, unavailable (blocked trainer, no card), own, joined (with coaching_id).';
revoke all on function public.resolve_client_invite(text, text) from public;
grant execute on function public.resolve_client_invite(text, text) to anon, authenticated;

-- Joining -------------------------------------------------------------------------------------------------

-- Shared body of join_by_invite and join_by_code. Order of checks:
--   1. the link is live, the trainer is not blocked, the caller is not the trainer;
--   2. a live pair is returned as it is: no duplicate, no new use, no message (SHOP edge case);
--   3. the Free limit (PLAN-1), except when the trainer has a card without an account: then the pair is
--      created anyway together with a pending "Is this <name>?" claim (R91, Q65, PLAN-9);
--   4. an ended pair comes back to life with default data shares; otherwise a new pair starts;
--   5. the link counts the use, the trainer gets Т7 (new client) or Т7a (the claim), and the caller's
--      last zone becomes the client zone (ADR 0015).
create function private.join_trainer(p_invite public.client_invites, p_source public.coaching_source)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_has_card boolean;
  v_claim uuid;
  v_client public.profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.client_invite_is_live(p_invite) then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_invite.trainer_id and p.blocked_at is not null) then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  if v_user = p_invite.trainer_id then
    raise exception 'own_invite' using errcode = 'P0001';
  end if;

  select c.* into v_pair from public.coachings c where c.trainer_id = p_invite.trainer_id and c.client_id = v_user;
  if v_pair.id is not null and v_pair.status <> 'ended' then
    return v_pair.id;
  end if;

  v_has_card := exists (
    select 1 from public.profiles p where p.managed_by_trainer_id = p_invite.trainer_id and p.claimed_by is null
  );
  if v_has_card then
    -- Same lock as assert_can_add_client, so joins of one trainer still run one after another.
    perform 1 from public.trainer_profiles t where t.user_id = p_invite.trainer_id for no key update;
  else
    perform private.assert_can_add_client(p_invite.trainer_id);
  end if;

  if v_pair.id is not null then
    update public.coachings c
    set status = 'active', ended_at = null, ended_by = null, end_reason = null
    where c.id = v_pair.id
    returning * into v_pair;
    -- Back to the client's defaults: the intake stays hidden until the consent step is answered again.
    update public.data_shares d
    set nutrition = true, measurements = true, photos = false, steps = true, intake = false,
        intake_decided_at = null, workouts = true
    where d.coaching_id = v_pair.id;
  else
    insert into public.coachings (trainer_id, client_id, source, client_invite_id)
    values (p_invite.trainer_id, v_user, p_source, p_invite.id)
    returning * into v_pair;
  end if;

  update public.client_invites ci set uses_count = ci.uses_count + 1 where ci.id = p_invite.id;

  select p.* into v_client from public.profiles p where p.id = v_user;
  if v_has_card then
    insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
    values (p_invite.trainer_id, v_user, v_pair.id)
    returning id into v_claim;
    perform private.enqueue_notification(
      'managed_client_claim', pg_catalog.format('managed_client_claim:%s', v_claim),
      pg_catalog.jsonb_build_object('claim_id', v_claim, 'coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_invite.trainer_id);
  else
    -- A pair that ends and starts again gets a new message each time.
    perform private.enqueue_notification(
      'coaching_created',
      pg_catalog.format('coaching_created:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
      pg_catalog.jsonb_build_object('coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_invite.trainer_id);
  end if;

  update public.user_settings s set last_zone = 'client' where s.user_id = v_user;
  return v_pair.id;
end $$;

comment on function private.join_trainer(public.client_invites, public.coaching_source) is
  'Makes the caller a client of the link''s trainer and returns the pair id; see join_by_invite.';
revoke all on function private.join_trainer(public.client_invites, public.coaching_source) from public;

create function public.join_by_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token is null then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  return private.join_trainer(private.find_client_invite(p_token, null), 'client_invite');
end $$;

comment on function public.join_by_invite(text) is
  'Signed-in caller joins the trainer of a client link without the trainer confirming (Q16) and gets the pair '
  'id. A live pair is returned unchanged; an ended one is restored with default data shares. Raises '
  'invite_invalid, trainer_unavailable, own_invite or plan_limit_reached (PLAN-1; skipped while the trainer has '
  'a card without an account, which queues a claim instead, PLAN-9).';
revoke all on function public.join_by_invite(text) from public, anon;
grant execute on function public.join_by_invite(text) to authenticated;

create function public.join_by_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_code is null then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  return private.join_trainer(private.find_client_invite(null, p_code), 'trainer_code');
end $$;

comment on function public.join_by_code(text) is
  'join_by_invite for a typed trainer code (any case, separators ignored); the pair source is trainer_code. '
  'A wrong code and a dead one both raise invite_invalid (SHOP-4).';
revoke all on function public.join_by_code(text) from public, anon;
grant execute on function public.join_by_code(text) to authenticated;

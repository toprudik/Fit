-- Trainer invites (PRD wave-1 §2.2 TINV-1..3, §4 ADM-1..3; data-model §4.2 trainer_invites, R13): the admin
-- creates and revokes invites, a signed-in user checks and redeems one. Tables and read policy:
-- 20261015120200_trainers_tables.sql and 20261015123100_trainers_policies.sql. Every write goes through the
-- definer functions below; the admin ones write admin_audit_log in the same transaction.

-- Codes are 12 characters of the same 32-letter alphabet as client codes (no 0, O, 1, I): 60 random bits,
-- typed by hand from the profile or carried in startapp=ti_<code>. The app shows them in groups of four
-- (ABCD-EFGH-JKLM); dashes, spaces and case do not matter, so the hash is taken of the normalized code.
create function private.normalize_trainer_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

comment on function private.normalize_trainer_invite_code(text) is
  'Trainer invite code without dashes, spaces or other separators, in upper case.';
revoke all on function private.normalize_trainer_invite_code(text) from public;
grant execute on function private.normalize_trainer_invite_code(text) to service_role;

create function private.trainer_invite_code_hash(p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(private.normalize_trainer_invite_code(p_code), 'sha256')
$$;

comment on function private.trainer_invite_code_hash(text) is 'sha256 of the normalized code: trainer_invites.code_hash.';
revoke all on function private.trainer_invite_code_hash(text) from public;
grant execute on function private.trainer_invite_code_hash(text) to service_role;

create function private.gen_trainer_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code text := '';
begin
  for i in 0..11 loop
    v_code := v_code || pg_catalog.substr(c_alphabet, pg_catalog.get_byte(v_bytes, i) % 32 + 1, 1);
  end loop;
  return v_code;
end $$;

comment on function private.gen_trainer_invite_code() is 'Random 12-character trainer invite code without look-alike characters.';
revoke all on function private.gen_trainer_invite_code() from public;
grant execute on function private.gen_trainer_invite_code() to service_role;

-- The showcase address a new trainer starts with. Random rather than the Telegram username, so nothing about
-- the account shows in a public URL until the trainer picks an address in the profile wizard.
create function private.gen_trainer_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_slug text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_slug := 'trainer-';
    for i in 0..5 loop
      v_slug := v_slug || pg_catalog.substr(c_alphabet, pg_catalog.get_byte(v_bytes, i) % 32 + 1, 1);
    end loop;
    exit when not exists (select 1 from public.trainer_profiles t where t.slug = v_slug);
  end loop;
  return v_slug;
end $$;

comment on function private.gen_trainer_slug() is 'Free random showcase slug trainer-xxxxxx for a new trainer profile.';
revoke all on function private.gen_trainer_slug() from public;
grant execute on function private.gen_trainer_slug() to service_role;

-- admin_create_trainer_invite ----------------------------------------------------------------------------

-- Returns the code itself exactly once: only its hash is stored, so a lost code means a new invite.
create function public.admin_create_trainer_invite(p_note text default null, p_valid_days integer default 14)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_code text;
  v_hash bytea;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins create trainer invites';
  end if;
  if p_valid_days is null or p_valid_days not between 1 and 90 then
    raise exception 'invalid_valid_days' using errcode = '22023', detail = 'an invite is valid for 1 to 90 days';
  end if;

  -- 60 random bits make a clash practically impossible; the loop keeps the unique index from ever failing.
  loop
    v_code := private.gen_trainer_invite_code();
    v_hash := private.trainer_invite_code_hash(v_code);
    exit when not exists (select 1 from public.trainer_invites ti where ti.code_hash = v_hash);
  end loop;

  insert into public.trainer_invites as ti (code_hash, code_hint, note, created_by, expires_at)
  values (v_hash, pg_catalog.right(v_code, 4), v_note, auth.uid(), pg_catalog.now() + pg_catalog.make_interval(days => p_valid_days))
  returning ti.id, ti.expires_at into invite_id, expires_at;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'trainer_invite.create', 'trainer_invite', invite_id,
          pg_catalog.jsonb_build_object('valid_days', p_valid_days));

  code := v_code;
  return next;
end $$;

comment on function public.admin_create_trainer_invite(text, integer) is
  'Admin: creates a one-time trainer invite valid for p_valid_days (1..90, default 14) and returns its code once. '
  'Audited as trainer_invite.create (ADM-1).';
revoke all on function public.admin_create_trainer_invite(text, integer) from public, anon;
grant execute on function public.admin_create_trainer_invite(text, integer) to authenticated;

-- admin_revoke_trainer_invite ----------------------------------------------------------------------------

create function public.admin_revoke_trainer_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins revoke trainer invites';
  end if;

  update public.trainer_invites ti
  set revoked_at = pg_catalog.now()
  where ti.id = p_invite_id and ti.redeemed_at is null and ti.revoked_at is null;
  if not found then
    if exists (select 1 from public.trainer_invites ti where ti.id = p_invite_id) then
      raise exception 'invite_not_revocable' using errcode = 'P0001', detail = 'the invite is already redeemed or revoked';
    end if;
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'trainer_invite.revoke', 'trainer_invite', p_invite_id);
end $$;

comment on function public.admin_revoke_trainer_invite(uuid) is
  'Admin: revokes an invite that is neither redeemed nor revoked; it stops working at once (ADM-2). '
  'Audited as trainer_invite.revoke. An expired invite can still be revoked.';
revoke all on function public.admin_revoke_trainer_invite(uuid) from public, anon;
grant execute on function public.admin_revoke_trainer_invite(uuid) to authenticated;

-- trainer_invite_status ----------------------------------------------------------------------------------

-- What the redeem screen shows before "Стать тренером". It never says who the invite was for or who used it.
create function public.trainer_invite_status(p_code text)
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
    when v_invite.id is null then 'invalid'
    when v_invite.revoked_at is not null then 'revoked'
    when v_invite.redeemed_at is not null then 'redeemed'
    when v_invite.expires_at <= pg_catalog.now() then 'expired'
    else 'valid'
  end;
end $$;

comment on function public.trainer_invite_status(text) is
  'Status of a trainer invite code for the caller: valid, redeemed, expired, revoked, invalid, or '
  'already_trainer when the caller has a trainer profile (the invite is then left alone).';
revoke all on function public.trainer_invite_status(text) from public, anon;
grant execute on function public.trainer_invite_status(text) to authenticated;

-- redeem_trainer_invite ----------------------------------------------------------------------------------

-- Opens the trainer zone right away (Q15, Q55): the profile starts as not_submitted, and the profile wizard
-- fills in the rest. The invite row is locked, so two people racing for one code get one profile between them.
create function public.redeem_trainer_invite(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.trainer_invites;
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
    raise exception 'invite_invalid' using errcode = 'P0001';
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

  update public.trainer_invites ti
  set redeemed_by = v_user, redeemed_at = pg_catalog.now()
  where ti.id = v_invite.id;

  -- "/" opens the new zone from now on, on every device (ADR 0015).
  update public.user_settings s set last_zone = 'trainer' where s.user_id = v_user;
end $$;

comment on function public.redeem_trainer_invite(text) is
  'Makes the caller a trainer with a valid invite code: creates trainer_profiles (not_submitted, random slug), '
  'marks the invite redeemed and sets the last zone to trainer. Raises already_trainer (the invite stays '
  'unused), invite_invalid, invite_revoked, invite_redeemed or invite_expired (TINV-2, TINV-3).';
revoke all on function public.redeem_trainer_invite(text) from public, anon;
grant execute on function public.redeem_trainer_invite(text) to authenticated;

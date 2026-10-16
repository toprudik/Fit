-- Basic admin section (PRD wave-1 §4 ADM-7, ADM-8, ADM-11; screens.md §3.5 «Обзор беты», «Пользователи»,
-- «Журнал действий»). Admins read the audit log, roles and ordinary profiles under RLS already; these definer
-- functions add what the column grants keep server-only (telegram_id, last_seen_at, the block) and counts over
-- tables admins do not read. They never return the content of a client's data: no intake, measurements,
-- photos, notes or logs (Q41, ADM-8), only whether things exist and how many.

-- Accounts an admin manages: real people, not a trainer's cards (PAIR-10) and not the deleted-client stub.
create function private.is_admin_visible_account(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()
  )
$$;

comment on function private.is_admin_visible_account(uuid) is
  'True for an account an admin may look up or block: not a trainer''s card and not the deleted-client stub.';
revoke all on function private.is_admin_visible_account(uuid) from public;

-- admin_overview -----------------------------------------------------------------------------------------

create function public.admin_overview()
returns table (
  users                 integer,
  trainers              integer,
  trainers_pending      integer,
  trainers_verified     integer,
  active_invites        integer,
  active_pairs          integer,
  blocked_users         integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins see the overview';
  end if;

  return query
  select
    (select count(*)::integer from public.profiles p
     where p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()),
    (select count(*)::integer from public.trainer_profiles),
    (select count(*)::integer from public.trainer_profiles t where t.verification_status = 'pending'),
    (select count(*)::integer from public.trainer_profiles t where t.verification_status = 'verified'),
    (select count(*)::integer from public.trainer_invites i
     where i.redeemed_at is null and i.revoked_at is null and (i.expires_at is null or i.expires_at > pg_catalog.now())),
    (select count(*)::integer from public.coachings c where c.status in ('trial', 'active')),
    (select count(*)::integer from public.profiles p where p.blocked_at is not null);
end $$;

comment on function public.admin_overview() is
  'Admin: beta counts for /admin (accounts, trainers by verification, active invites, live pairs, blocked).';
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- admin_search_users -------------------------------------------------------------------------------------

-- Search by name, @username or Telegram ID (screens.md «Пользователи»). An empty query lists the newest
-- accounts. Digits only are taken as a Telegram ID and also matched against names.
create function public.admin_search_users(p_query text default null, p_limit integer default 50)
returns table (
  user_id      uuid,
  first_name   text,
  last_name    text,
  username     text,
  photo_url    text,
  telegram_id  bigint,
  created_at   timestamptz,
  blocked      boolean,
  is_trainer   boolean,
  is_admin     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(pg_catalog.btrim(pg_catalog.ltrim(pg_catalog.btrim(p_query), '@')), '');
  v_pattern text;
  v_telegram_id bigint;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins search users';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023', detail = 'the limit is 1 to 100';
  end if;

  if v_query is not null then
    -- LIKE wildcards in the query are literal characters.
    v_pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_query ~ '^[0-9]{1,18}$' then
      v_telegram_id := v_query::bigint;
    end if;
  end if;

  return query
  select p.id, p.first_name, p.last_name, p.username, p.photo_url, p.telegram_id, p.created_at,
         p.blocked_at is not null,
         exists (select 1 from public.trainer_profiles t where t.user_id = p.id),
         exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin')
  from public.profiles p
  where p.managed_by_trainer_id is null
    and p.id <> private.deleted_client_id()
    and (
      v_query is null
      or p.telegram_id = v_telegram_id
      or p.username ilike v_pattern
      or pg_catalog.concat_ws(' ', p.first_name, p.last_name) ilike v_pattern
      or pg_catalog.concat_ws(' ', p.last_name, p.first_name) ilike v_pattern
    )
  order by (p.telegram_id = v_telegram_id) desc nulls last, p.created_at desc
  limit p_limit;
end $$;

comment on function public.admin_search_users(text, integer) is
  'Admin: accounts by name, @username or Telegram ID, newest first; an empty query lists the newest. '
  'Trainer cards and the deleted-client stub are never listed.';
revoke all on function public.admin_search_users(text, integer) from public, anon;
grant execute on function public.admin_search_users(text, integer) to authenticated;

-- admin_user_card ----------------------------------------------------------------------------------------

-- The user card (ADM-8): who it is, roles and zones, verification, dates, the block, and counts only.
create function public.admin_user_card(p_user_id uuid)
returns table (
  user_id               uuid,
  first_name            text,
  last_name             text,
  username              text,
  photo_url             text,
  telegram_id           bigint,
  language_code         text,
  created_at            timestamptz,
  last_seen_at          timestamptz,
  blocked_at            timestamptz,
  blocked_reason        text,
  is_admin              boolean,
  is_trainer            boolean,
  verification_status   public.verification_status,
  trainer_pairs         integer,
  trainer_active_pairs  integer,
  client_pairs          integer,
  client_active_pairs   integer,
  sessions_led          integer,
  bookings_made         integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins open user cards';
  end if;

  return query
  select p.id, p.first_name, p.last_name, p.username, p.photo_url, p.telegram_id, p.language_code,
         p.created_at, p.last_seen_at, p.blocked_at, p.blocked_reason,
         exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'),
         t.user_id is not null,
         t.verification_status,
         (select count(*)::integer from public.coachings c where c.trainer_id = p.id),
         (select count(*)::integer from public.coachings c where c.trainer_id = p.id and c.status in ('trial', 'active')),
         (select count(*)::integer from public.coachings c where c.client_id = p.id),
         (select count(*)::integer from public.coachings c where c.client_id = p.id and c.status in ('trial', 'active')),
         (select count(*)::integer from public.sessions s where s.trainer_id = p.id),
         (select count(*)::integer from public.bookings b where b.client_id = p.id)
  from public.profiles p
  left join public.trainer_profiles t on t.user_id = p.id
  where p.id = p_user_id and private.is_admin_visible_account(p.id);
end $$;

comment on function public.admin_user_card(uuid) is
  'Admin: one account for /admin/users/[id]: identity, roles, verification, dates, the block and counts of '
  'pairs, sessions and bookings, without their content (ADM-8). No row for cards, the stub or unknown ids.';
revoke all on function public.admin_user_card(uuid) from public, anon;
grant execute on function public.admin_user_card(uuid) to authenticated;

-- admin_block_user / admin_unblock_user ------------------------------------------------------------------

-- ADM-7: a blocked account cannot sign in (the sign-in routes check blocked_at, and the app also bans the
-- Supabase user so its refresh token stops working) and gets no bot messages (claim_outbox skips it).
-- Admins cannot be blocked: take the role away first, through a migration (PRD §4).
create function public.admin_block_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins block users';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023', detail = 'a block needs a reason';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023', detail = 'the reason is at most 500 characters';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_block_self' using errcode = 'P0001';
  end if;
  if not private.is_admin_visible_account(p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'admin') then
    raise exception 'cannot_block_admin' using errcode = 'P0001';
  end if;

  update public.profiles p
  set blocked_at = pg_catalog.now(), blocked_reason = v_reason
  where p.id = p_user_id and p.blocked_at is null;
  if not found then
    raise exception 'already_blocked' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'user.block', 'user', p_user_id, v_reason);
end $$;

comment on function public.admin_block_user(uuid, text) is
  'Admin: blocks an account with a required reason (ADM-7) and audits it as user.block. Raises reason_required, '
  'reason_too_long, cannot_block_self, cannot_block_admin, user_not_found or already_blocked.';
revoke all on function public.admin_block_user(uuid, text) from public, anon;
grant execute on function public.admin_block_user(uuid, text) to authenticated;

create function public.admin_unblock_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins unblock users';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023', detail = 'an unblock needs a reason';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023', detail = 'the reason is at most 500 characters';
  end if;

  update public.profiles p
  set blocked_at = null, blocked_reason = null
  where p.id = p_user_id and p.blocked_at is not null and private.is_admin_visible_account(p.id);
  if not found then
    raise exception 'not_blocked' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'user.unblock', 'user', p_user_id, v_reason);
end $$;

comment on function public.admin_unblock_user(uuid, text) is
  'Admin: lifts the block of an account with a required reason and audits it as user.unblock. Raises '
  'reason_required, reason_too_long or not_blocked.';
revoke all on function public.admin_unblock_user(uuid, text) from public, anon;
grant execute on function public.admin_unblock_user(uuid, text) to authenticated;

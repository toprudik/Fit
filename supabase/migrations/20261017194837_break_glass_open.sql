-- Emergency access (PRD wave-1 §4 ADM-13..15, ADR 0007, data-model assumption 26): an admin opens time-limited
-- access to some data categories of one user, with a reason. There is no screen in the beta: the function is
-- called from SQL with an admin session. Each call is logged and tells the user that access was opened.
-- While the grant is live, private.can_view() lets that admin read those categories (20261015122000_rls_helpers.sql).

-- Errors (message): forbidden (42501), invalid_reason, invalid_categories, invalid_minutes, own_account (22023),
-- not_found (P0002).
create function public.admin_open_break_glass(
  p_target_user uuid,
  p_categories public.share_category[],
  p_reason text,
  p_minutes integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_categories public.share_category[];
  v_at timestamptz := pg_catalog.now();
  v_expires timestamptz;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 20 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(distinct c order by c) into v_categories
  from pg_catalog.unnest(p_categories) as c
  where c is not null;
  if v_categories is null then
    raise exception 'invalid_categories' using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;
  if p_target_user = v_admin then
    raise exception 'own_account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_expires := v_at + pg_catalog.make_interval(mins => p_minutes);
  insert into public.break_glass_grants (admin_id, target_user_id, categories, reason, expires_at, created_at)
  values (v_admin, p_target_user, v_categories, v_reason, v_expires, v_at)
  returning id into v_id;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (v_admin, 'break_glass.open', 'user', p_target_user, v_reason,
          pg_catalog.jsonb_build_object('grant_id', v_id, 'categories', pg_catalog.to_jsonb(v_categories),
                                        'expires_at', v_expires));

  perform private.enqueue_notification(
    'break_glass', 'break_glass:' || v_id,
    pg_catalog.jsonb_build_object('grant_id', v_id, 'categories', pg_catalog.to_jsonb(v_categories),
                                  'reason', v_reason, 'expires_at', v_expires),
    p_target_user);
  return v_id;
end $$;

comment on function public.admin_open_break_glass(uuid, public.share_category[], text, integer) is
  'Admin: opens access to some data categories of one user for 1 to 60 minutes, with a reason of at least 20 '
  'characters; logs it and tells the user (ADM-13, ADM-14). Returns the grant id.';
revoke all on function public.admin_open_break_glass(uuid, public.share_category[], text, integer) from public, anon;
grant execute on function public.admin_open_break_glass(uuid, public.share_category[], text, integer) to authenticated;

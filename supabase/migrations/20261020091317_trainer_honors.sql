-- Trainer honors "Тренер-основатель" and "Амбассадор" (ambassador programme §1, §3; marketing backlog item 8). An
-- admin grants and takes them back with a reason, each step in admin_audit_log; the public showcase shows them next
-- to the verified badge, and only for a verified trainer (Q55: the badge axis). Nothing else depends on them.

create type public.trainer_honor as enum ('founder', 'ambassador');

-- One row per honor a trainer holds now; taking it back deletes the row, the history stays in admin_audit_log.
create table public.trainer_honors (
  trainer_id uuid not null references public.trainer_profiles (user_id) on delete cascade,
  honor      public.trainer_honor not null,
  -- No FK, as admin_audit_log.actor_id: the admin's account may be deleted, the honor stays.
  granted_by uuid,
  reason     text not null check (pg_catalog.char_length(reason) between 1 and 500),
  granted_at timestamptz not null default now(),
  primary key (trainer_id, honor)
);

comment on table public.trainer_honors is
  'Honors a trainer holds now (founder, ambassador). Written only by admin_set_trainer_honor; read through '
  'admin_trainer_honors and get_trainer_honors. No table grants.';
comment on column public.trainer_honors.reason is 'Why the admin granted it; admins only, never shown publicly.';

alter table public.trainer_honors enable row level security;
revoke all on table public.trainer_honors from anon, authenticated;

-- Grants (p_on true) or takes back (false) an honor with a reason and audits it as trainer_honor.grant / .revoke.
-- Granting one the trainer already holds, or taking back one they do not hold, raises honor_unchanged.
create function public.admin_set_trainer_honor(
  p_trainer_id uuid,
  p_honor public.trainer_honor,
  p_on boolean,
  p_reason text
)
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
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins set trainer honors';
  end if;
  if p_honor is null or p_on is null then
    raise exception 'invalid_honor' using errcode = '22023', detail = 'the honor and whether it is on are required';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023', detail = 'an honor needs a reason';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023', detail = 'the reason is at most 500 characters';
  end if;
  perform 1 from public.trainer_profiles t where t.user_id = p_trainer_id for no key update;
  if not found then
    raise exception 'trainer_not_found' using errcode = 'P0001';
  end if;

  if p_on then
    insert into public.trainer_honors (trainer_id, honor, granted_by, reason)
    values (p_trainer_id, p_honor, auth.uid(), v_reason)
    on conflict (trainer_id, honor) do nothing;
  else
    delete from public.trainer_honors h where h.trainer_id = p_trainer_id and h.honor = p_honor;
  end if;
  if not found then
    raise exception 'honor_unchanged' using errcode = 'P0001', detail = 'the trainer already has it, or does not';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), case when p_on then 'trainer_honor.grant' else 'trainer_honor.revoke' end, 'trainer', p_trainer_id,
          v_reason, pg_catalog.jsonb_build_object('honor', p_honor));
end $$;

comment on function public.admin_set_trainer_honor(uuid, public.trainer_honor, boolean, text) is
  'Admin: grants (p_on) or takes back a trainer honor with a required reason and audits it as trainer_honor.grant '
  'or trainer_honor.revoke. Raises invalid_honor, reason_required, reason_too_long, trainer_not_found or '
  'honor_unchanged.';
revoke all on function public.admin_set_trainer_honor(uuid, public.trainer_honor, boolean, text) from public, anon;
grant execute on function public.admin_set_trainer_honor(uuid, public.trainer_honor, boolean, text) to authenticated;

-- The honors a trainer holds, with who granted them, when and why, for the admin's user card.
create function public.admin_trainer_honors(p_trainer_id uuid)
returns table (honor public.trainer_honor, granted_at timestamptz, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins read trainer honors';
  end if;
  return query
  select h.honor, h.granted_at, h.reason
  from public.trainer_honors h
  where h.trainer_id = p_trainer_id
  order by h.honor;
end $$;

comment on function public.admin_trainer_honors(uuid) is 'Admin: the honors a trainer holds, with when and why.';
revoke all on function public.admin_trainer_honors(uuid) from public, anon;
grant execute on function public.admin_trainer_honors(uuid) to authenticated;

-- What the showcase prints: the honors of an open showcase whose trainer is verified (Q55), founder first. No rows
-- for an unknown or closed showcase or a trainer who is not verified.
create function public.get_trainer_honors(p_slug text)
returns setof public.trainer_honor
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer public.trainer_profiles;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) or v_trainer.verification_status <> 'verified' then
    return;
  end if;
  return query select h.honor from public.trainer_honors h where h.trainer_id = v_trainer.user_id order by h.honor;
end $$;

comment on function public.get_trainer_honors(text) is
  'Honors on the open showcase with this slug, for anyone: only a verified trainer''s (Q55); no reasons.';
revoke all on function public.get_trainer_honors(text) from public;
grant execute on function public.get_trainer_honors(text) to anon, authenticated;

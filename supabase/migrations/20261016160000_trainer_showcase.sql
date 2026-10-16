-- The trainer's public showcase /trainers/<slug> (PRD wave-1 §2.3 rule 1, SHOP-1, SHOP-7; screens.md §3.1
-- "Витрина тренера", §2.2 "Витрина (редактор)"; data-model §1.1, R16; decisions Q60). Anyone may open it,
-- signed in or not, so it is read through a definer function: anon gets no table. The trainer edits the
-- address (slug) and the switch (is_public) on trainer_profiles directly, under the existing column grants.

-- Whether a trainer's showcase may be shown: the trainer has not switched it off, the verification is not
-- rejected (Q60), the account is not blocked and not waiting to be deleted (PRD wave-1 §2.15-7).
create function private.showcase_is_open(p_trainer public.trainer_profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_trainer.user_id is not null
    and p_trainer.is_public
    and p_trainer.verification_status <> 'rejected'
    and not exists (select 1 from public.profiles p where p.id = p_trainer.user_id and p.blocked_at is not null)
    and not exists (
      select 1 from public.account_deletions d where d.user_id = p_trainer.user_id and d.cancelled_at is null
    )
$$;

comment on function private.showcase_is_open(public.trainer_profiles) is
  'True while a trainer''s public showcase is shown: is_public, not rejected, not blocked, not being deleted.';
revoke all on function private.showcase_is_open(public.trainer_profiles) from public;

-- What /trainers/<slug> shows. An unknown address and a closed showcase look the same ("Тренер недоступен"),
-- so the page does not tell which addresses exist. Only public fields: no Telegram id, documents or online
-- session links (SHOP-7). Locations are the trainer's live ones, name and address. is_own and coaching_id
-- describe the caller: their own showcase, or the live pair they already have with this trainer.
-- status: available, unavailable (every other field null).
create function public.get_trainer_showcase(p_slug text)
returns table (
  status        text,
  slug          text,
  name          text,
  photo_url     text,
  headline      text,
  bio           text,
  specialties   text[],
  city          text,
  works_offline boolean,
  works_online  boolean,
  verified      boolean,
  locations     jsonb,
  is_own        boolean,
  coaching_id   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_trainer public.trainer_profiles;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) then
    status := 'unavailable';
    return next;
    return;
  end if;

  status := 'available';
  slug := v_trainer.slug;
  headline := v_trainer.headline;
  bio := v_trainer.bio;
  specialties := v_trainer.specialties;
  city := v_trainer.city;
  works_offline := v_trainer.works_offline;
  works_online := v_trainer.works_online;
  verified := v_trainer.verification_status = 'verified';
  is_own := v_user is not null and v_user = v_trainer.user_id;

  select coalesce(
           nullif(pg_catalog.btrim(p.display_name), ''),
           nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), '')
         ),
         p.photo_url
  into name, photo_url
  from public.profiles p
  where p.id = v_trainer.user_id;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('name', l.name, 'address', l.address) order by l.created_at, l.id
           ),
           '[]'::jsonb
         )
  into locations
  from public.locations l
  where l.trainer_id = v_trainer.user_id and l.archived_at is null;

  select c.id into coaching_id
  from public.coachings c
  where c.trainer_id = v_trainer.user_id and c.client_id = v_user and c.status <> 'ended';
  return next;
end $$;

comment on function public.get_trainer_showcase(text) is
  'Public showcase of the trainer with this slug, for anyone: available with the public fields, or unavailable '
  '(unknown, switched off, rejected verification, blocked or being deleted; R16, Q60). is_own and coaching_id '
  'describe the caller.';
revoke all on function public.get_trainer_showcase(text) from public;
grant execute on function public.get_trainer_showcase(text) to anon, authenticated;

-- "Стать клиентом" on the showcase (PRD wave-1 §2.3 rule 1). It works like the trainer's client link: the
-- showcase does not hand the link token out, the function takes the trainer's newest live link (creating it
-- when there is none, as my_client_invite does) and joins through it, so the Free limit, the claim of a card
-- without an account and the "new client" message are the same as for the link (Q16, PLAN-1, PLAN-9).
create function public.join_by_showcase(p_slug text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_trainer public.trainer_profiles;
  v_invite public.client_invites;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- The same row lock as my_client_invite, so a showcase join and the trainer's screen still make one link.
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug) for no key update;
  if not private.showcase_is_open(v_trainer) then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  if v_user = v_trainer.user_id then
    raise exception 'own_invite' using errcode = 'P0001';
  end if;

  select ci.* into v_invite
  from public.client_invites ci
  where ci.trainer_id = v_trainer.user_id and private.client_invite_is_live(ci)
  order by ci.created_at desc
  limit 1;
  if v_invite.id is null then
    insert into public.client_invites (trainer_id) values (v_trainer.user_id) returning * into v_invite;
  end if;

  return private.join_trainer(v_invite, 'client_invite');
end $$;

comment on function public.join_by_showcase(text) is
  'Signed-in caller joins the trainer of an open showcase through the trainer''s client link (created when '
  'missing) and gets the pair id. Raises trainer_unavailable, own_invite or what join_by_invite raises.';
revoke all on function public.join_by_showcase(text) from public, anon;
grant execute on function public.join_by_showcase(text) to authenticated;

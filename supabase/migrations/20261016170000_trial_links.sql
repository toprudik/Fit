-- Trial links, without booking yet (PRD wave-1 §2.3 rule 4–7, SHOP-5..6 come with the booking in week 2;
-- screens.md §3.1 "Лендинг ссылки на пробное", §2.2 "QR и ссылки"; data-model §1.1, §2.1; decisions Q16, Q60).
-- The trainer makes and switches links on trial_links directly under the existing grants
-- (20261015123100_trainers_policies.sql). Visitors read a link through get_trial_link; until slots and
-- booking requests exist, a signed-in visitor's next step is to become the trainer's client through it.

-- Joining, shared by every link kind -----------------------------------------------------------------------

-- The body of private.join_trainer (20261016140000_client_invites.sql), now also for trial links: the pair
-- remembers which link brought the client, and that link counts the use. Callers check the link itself.
-- Order of checks:
--   1. a live pair is returned as it is: no duplicate, no new use, no message (SHOP edge case);
--   2. the Free limit (PLAN-1), except when the trainer has a card without an account: then the pair is
--      created anyway together with a pending "Is this <name>?" claim (R91, Q65, PLAN-9);
--   3. an ended pair comes back to life with default data shares; otherwise a new pair starts;
--   4. the link counts the use, the trainer gets Т7 (new client) or Т7a (the claim), and the caller's
--      last zone becomes the client zone (ADR 0015).
create function private.join_pair(
  p_trainer_id uuid,
  p_source public.coaching_source,
  p_client_invite_id uuid,
  p_trial_link_id uuid
)
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

  select c.* into v_pair from public.coachings c where c.trainer_id = p_trainer_id and c.client_id = v_user;
  if v_pair.id is not null and v_pair.status <> 'ended' then
    return v_pair.id;
  end if;

  v_has_card := exists (
    select 1 from public.profiles p where p.managed_by_trainer_id = p_trainer_id and p.claimed_by is null
  );
  if v_has_card then
    -- Same lock as assert_can_add_client, so joins of one trainer still run one after another.
    perform 1 from public.trainer_profiles t where t.user_id = p_trainer_id for no key update;
  else
    perform private.assert_can_add_client(p_trainer_id);
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
    insert into public.coachings (trainer_id, client_id, source, client_invite_id, trial_link_id)
    values (p_trainer_id, v_user, p_source, p_client_invite_id, p_trial_link_id)
    returning * into v_pair;
  end if;

  if p_client_invite_id is not null then
    update public.client_invites ci set uses_count = ci.uses_count + 1 where ci.id = p_client_invite_id;
  end if;
  if p_trial_link_id is not null then
    update public.trial_links tl set uses_count = tl.uses_count + 1 where tl.id = p_trial_link_id;
  end if;

  select p.* into v_client from public.profiles p where p.id = v_user;
  if v_has_card then
    insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
    values (p_trainer_id, v_user, v_pair.id)
    returning id into v_claim;
    perform private.enqueue_notification(
      'managed_client_claim', pg_catalog.format('managed_client_claim:%s', v_claim),
      pg_catalog.jsonb_build_object('claim_id', v_claim, 'coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_trainer_id);
  else
    -- A pair that ends and starts again gets a new message each time.
    perform private.enqueue_notification(
      'coaching_created',
      pg_catalog.format('coaching_created:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
      pg_catalog.jsonb_build_object('coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_trainer_id);
  end if;

  update public.user_settings s set last_zone = 'client' where s.user_id = v_user;
  return v_pair.id;
end $$;

comment on function private.join_pair(uuid, public.coaching_source, uuid, uuid) is
  'Makes the caller a client of the trainer through the given client link or trial link (already checked by the '
  'caller) and returns the pair id; see join_by_invite.';
revoke all on function private.join_pair(uuid, public.coaching_source, uuid, uuid) from public;

-- join_trainer keeps its checks and hands the rest to join_pair; behaviour is unchanged.
create or replace function private.join_trainer(p_invite public.client_invites, p_source public.coaching_source)
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
  return private.join_pair(p_invite.trainer_id, p_source, p_invite.id, null);
end $$;

-- Trial links ----------------------------------------------------------------------------------------------

-- A trial link works while it is switched on, not archived, not expired and not used up. A switched-off link
-- keeps its token, so QR codes already printed work again once it is back on.
create function private.trial_link_is_live(p_link public.trial_links)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_link.id is not null
    and p_link.is_enabled
    and p_link.archived_at is null
    and (p_link.expires_at is null or p_link.expires_at > pg_catalog.now())
    and (p_link.max_uses is null or p_link.uses_count < p_link.max_uses)
$$;

comment on function private.trial_link_is_live(public.trial_links) is
  'True while a trial link is switched on, not archived, not expired and below its use limit.';
revoke all on function private.trial_link_is_live(public.trial_links) from public;

-- What /trial/<token> shows: the trainer card and the trial terms. Anyone may open a link, signed in or not.
-- A dead link and an unknown token look the same. A blocked trainer or one being deleted shows only
-- "unavailable". A rejected trainer's link works, without the badge (TINV-7, Q60).
-- status: valid, invalid, unavailable, own (the caller's own link), joined (the caller is already a live
-- client; coaching_id says which pair). An ended pair counts as valid: joining again restores it.
create function public.get_trial_link(p_token text)
returns table (
  status         text,
  trainer_id     uuid,
  name           text,
  photo_url      text,
  headline       text,
  specialties    text[],
  works_offline  boolean,
  works_online   boolean,
  verified       boolean,
  title          text,
  description    text,
  duration_min   smallint,
  price_minor    bigint,
  currency       text,
  mode           public.session_mode,
  location_name  text,
  location_address text,
  coaching_id    uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.trial_links;
  v_pair public.coachings;
begin
  select tl.* into v_link from public.trial_links tl where tl.token = p_token;
  if not private.trial_link_is_live(v_link) then
    status := 'invalid';
    return next;
    return;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_link.trainer_id and p.blocked_at is not null)
     or exists (select 1 from public.account_deletions d where d.user_id = v_link.trainer_id and d.cancelled_at is null)
  then
    status := 'unavailable';
    return next;
    return;
  end if;

  select c.* into v_pair from public.coachings c where c.trainer_id = v_link.trainer_id and c.client_id = v_user;
  status := case
    when v_user = v_link.trainer_id then 'own'
    when v_pair.id is not null and v_pair.status <> 'ended' then 'joined'
    else 'valid'
  end;
  coaching_id := case when status = 'joined' then v_pair.id end;

  select v_link.trainer_id,
         coalesce(
           nullif(pg_catalog.btrim(p.display_name), ''),
           nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), '')
         ),
         p.photo_url, t.headline, t.specialties, t.works_offline, t.works_online, t.verification_status = 'verified'
  into trainer_id, name, photo_url, headline, specialties, works_offline, works_online, verified
  from public.trainer_profiles t
  join public.profiles p on p.id = t.user_id
  where t.user_id = v_link.trainer_id;

  title := v_link.title;
  description := v_link.description;
  duration_min := v_link.duration_min;
  price_minor := v_link.price_minor;
  currency := v_link.currency::text;
  mode := v_link.mode;
  select l.name, l.address into location_name, location_address
  from public.locations l
  where l.id = v_link.location_id and l.archived_at is null;
  return next;
end $$;

comment on function public.get_trial_link(text) is
  'Status of a trial link for the caller (anyone), with the trainer card and the trial terms: valid, invalid, '
  'unavailable (blocked or deleting trainer, no card), own, joined (with coaching_id).';
revoke all on function public.get_trial_link(text) from public;
grant execute on function public.get_trial_link(text) to anon, authenticated;

-- "Стать клиентом" on a trial link landing: the pair starts from the trial link (source trial_link) and the
-- link counts the use. Booking the trial itself arrives with slots and booking requests in week 2.
create function public.join_by_trial_link(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.trial_links;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Locks the link, so two joins at its last use cannot both pass the use limit.
  select tl.* into v_link from public.trial_links tl where tl.token = p_token for no key update;
  if not private.trial_link_is_live(v_link) then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_link.trainer_id and p.blocked_at is not null)
     or exists (select 1 from public.account_deletions d where d.user_id = v_link.trainer_id and d.cancelled_at is null)
  then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  if v_user = v_link.trainer_id then
    raise exception 'own_invite' using errcode = 'P0001';
  end if;
  return private.join_pair(v_link.trainer_id, 'trial_link', null, v_link.id);
end $$;

comment on function public.join_by_trial_link(text) is
  'Signed-in caller becomes a client of the trial link''s trainer (source trial_link) and gets the pair id. A live '
  'pair is returned unchanged. Raises invite_invalid, trainer_unavailable, own_invite or plan_limit_reached.';
revoke all on function public.join_by_trial_link(text) from public, anon;
grant execute on function public.join_by_trial_link(text) to authenticated;

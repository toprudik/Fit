-- SCHED-19 on the trial landing (PRD wave-1 §2.6.7 rule 4): the visitor sees trial times in their own zone, and
-- when the trainer's clock shows something else, the landing adds «по времени тренера». The visitor is not paired
-- yet, so public_profiles does not show them the trainer's zone; get_trial_link now returns it (time_zone). A zone
-- says no more than the trial times the link already shows. The return type changes, so the function is
-- recreated; the body is the one from 20261016170000_trial_links.sql plus time_zone.

drop function public.get_trial_link(text);

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
  coaching_id    uuid,
  time_zone      text
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
         p.photo_url, t.headline, t.specialties, t.works_offline, t.works_online, t.verification_status = 'verified',
         p.time_zone
  into trainer_id, name, photo_url, headline, specialties, works_offline, works_online, verified, time_zone
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
  'unavailable (blocked or deleting trainer, no card), own, joined (with coaching_id); time_zone is the trainer''s.';
revoke all on function public.get_trial_link(text) from public;
grant execute on function public.get_trial_link(text) to anon, authenticated;

-- Consent to make personal data public (152-FZ art. 10.1; legal/ru/consent-public-data.md, legal/product-changes.md
-- Б14). A trainer gives it when switching the showcase on, choosing which fields go public; a person gives it before
-- their first story card. Each consent keeps the text version, the fields, the bans and the person's own condition
-- (art. 10.1 part 9), and is revoked with a stamp, like consents. Silence is not consent (part 8): a showcase
-- without one stays closed. Places are consented to address by address: the trainer sees each one and ticks it,
-- so a place added later is not published until the trainer adds it, and a home address can stay unticked.

create table public.public_data_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  scope       text not null check (scope in ('showcase', 'story')),
  version     text not null check (char_length(version) between 1 and 64),
  fields      text[] not null default '{}' check (fields <@ array['photo', 'about', 'city', 'locations', 'prices']),
  bans        text[] not null default '{}' check (bans <@ array['no_transfer', 'no_index', 'no_processing']),
  condition   text check (condition is null or char_length(condition) between 1 and 500),
  location_ids uuid[] not null default '{}',
  accepted_at timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint public_data_consents_revoked_check check (revoked_at is null or revoked_at >= accepted_at),
  constraint public_data_consents_story_fields_check check (scope = 'showcase' or fields = '{}'),
  -- "locations" is chosen exactly when some place is.
  constraint public_data_consents_locations_check check (('locations' = any (fields)) = (cardinality(location_ids) > 0))
);

comment on table public.public_data_consents is
  'Consent to make personal data public (152-FZ art. 10.1): the showcase with the chosen fields, or story cards; '
  'with bans and an own condition. Written only by give_/revoke_public_data_consent.';
comment on column public.public_data_consents.fields is
  'Showcase fields beyond the name, which always shows: photo, about (headline, bio, specialties), city, locations, prices.';
comment on column public.public_data_consents.location_ids is
  'The places whose name and address go public, ticked one by one; a place added later stays private until added.';
comment on column public.public_data_consents.bans is
  'Bans of art. 10.1 part 9: no_transfer (only on DaFit pages), no_index (noindex), no_processing (view only).';

create unique index public_data_consents_one_active_uniq on public.public_data_consents (user_id, scope) where revoked_at is null;
create index public_data_consents_user_id_idx on public.public_data_consents (user_id);

alter table public.public_data_consents enable row level security;
revoke all on table public.public_data_consents from anon, authenticated;
grant select on table public.public_data_consents to authenticated;

create policy "public_data_consents: owner or admin reads"
  on public.public_data_consents for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "public_data_consents: owner or admin reads" on public.public_data_consents is
  'A person sees their own consents to publish; admins see them to prove a publication was lawful.';

-- The person's consent in force for a scope, or null. Definer, so a public page can ask about the trainer.
create function private.public_consent(p_user uuid, p_scope text)
returns public.public_data_consents
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.public_data_consents c
  where c.user_id = p_user and c.scope = p_scope and c.revoked_at is null
$$;

comment on function private.public_consent(uuid, text) is 'The consent to publish in force for this person and scope, or null.';
revoke all on function private.public_consent(uuid, text) from public;

-- give_public_data_consent: a new consent replaces the one in force (a change of fields is a new consent, so the
-- record shows what was public when). Giving it for the showcase switches the showcase on.
create function public.give_public_data_consent(
  p_scope text,
  p_version text,
  p_fields text[] default '{}',
  p_bans text[] default '{}',
  p_condition text default null,
  p_location_ids uuid[] default '{}'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_fields text[];
  v_bans text[];
  v_condition text := nullif(pg_catalog.btrim(p_condition), '');
  v_locations uuid[];
  v_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_scope = 'showcase' and not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.array_agg(distinct f order by f), '{}') into v_fields from pg_catalog.unnest(p_fields) f;
  select coalesce(pg_catalog.array_agg(distinct b order by b), '{}') into v_bans from pg_catalog.unnest(p_bans) b;
  select coalesce(pg_catalog.array_agg(distinct l order by l), '{}') into v_locations from pg_catalog.unnest(p_location_ids) l;
  -- The places decide "locations": ticking none leaves them private.
  v_fields := pg_catalog.array_remove(v_fields, 'locations');
  if v_locations <> '{}' then
    v_fields := (select pg_catalog.array_agg(f order by f) from pg_catalog.unnest(v_fields || array['locations']) f);
  end if;
  if p_scope is null or p_scope not in ('showcase', 'story')
     or p_version is null or pg_catalog.char_length(p_version) not between 1 and 64
     or not v_fields <@ array['photo', 'about', 'city', 'locations', 'prices']
     or (p_scope = 'story' and v_fields <> '{}')
     or not v_bans <@ array['no_transfer', 'no_index', 'no_processing']
     or pg_catalog.char_length(v_condition) > 500
     or (p_scope = 'story' and v_locations <> '{}')
     -- Only the trainer's own places in use.
     or exists (
       select 1 from pg_catalog.unnest(v_locations) l
       where not exists (
         select 1 from public.locations x where x.id = l and x.trainer_id = v_user and x.archived_at is null
       )
     ) then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;

  update public.public_data_consents c set revoked_at = pg_catalog.now()
  where c.user_id = v_user and c.scope = p_scope and c.revoked_at is null;
  insert into public.public_data_consents (user_id, scope, version, fields, bans, condition, location_ids)
  values (v_user, p_scope, p_version, v_fields, v_bans, v_condition, v_locations)
  returning id into v_id;

  if p_scope = 'showcase' then
    update public.trainer_profiles t set is_public = true where t.user_id = v_user and not t.is_public;
  end if;
  return v_id;
end $$;

comment on function public.give_public_data_consent(text, text, text[], text[], text, uuid[]) is
  'The caller consents to publish (152-FZ art. 10.1): showcase fields and places or story cards, with bans and a condition; '
  'replaces the consent in force; for the showcase also switches it on.';
revoke all on function public.give_public_data_consent(text, text, text[], text[], text, uuid[]) from public;
grant execute on function public.give_public_data_consent(text, text, text[], text[], text, uuid[]) to authenticated;

-- revoke_public_data_consent: the publication stops at once (art. 10.1 part 13); for the showcase it closes.
create function public.revoke_public_data_consent(p_scope text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_found boolean;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.public_data_consents c set revoked_at = pg_catalog.now()
  where c.user_id = v_user and c.scope = p_scope and c.revoked_at is null;
  v_found := found;
  if p_scope = 'showcase' then
    update public.trainer_profiles t set is_public = false where t.user_id = v_user and t.is_public;
  end if;
  return v_found;
end $$;

comment on function public.revoke_public_data_consent(text) is
  'The caller revokes their consent to publish for a scope; revoking the showcase one closes the showcase.';
revoke all on function public.revoke_public_data_consent(text) from public;
grant execute on function public.revoke_public_data_consent(text) to authenticated;

-- A showcase opens only with a consent in force: the switch cannot go on without one.
create function private.trainer_profiles_require_public_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public and (tg_op = 'INSERT' or not old.is_public)
     and (private.public_consent(new.user_id, 'showcase')).id is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  return new;
end $$;

comment on function private.trainer_profiles_require_public_consent() is
  'Refuses to switch a showcase on without the trainer''s consent to publish (152-FZ art. 10.1).';
revoke all on function private.trainer_profiles_require_public_consent() from public;

alter table public.trainer_profiles alter column is_public set default false;

-- Showcases opened before this consent existed close until their trainer gives it.
update public.trainer_profiles t set is_public = false
where t.is_public and (private.public_consent(t.user_id, 'showcase')).id is null;

create trigger trainer_profiles_require_public_consent
  before insert or update of is_public on public.trainer_profiles
  for each row execute function private.trainer_profiles_require_public_consent();

-- What the showcase page needs to state under "Условия обработки данных" (art. 10.1 part 10): when the trainer
-- consented, the bans and the condition. Nothing for an unknown or closed showcase.
create function public.get_showcase_terms(p_slug text)
returns table (accepted_at timestamptz, bans text[], condition text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer public.trainer_profiles;
  v_consent public.public_data_consents;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) then
    return;
  end if;
  v_consent := private.public_consent(v_trainer.user_id, 'showcase');
  accepted_at := v_consent.accepted_at;
  bans := v_consent.bans;
  condition := v_consent.condition;
  return next;
end $$;

comment on function public.get_showcase_terms(text) is
  'For an open showcase: when its trainer consented to publish, the bans and the condition (152-FZ art. 10.1 part 10).';
revoke all on function public.get_showcase_terms(text) from public;
grant execute on function public.get_showcase_terms(text) to anon, authenticated;

-- =========================================================================================================
-- The showcase shows only the fields the trainer consented to publish. Bodies from 20261016160000 and
-- 20261016203700; the name always shows (without it the showcase does not work), the rest by the consent.
-- =========================================================================================================

create or replace function public.get_trainer_showcase(p_slug text)
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
  v_fields text[];
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) then
    status := 'unavailable';
    return next;
    return;
  end if;
  v_fields := coalesce((private.public_consent(v_trainer.user_id, 'showcase')).fields, '{}');

  status := 'available';
  slug := v_trainer.slug;
  if 'about' = any (v_fields) then
    headline := v_trainer.headline;
    bio := v_trainer.bio;
    specialties := v_trainer.specialties;
  else
    specialties := '{}';
  end if;
  if 'city' = any (v_fields) then
    city := v_trainer.city;
  end if;
  works_offline := v_trainer.works_offline;
  works_online := v_trainer.works_online;
  verified := v_trainer.verification_status = 'verified';
  is_own := v_user is not null and v_user = v_trainer.user_id;

  select coalesce(
           nullif(pg_catalog.btrim(p.display_name), ''),
           nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), '')
         ),
         case when 'photo' = any (v_fields) then p.photo_url end
  into name, photo_url
  from public.profiles p
  where p.id = v_trainer.user_id;

  -- Only the places ticked in the consent: one added since stays private.
  locations := '[]'::jsonb;
  if 'locations' = any (v_fields) then
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('name', l.name, 'address', l.address) order by l.created_at, l.id
             ),
             '[]'::jsonb
           )
    into locations
    from public.locations l
    where l.trainer_id = v_trainer.user_id and l.archived_at is null
      and l.id = any ((private.public_consent(v_trainer.user_id, 'showcase')).location_ids);
  end if;

  select c.id into coaching_id
  from public.coachings c
  where c.trainer_id = v_trainer.user_id and c.client_id = v_user and c.status <> 'ended';
  return next;
end $$;

comment on function public.get_trainer_showcase(text) is
  'Public showcase of the trainer with this slug, for anyone: available with the name and the fields the trainer '
  'consented to publish (152-FZ art. 10.1), or unavailable (unknown, switched off, rejected verification, blocked '
  'or being deleted; R16, Q60). is_own and coaching_id describe the caller.';

create or replace function public.get_trainer_showcase_prices(p_slug text)
returns table (
  title             text,
  applies_to        public.package_applies_to,
  sessions_count    smallint,
  price_minor       bigint,
  currency          text,
  per_session_minor bigint,
  validity_days     smallint,
  savings_pct       integer,
  is_best_value     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer public.trainer_profiles;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer)
     or not 'prices' = any (coalesce((private.public_consent(v_trainer.user_id, 'showcase')).fields, '{}')) then
    return;
  end if;

  -- The badge is given again among the public rows (same rule as the view: highest savings above 0, ties to
  -- the larger pack), so a hidden pack cannot take it away from the grid the visitor sees.
  return query
  select s.title, s.applies_to, s.sessions_count, s.price_minor, s.currency::text, s.per_session_minor, s.validity_days,
         s.savings_pct,
         coalesce(
           s.savings_pct > 0
             and row_number() over (
               partition by s.applies_to order by s.savings_pct desc nulls last, s.sessions_count desc, s.package_id) = 1,
           false)
  from (
    select g.package_id, g.title, g.applies_to, g.sessions_count, g.price_minor, g.currency, g.per_session_minor,
           pk.validity_days, g.savings_pct, pk.sort_order
    from public.price_grid g
    join public.packages pk on pk.id = g.package_id
    where g.trainer_id = v_trainer.user_id and g.currency = v_trainer.default_currency and pk.is_public
  ) s
  order by s.applies_to, s.sessions_count, s.sort_order, s.package_id;
end $$;

comment on function public.get_trainer_showcase_prices(text) is
  'Price grid of the open showcase with this slug, for anyone, when the trainer consented to publish prices: live '
  'public packages in the trainer''s default currency with per-session price, savings and best value from '
  'price_grid; no rows for an unknown or closed showcase (R16, Q60) or without that consent.';

-- A story card opens to anyone with its link, so it needs the person's consent to publish, given once before the
-- first card. A trigger, so create_story_card (20261018002741) stays as it is; the app asks and tries again. A card of
-- the trainer's showcase (kind trainer_showcase) shows only what the open showcase does, so the showcase consent covers
-- it; every other card, a trainer's month recap included, needs the consent to story cards.
create function private.story_cards_require_public_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (private.public_consent(new.user_id, case when new.kind = 'trainer_showcase' then 'showcase' else 'story' end)).id is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  return new;
end $$;

comment on function private.story_cards_require_public_consent() is
  'Refuses a story card without its author''s consent to publish story cards (152-FZ art. 10.1).';
revoke all on function private.story_cards_require_public_consent() from public;

create trigger story_cards_require_public_consent
  before insert on public.story_cards
  for each row execute function private.story_cards_require_public_consent();

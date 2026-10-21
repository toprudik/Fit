-- Story cards of a moment (marketing backlog 4, virality §2.1): the client shares a milestone of a pair (10/25/50/100
-- attended sessions) or a badge, right after the Da-moment or later from the list. The cards live in public.story_cards
-- next to the monthly ones, open through public.story_card() and the same picture route, and need the same consent to
-- publish story cards (story_cards_require_public_consent, 20261020171523). month is the month of the moment.
--   * milestone: the count and, on the terms of the trainer card of the monthly report (20261017191056), the
--     trainer's name and open showcase address.
--   * badge: the badge's code and how many badges the client holds; no trainer, a badge belongs to no pair.
-- Neither is built from health data: the monthly report keeps sessions and badges without the health consent too.
--
-- The trainer's name on a client's card is the trainer's data made public, so it needs the trainer's own consent to
-- publish (152-FZ art. 10.1 part 8: silence is no consent; the story_card_showcase switch is on by default). A card
-- prints it only while the trainer's showcase consent is in force and the switch is on, keeps whose name it is in
-- story_cards.trainer_id, stops opening once the trainer has no such consent, and the trainer's revoke closes it at
-- once, as 20261021014013 does for the author's own cards. The monthly trainer card follows the same rule.

alter table public.story_cards drop constraint story_cards_kind_check;
alter table public.story_cards add constraint story_cards_kind_check
  check (kind in ('sessions', 'trainer', 'records', 'weight', 'streak_workouts', 'streak_diary', 'streak_steps', 'badges',
                  'milestone', 'badge'));

alter table public.story_cards
  add column trainer_id uuid references public.profiles (id) on delete cascade;
comment on column public.story_cards.trainer_id is
  'The trainer whose name the card prints (trainer and milestone cards); the card opens only while that trainer''s '
  'showcase consent to publish is in force.';
create index story_cards_trainer_id_idx on public.story_cards (trainer_id) where trainer_id is not null;

-- Trainer cards made before this rule print a name without knowing whose consent covers it: they close.
update public.story_cards set expires_at = pg_catalog.now()
where kind = 'trainer' and data ? 'name' and expires_at > pg_catalog.now();

-- Whether a trainer allows their name and showcase on their clients' story cards.
create function private.trainer_on_story_cards(p_trainer public.trainer_profiles)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_trainer.user_id is not null and p_trainer.story_card_showcase
     and (private.public_consent(p_trainer.user_id, 'showcase')).id is not null
$$;
comment on function private.trainer_on_story_cards(public.trainer_profiles) is
  'Whether a client''s story card may print this trainer''s name and showcase: the switch is on and the trainer''s '
  'showcase consent to publish is in force (152-FZ art. 10.1).';
revoke all on function private.trainer_on_story_cards(public.trainer_profiles) from public;

create function public.create_moment_card(p_kind text, p_ref text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_tz       text;
  v_at       timestamptz;
  v_data     jsonb;
  v_coaching uuid;
  v_trainer  public.trainer_profiles;
  v_id       uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select coalesce(s.time_zone, 'Europe/Moscow') into v_tz
  from public.profiles p left join public.user_settings s on s.user_id = p.id
  where p.id = v_user;

  if p_kind = 'milestone' then
    if p_ref is not null and p_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select m.achieved_at, c.id, pg_catalog.jsonb_build_object('count', pg_catalog.substr(m.kind::text, 10)::integer)
      into v_at, v_coaching, v_data
      from public.milestones m
      join public.coachings c on c.id = m.coaching_id
      where m.id = p_ref::uuid and c.client_id = v_user;
    end if;
    if v_data is not null then
      select tp.* into v_trainer
      from public.coachings c join public.trainer_profiles tp on tp.user_id = c.trainer_id
      where c.id = v_coaching;
      if private.trainer_on_story_cards(v_trainer) then
        v_data := v_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('name',
          (select coalesce(nullif(pg_catalog.btrim(p.display_name), ''), nullif(pg_catalog.concat_ws(' ', p.first_name, p.last_name), ''))
           from public.profiles p where p.id = v_trainer.user_id)));
        if private.showcase_is_open(v_trainer) then
          v_data := v_data || pg_catalog.jsonb_build_object('slug', v_trainer.slug);
        end if;
      end if;
    end if;
  elsif p_kind = 'badge' then
    select b.awarded_at, pg_catalog.jsonb_build_object('code', b.badge_code,
             'count', (select pg_catalog.count(*)::integer from public.user_badges a where a.user_id = v_user))
    into v_at, v_data
    from public.user_badges b
    where b.user_id = v_user and b.badge_code = p_ref;
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'nothing_to_show' using errcode = 'P0001';
  end if;

  delete from public.story_cards c where c.user_id = v_user and c.expires_at < pg_catalog.now();
  insert into public.story_cards (user_id, month, kind, data, trainer_id)
  values (v_user, pg_catalog.date_trunc('month', v_at at time zone v_tz)::date, p_kind, v_data,
          case when v_data ? 'name' then v_trainer.user_id end)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.create_moment_card(text, text) is
  'Freezes a story card of the caller''s milestone (by id) or badge (by code) (marketing backlog 4); the milestone '
  'card carries the trainer''s name and open showcase address only with the trainer''s showcase consent and switch on.';
revoke all on function public.create_moment_card(text, text) from public, anon;
grant execute on function public.create_moment_card(text, text) to authenticated;

-- The monthly trainer card on the same terms; the rest of the body is the one of 20261018002741.
create or replace function public.create_story_card(p_month date, p_kind text, p_coaching uuid default null, p_confirm boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_report  jsonb;
  v_data    jsonb;
  v_trainer public.trainer_profiles;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_report := public.my_monthly_report(p_month);
  if v_report is null then
    raise exception 'no_report' using errcode = 'P0001';
  end if;
  if p_kind = 'sessions' and v_report ? 'sessions' then
    v_data := pg_catalog.jsonb_build_object('count', (v_report #>> '{sessions,total}')::integer);
  elsif p_kind = 'trainer' and p_coaching is not null then
    select pg_catalog.jsonb_build_object('count', t->'count', 'name', t->'name')
    into v_data
    from pg_catalog.jsonb_array_elements(v_report #> '{sessions,trainers}') as x(t)
    where t->>'coaching_id' = p_coaching::text;
    if v_data is not null then
      select tp.* into v_trainer
      from public.coachings c join public.trainer_profiles tp on tp.user_id = c.trainer_id
      where c.id = p_coaching and c.client_id = v_user;
      if not coalesce(private.trainer_on_story_cards(v_trainer), false) then
        v_data := v_data - 'name';
      elsif private.showcase_is_open(v_trainer) then
        v_data := v_data || pg_catalog.jsonb_build_object('slug', v_trainer.slug);
      end if;
    end if;
  elsif p_kind = 'records' and v_report ? 'records' then
    v_data := pg_catalog.jsonb_build_object(
      'count', pg_catalog.jsonb_array_length(v_report->'records'),
      'name', v_report #> '{records,0,name}', 'type', v_report #> '{records,0,type}', 'value', v_report #> '{records,0,value}');
  elsif p_kind in ('streak_workouts', 'streak_diary', 'streak_steps') then
    if v_report #> array['streaks', pg_catalog.substr(p_kind, 8)] is not null then
      v_data := pg_catalog.jsonb_build_object('count', (v_report #>> array['streaks', pg_catalog.substr(p_kind, 8)])::integer);
    end if;
  elsif p_kind = 'badges' and v_report ? 'badges' then
    -- The month's count and its latest badge, by code: the picture names it in the card's language.
    v_data := pg_catalog.jsonb_build_object(
      'count', pg_catalog.jsonb_array_length(v_report->'badges'), 'code', v_report #> '{badges,-1}');
  elsif p_kind = 'weight' then
    if not coalesce(p_confirm, false) then
      raise exception 'confirm_required' using errcode = 'P0001';
    end if;
    select pg_catalog.jsonb_build_object('change', round((m->>'to')::numeric - (m->>'from')::numeric, 1))
    into v_data
    from pg_catalog.jsonb_array_elements(v_report->'measurements') as x(m)
    where m->>'kind' = 'weight' and (m->>'to')::numeric <> (m->>'from')::numeric;
  elsif p_kind is null
     or p_kind not in ('sessions', 'trainer', 'records', 'weight', 'streak_workouts', 'streak_diary', 'streak_steps', 'badges') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'nothing_to_show' using errcode = 'P0001';
  end if;

  delete from public.story_cards c where c.user_id = v_user and c.expires_at < now();
  insert into public.story_cards (user_id, month, kind, data, trainer_id)
  values (v_user, p_month, p_kind, v_data, case when p_kind = 'trainer' and v_data ? 'name' then v_trainer.user_id end)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.create_story_card(date, text, uuid, boolean) is
  'Freezes a story card of the caller''s finished month (wave-3 §4-4); body numbers only with p_confirm (§4-5); '
  'the trainer card carries the trainer''s name and open showcase address only with the trainer''s showcase consent '
  'and switch on (§4-7, 152-FZ art. 10.1); streak and badge cards come from the report''s streaks and badges (§4-2).';

-- The body of 20261021014013, and a trainer's showcase revoke closes the clients' cards printing their name.
create or replace function public.revoke_public_data_consent(p_scope text)
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
    update public.story_cards s set expires_at = pg_catalog.now()
    where s.trainer_id = v_user and s.expires_at > pg_catalog.now();
  end if;
  -- A card of the showcase goes with the showcase consent, every other card with the story one.
  update public.story_cards s set expires_at = pg_catalog.now()
  where s.user_id = v_user and s.expires_at > pg_catalog.now()
    and (s.kind = 'trainer_showcase') = (p_scope = 'showcase');
  return v_found;
end $$;

comment on function public.revoke_public_data_consent(text) is
  'The caller revokes their consent to publish for a scope; revoking the showcase one closes the showcase and the '
  'clients'' story cards printing the caller''s name, and either one closes the caller''s story cards that it covered.';

create or replace function public.story_card(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('kind', c.kind, 'month', c.month, 'data', c.data)
  from public.story_cards c
  where c.id = p_id and c.expires_at > now()
    and (private.public_consent(c.user_id, case when c.kind = 'trainer_showcase' then 'showcase' else 'story' end)).id
        is not null
    and (c.trainer_id is null or (private.public_consent(c.trainer_id, 'showcase')).id is not null)
$$;
comment on function public.story_card(uuid) is
  'A story card by its id for the image route (wave-3 §4-4): kind, month and the frozen numbers; null when expired, '
  'when its author has no consent to publish it in force, or when the trainer whose name it prints has none '
  '(152-FZ art. 10.1).';

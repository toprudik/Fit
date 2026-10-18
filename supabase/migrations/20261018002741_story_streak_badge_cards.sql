-- Streak and badge story cards (PRD wave-3 §4 rule 4): a card for each streak that runs on the month's last day
-- (workouts in weeks, food diary and steps in days) and one for the badges earned that month, showing their count
-- and the latest one. Both read the report's "streaks" and "badges" of 20261017230917_monthly_report_streaks_badges.
-- The diary streak card shows only the number of days, nothing of what was eaten (§4-5). The rest of
-- create_story_card is the one of 20261017191056_story_card_showcase.sql.

alter table public.story_cards drop constraint story_cards_kind_check;
alter table public.story_cards add constraint story_cards_kind_check
  check (kind in ('sessions', 'trainer', 'records', 'weight', 'streak_workouts', 'streak_diary', 'streak_steps', 'badges'));

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
      if v_trainer.user_id is null or not v_trainer.story_card_showcase then
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
  insert into public.story_cards (user_id, month, kind, data) values (v_user, p_month, p_kind, v_data)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.create_story_card(date, text, uuid, boolean) is
  'Freezes a story card of the caller''s finished month (wave-3 §4-4); body numbers only with p_confirm (§4-5); '
  'the trainer card carries the trainer''s name and open showcase address unless the trainer switched it off (§4-7); '
  'streak and badge cards come from the report''s streaks and badges (§4-2).';

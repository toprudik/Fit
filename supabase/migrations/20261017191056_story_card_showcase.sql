-- The trainer's name and showcase QR on a client's story card (PRD wave-3 §4 rule 7, acceptance 24): on by
-- default, the trainer can switch it off. The card freezes the showcase address with its numbers, and only while
-- the showcase is open; with the switch off the card shows neither the name nor the QR.

alter table public.trainer_profiles add column story_card_showcase boolean not null default true;
comment on column public.trainer_profiles.story_card_showcase is
  'Clients'' story cards show the trainer''s name and showcase QR (wave-3 §4 rule 7); on by default.';
grant update (story_card_showcase) on table public.trainer_profiles to authenticated;

-- The trainer card of create_story_card: the name only with the trainer's consent, the showcase address only
-- while the showcase is open. Everything else is as in 20261017101247_monthly_reports.sql.
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
  elsif p_kind = 'weight' then
    if not coalesce(p_confirm, false) then
      raise exception 'confirm_required' using errcode = 'P0001';
    end if;
    select pg_catalog.jsonb_build_object('change', round((m->>'to')::numeric - (m->>'from')::numeric, 1))
    into v_data
    from pg_catalog.jsonb_array_elements(v_report->'measurements') as x(m)
    where m->>'kind' = 'weight' and (m->>'to')::numeric <> (m->>'from')::numeric;
  elsif p_kind not in ('sessions', 'trainer', 'records', 'weight') or p_kind is null then
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
  'the trainer card carries the trainer''s name and open showcase address unless the trainer switched it off (§4-7).';

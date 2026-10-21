-- Trainer story cards (marketing backlog 5, virality §2.2): «Мой месяц в DaFit» and the showcase card. They are
-- frozen in story_cards like the clients' cards (20261017101247_monthly_reports.sql) and drawn by the same image
-- route through public.story_card(id).
-- * trainer_month: held sessions of a finished month (Q26, private.analytics_held_sessions), clients with at least
--   one of them, and milestones: clients who reached 10, 25, 50 or 100 held sessions with the trainer that month.
--   Only the trainer's own schedule: no money, no names, nothing the clients log.
-- * trainer_showcase: the trainer's name as the showcase shows it, showcase address and whether «Записаться на пробное» is on, only while
--   the showcase is open (private.showcase_is_open: public, so after the consent to publish). Nothing the open
--   showcase does not show already.

alter table public.story_cards drop constraint story_cards_kind_check;
alter table public.story_cards add constraint story_cards_kind_check
  check (kind in ('sessions', 'trainer', 'records', 'weight', 'streak_workouts', 'streak_diary', 'streak_steps', 'badges',
                  'trainer_month', 'trainer_showcase'));

-- The month in numbers, null when nothing was held. p_month is the first day of a month in the trainer's zone.
create function private.trainer_month_numbers(p_trainer_id uuid, p_month date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with zone as (
    select coalesce(p.time_zone, 'UTC') as tz from public.profiles p where p.id = p_trainer_id
  ), span as (
    select (p_month::timestamp at time zone z.tz) as from_at, ((p_month + interval '1 month')::timestamp at time zone z.tz) as to_at
    from zone z
  ), held as (
    -- Each client's held sessions with the trainer up to the month's end, marked when inside the month.
    select b.client_id, h.starts_at >= span.from_at as in_month
    from span
    cross join lateral private.analytics_held_sessions('-infinity', span.to_at) h
    join public.bookings b on b.session_id = h.session_id and b.status in ('confirmed', 'attended')
    where h.trainer_id = p_trainer_id
  ), per_client as (
    select pg_catalog.count(*) filter (where in_month) as month_count, pg_catalog.count(*) as total
    from held
    group by client_id
  )
  select case when (select pg_catalog.count(*) from per_client where month_count > 0) = 0 then null else
    pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(distinct h.session_id)
                from span cross join lateral private.analytics_held_sessions(span.from_at, span.to_at) h
                where h.trainer_id = p_trainer_id),
      'clients', (select pg_catalog.count(*) from per_client where month_count > 0),
      'milestones', (select pg_catalog.count(*) from per_client c
                     where exists (select 1 from pg_catalog.unnest(array[10, 25, 50, 100]) m
                                   where c.total - c.month_count < m and c.total >= m)))
  end
$$;

comment on function private.trainer_month_numbers(uuid, date) is
  'A trainer''s month for the story card: held sessions, clients with one, and clients who reached 10/25/50/100 '
  'held sessions with the trainer in it (marketing backlog 5). Null when nothing was held.';
revoke all on function private.trainer_month_numbers(uuid, date) from public;

-- Freezes a trainer's card. trainer_month needs a finished month; trainer_showcase an open showcase.
create function public.create_trainer_story_card(p_kind text, p_month date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_trainer public.trainer_profiles;
  v_this    date;
  v_month   date;
  v_data    jsonb;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_trainer from public.trainer_profiles t where t.user_id = v_user;
  if v_trainer.user_id is null then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select pg_catalog.date_trunc('month', pg_catalog.now() at time zone coalesce(p.time_zone, 'UTC'))::date
  into v_this from public.profiles p where p.id = v_user;

  if p_kind = 'trainer_month' then
    v_month := pg_catalog.date_trunc('month', p_month)::date;
    if p_month is null or v_month >= v_this then
      raise exception 'month_not_finished' using errcode = 'P0001';
    end if;
    v_data := private.trainer_month_numbers(v_user, v_month);
  elsif p_kind = 'trainer_showcase' then
    v_month := v_this;
    if private.showcase_is_open(v_trainer) and v_trainer.slug is not null then
      select pg_catalog.jsonb_build_object(
               'name', coalesce(nullif(pg_catalog.btrim(p.display_name), ''),
                                nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), '')),
               'slug', v_trainer.slug,
               'trial', exists (select 1 from public.trial_links l
                                where l.trainer_id = v_user and l.on_showcase and l.archived_at is null))
      into v_data
      from public.profiles p where p.id = v_user;
    end if;
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'nothing_to_show' using errcode = 'P0001';
  end if;

  delete from public.story_cards c where c.user_id = v_user and c.expires_at < pg_catalog.now();
  insert into public.story_cards (user_id, month, kind, data) values (v_user, v_month, p_kind, v_data)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.create_trainer_story_card(text, date) is
  'Freezes a trainer story card (marketing backlog 5): trainer_month of a finished month or trainer_showcase of '
  'an open showcase. Raises not_a_trainer, month_not_finished, nothing_to_show or unknown kind.';
revoke all on function public.create_trainer_story_card(text, date) from public, anon;
grant execute on function public.create_trainer_story_card(text, date) to authenticated;

-- The image route reads a showcase card only while that showcase is still open: closed later, the old link answers
-- like an expired card instead of the name and QR. The consent check stays as in 20261021014013_story_cards_close_on_revoke.sql.
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
    and (c.kind <> 'trainer_showcase' or exists (
      select 1 from public.trainer_profiles t
      where t.user_id = c.user_id and t.slug = c.data->>'slug' and private.showcase_is_open(t)))
$$;

comment on function public.story_card(uuid) is
  'A story card by its id for the image route (wave-3 §4-4): kind, month and the frozen numbers; null when expired, '
  'when its author has no consent to publish it in force (152-FZ art. 10.1), or for a showcase card once that '
  'showcase is closed or moved to another address.';

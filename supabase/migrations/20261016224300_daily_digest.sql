-- Trainer daily digest (PRD wave-1 §2.9-6, NOTIF-5): at the trainer's daily_digest_time, in their time zone,
-- one bot message with today's sessions, booking requests waiting for an answer, passes running out and debts.
-- A day with nothing in any of them sends nothing. Built on the notification outbox (ADR 0006): a pg_cron job
-- queues the digest, the dispatcher sends it; quiet hours, a switched-off type and a blocked bot apply as for
-- every other message. The digest only reads sessions, bookings and the balance views.

-- The name a trainer sees for a client: their alias for the pair, else the client's name.
create function private.trainer_client_label(p_coaching uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.btrim(m.client_alias), ''),
    nullif(pg_catalog.btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    nullif(pg_catalog.btrim(p.display_name), ''),
    case when p.username is not null then '@' || p.username end,
    '')
  from public.coachings c
  join public.profiles p on p.id = c.client_id
  left join public.coaching_trainer_meta m on m.coaching_id = c.id
  where c.id = p_coaching
$$;

comment on function private.trainer_client_label(uuid) is
  'The client of a pair as the trainer names them: alias, else first and last name, else display name or @username.';
revoke all on function private.trainer_client_label(uuid) from public;

-- What the digest of one trainer holds for their local day p_day, or null when every part is empty. Lists are
-- capped so the message stays short; the counts tell how many there are in all.
create function private.daily_digest_payload(p_trainer uuid, p_day date, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_sessions jsonb;
  v_sessions_count integer;
  v_requests integer;
  v_passes jsonb;
  v_passes_count integer;
  v_debts jsonb;
  v_debts_count integer;
begin
  select s.time_zone into v_tz from public.user_settings s where s.user_id = p_trainer;
  v_tz := coalesce(v_tz, 'Europe/Moscow');
  v_from := p_day::timestamp at time zone v_tz;
  v_to := (p_day + 1)::timestamp at time zone v_tz;

  -- Today's sessions: who comes to a personal or trial one, the title and headcount of a group one.
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(x.e order by x.starts_at) filter (where x.n <= 8), '[]'::jsonb)
  into v_sessions_count, v_sessions
  from (
    select s.starts_at,
           pg_catalog.row_number() over (order by s.starts_at, s.id) as n,
           pg_catalog.jsonb_build_object(
             'starts_at', s.starts_at, 'kind', s.kind, 'title', s.title,
             'name', (select private.trainer_client_label(b.coaching_id)
                      from public.bookings b
                      where b.session_id = s.id and s.kind <> 'group' and b.status = 'confirmed'
                      order by b.created_at limit 1),
             'booked', (select pg_catalog.count(*) from public.bookings b
                        where b.session_id = s.id and b.status = 'confirmed')) as e
    from public.sessions s
    where s.trainer_id = p_trainer and s.status = 'scheduled' and s.starts_at >= v_from and s.starts_at < v_to
  ) x;

  select pg_catalog.count(*)::integer into v_requests
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.trainer_id = p_trainer and b.status = 'requested' and s.starts_at > p_now;

  -- Passes running out (§2.9-9): one session or less to book, or seven days or less to the end, freezes counted.
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(x.e order by x.n) filter (where x.n <= 5), '[]'::jsonb)
  into v_passes_count, v_passes
  from (
    select pg_catalog.row_number() over (order by pb.available, pb.effective_expires_at nulls last, pb.pass_id) as n,
           pg_catalog.jsonb_build_object(
             'name', private.trainer_client_label(pb.coaching_id),
             'available', pb.available, 'expires_at', pb.effective_expires_at) as e
    from public.pass_balances pb
    join public.coachings c on c.id = pb.coaching_id
    where pb.trainer_id = p_trainer and pb.status = 'active' and c.status <> 'ended'
      and (pb.available <= 1 or pb.effective_expires_at <= p_now + interval '7 days')
  ) x;

  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(x.e order by x.n) filter (where x.n <= 5), '[]'::jsonb)
  into v_debts_count, v_debts
  from (
    select pg_catalog.row_number() over (order by cb.debt_sessions desc, cb.coaching_id) as n,
           pg_catalog.jsonb_build_object(
             'name', private.trainer_client_label(cb.coaching_id), 'sessions', cb.debt_sessions) as e
    from public.coaching_balances cb
    join public.coachings c on c.id = cb.coaching_id
    where cb.trainer_id = p_trainer and cb.debt_sessions > 0 and c.status <> 'ended'
  ) x;

  if v_sessions_count = 0 and v_requests = 0 and v_passes_count = 0 and v_debts_count = 0 then
    return null;
  end if;
  return pg_catalog.jsonb_build_object(
    'day', p_day, 'sessions', v_sessions, 'sessions_count', v_sessions_count, 'requests_count', v_requests,
    'passes', v_passes, 'passes_count', v_passes_count, 'debts', v_debts, 'debts_count', v_debts_count);
end $$;

comment on function private.daily_digest_payload(uuid, date, timestamptz) is
  'Payload of the trainer daily digest for a local day: sessions, open requests, passes running out, debts; '
  'null when all are empty (NOTIF-5).';
revoke all on function private.daily_digest_payload(uuid, date, timestamptz) from public;

-- Queues the digest of every trainer whose digest time has come today, at most once a local day (the dedupe
-- key), within two hours after that time so a paused job does not send yesterday's news late at night.
-- A card cannot be a trainer, and the dispatcher skips anyone the bot cannot reach.
create function private.queue_daily_digests(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_payload jsonb;
  v_count integer := 0;
begin
  for r in
    select t.user_id, (p_now at time zone s.time_zone)::date as day
    from public.trainer_profiles t
    join public.user_settings s on s.user_id = t.user_id
    where (p_now at time zone s.time_zone)
            - ((p_now at time zone s.time_zone)::date + s.daily_digest_time) between interval '0' and interval '2 hours'
      and not exists (
        select 1 from public.notification_outbox o
        where o.dedupe_key = 'digest:' || t.user_id || ':' || (p_now at time zone s.time_zone)::date)
  loop
    v_payload := private.daily_digest_payload(r.user_id, r.day, p_now);
    continue when v_payload is null;
    if private.enqueue_notification('daily_digest', 'digest:' || r.user_id || ':' || r.day, v_payload, r.user_id,
                                    null, p_now) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.queue_daily_digests(timestamptz) is
  'pg_cron: queues today''s digest of each trainer whose daily_digest_time passed less than two hours ago.';
revoke all on function private.queue_daily_digests(timestamptz) from public;

-- Every five minutes, so a digest leaves within five minutes of its time. cron.schedule with a name replaces a
-- job of the same name.
select cron.schedule('daily-digests', '*/5 * * * *', 'select private.queue_daily_digests()');

-- The trainer's daily digest read «8:45, клиент без имени» for a session the schedule showed with the client's
-- name: the name came only from a confirmed booking, so a client who had already checked in (attended) or whose
-- booking still waited for an answer (requested) had none. The name now comes from any live booking of the
-- session, a confirmed or past one first. Body of 20261016224300_daily_digest.sql otherwise.

create or replace function private.daily_digest_payload(p_trainer uuid, p_day date, p_now timestamptz default now())
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
                      where b.session_id = s.id and s.kind <> 'group'
                        and b.status in ('confirmed', 'attended', 'no_show', 'requested')
                      order by b.status = 'requested', b.created_at limit 1),
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

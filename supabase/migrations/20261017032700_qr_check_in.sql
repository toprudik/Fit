-- QR check-in (PRD wave-3 §5, data-model §2.3 "QR-чек-ин"; screens.md /trainer/sessions/[sessionId],
-- /client/checkin/[sessionId]). The trainer shows a QR of the session that changes every 15 seconds; the client
-- scans it and is marked as attended, charged by the wave-1 rules like the trainer's «Был» (§5 rule 5).
--   * The code is an HMAC of the session and the 15-second window under a key kept in the private schema. It is
--     never stored: the database computes it for the trainer and checks it for the client, so no server secret is
--     needed outside the database. The current and the previous window are accepted, so a code lives 15 to 30
--     seconds and a screenshot older than 30 seconds does not work (5.3).
--   * The window: from 30 minutes before the start to 15 minutes after the end (§5 rule 3).
--   * A second scan changes nothing (5.4). A client without a booking on a group session with a free seat gets a
--     request marked "на месте" (§5 rule 6, 5.5); otherwise "Нет записи".
--   * No location is asked or stored (§5 rule 7). The static QR of a location (§5 rule 2b) is not built yet.

create type public.check_in_method as enum ('qr', 'trainer');

create table public.check_ins (
  booking_id    uuid primary key references public.bookings (id) on delete cascade,
  client_id     uuid not null references public.profiles (id) on delete cascade,
  trainer_id    uuid not null references public.profiles (id) on delete cascade,
  method        public.check_in_method not null,
  checked_in_at timestamptz not null default clock_timestamp(),
  recorded_by   uuid references public.profiles (id) on delete set null
);

comment on table public.check_ins is
  'A check-in of a booking (PRD wave-3 §5): one per booking, written only by check_in_by_qr.';
comment on column public.check_ins.trainer_id is 'The session''s trainer, for the trainer''s read policy.';

create index check_ins_client_idx on public.check_ins (client_id);
create index check_ins_trainer_idx on public.check_ins (trainer_id);
create index check_ins_recorded_by_idx on public.check_ins (recorded_by);

alter table public.check_ins enable row level security;
revoke all on table public.check_ins from anon, authenticated;

create policy "check_ins: client and trainer read"
  on public.check_ins for select
  to authenticated
  using (client_id = (select auth.uid()) or private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "check_ins: client and trainer read" on public.check_ins is
  'A client reads their own check-ins; the trainer reads the check-ins of their sessions. Writes go through RPCs.';

grant select on table public.check_ins to authenticated;

-- The key of the check-in codes: one row, made here, readable by no role.
create table private.check_in_keys (
  id     boolean primary key default true check (id),
  secret bytea not null default extensions.gen_random_bytes(32)
);

comment on table private.check_in_keys is 'The HMAC key of the session check-in codes; one row, never leaves the database.';
revoke all on table private.check_in_keys from public;
insert into private.check_in_keys default values;

-- The 15-second window a moment falls into.
create function private.check_in_window(p_at timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select pg_catalog.floor(extract(epoch from p_at) / 15)::bigint
$$;

revoke all on function private.check_in_window(timestamptz) from public;

-- The code of a session for a window: 10 characters of base64url.
create function private.check_in_code(p_session_id uuid, p_window bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.left(pg_catalog.translate(pg_catalog.encode(
           extensions.hmac(pg_catalog.convert_to(p_session_id::text || ':' || p_window::text, 'UTF8'), k.secret, 'sha256'),
           'base64'), '+/', '-_'), 10)
  from private.check_in_keys k
$$;

revoke all on function private.check_in_code(uuid, bigint) from public;

-- When check-in opens and closes for a session.
create function private.check_in_opens_at(p_session public.sessions)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_session.starts_at - interval '30 minutes'
$$;

revoke all on function private.check_in_opens_at(public.sessions) from public;

create function private.check_in_closes_at(p_session public.sessions)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_session.ends_at + interval '15 minutes'
$$;

revoke all on function private.check_in_closes_at(public.sessions) from public;

-- The trainer's QR (§5 rule 2a): the current code, until when it is shown, and who has checked in so far, so the
-- screen sees a check-in within seconds (5.1). Raises session_not_found for a session that is not the caller's,
-- and check_in_closed outside the window or for a cancelled session.
create function public.session_check_in_qr(p_session_id uuid)
returns table (code text, refresh_at timestamptz, opens_at timestamptz, checked_in jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window bigint := private.check_in_window(pg_catalog.now());
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id;
  if v_session.id is null or not private.acts_for_trainer(v_session.trainer_id, 'schedule') then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status = 'cancelled' or pg_catalog.now() > private.check_in_closes_at(v_session) then
    raise exception 'check_in_closed' using errcode = 'P0001';
  end if;
  return query
  select
    case when pg_catalog.now() >= private.check_in_opens_at(v_session)
      then private.check_in_code(v_session.id, v_window) end,
    pg_catalog.to_timestamp((v_window + 1) * 15),
    private.check_in_opens_at(v_session),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('booking_id', c.booking_id, 'checked_in_at', c.checked_in_at)
               || private.person_name(c.client_id) order by c.checked_in_at)
      from public.check_ins c join public.bookings b on b.id = c.booking_id
      where b.session_id = v_session.id), '[]'::jsonb);
end $$;

comment on function public.session_check_in_qr(uuid) is
  'Trainer: the session''s check-in code for the current 15-second window (null before check-in opens), when to '
  'fetch the next one, and the clients checked in so far.';
revoke all on function public.session_check_in_qr(uuid) from public, anon;
grant execute on function public.session_check_in_qr(uuid) to authenticated;

-- The client scans the session's QR (§5 rules 3 to 6). Returns one row with the outcome:
--   checked_in  the booking is now attended and charged (§5 rule 5);
--   already     it was attended before; nothing changes (5.4);
--   requested   a request is waiting for the trainer: one made now "на месте" (5.5), or one made earlier;
--   too_early   check-in opens at opens_at (5.2);
--   closed      the window is over or the session was cancelled;
--   expired     the code is wrong or older than 30 seconds (5.3);
--   no_booking  no booking and no free seat to ask for.
-- An unknown session reads as expired, so a guess learns nothing.
create function public.check_in_by_qr(p_session_id uuid, p_code text)
returns table (outcome text, booking_id uuid, opens_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_session public.sessions;
  v_window bigint := private.check_in_window(pg_catalog.now());
  v_booking public.bookings;
  v_pair public.coachings;
  v_location text;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id for update;
  if v_session.id is null or p_code is null
     or p_code not in (private.check_in_code(v_session.id, v_window), private.check_in_code(v_session.id, v_window - 1)) then
    return query select 'expired'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if v_session.status = 'cancelled' or pg_catalog.now() > private.check_in_closes_at(v_session) then
    return query select 'closed'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if pg_catalog.now() < private.check_in_opens_at(v_session) then
    return query select 'too_early'::text, null::uuid, private.check_in_opens_at(v_session);
    return;
  end if;

  select b.* into v_booking from public.bookings b
  where b.session_id = v_session.id and b.client_id = v_client
    and b.status in ('requested', 'confirmed', 'attended', 'no_show')
  order by b.created_at desc
  limit 1
  for update;

  if v_booking.id is null then
    select c.* into v_pair from public.coachings c
    where c.trainer_id = v_session.trainer_id and c.client_id = v_client and c.status in ('trial', 'active');
    if v_pair.id is null or v_session.kind <> 'group' or private.group_free_seats(v_session.id) <= 0 then
      return query select 'no_booking'::text, null::uuid, null::timestamptz;
      return;
    end if;
    insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, requested_at)
    values (v_session.id, v_pair.id, v_pair.client_id, v_pair.trainer_id, 'requested', 'client_session', pg_catalog.now())
    returning * into v_booking;
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
    values (v_booking.id, null, 'requested', v_client, 'client', '{"on_site": true}');
    select l.name into v_location from public.locations l where l.id = v_session.location_id;
    perform private.enqueue_notification(
      'booking_requested',
      pg_catalog.format('booking_requested:%s', v_booking.id),
      pg_catalog.jsonb_build_object(
        'booking_id', v_booking.id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'mode', v_session.mode,
        'location', v_location, 'on_site', true, 'title', v_session.title)
        || private.person_name(v_client),
      v_session.trainer_id,
      p_booking_id => v_booking.id,
      p_session_id => v_session.id);
    return query select 'requested'::text, v_booking.id, null::timestamptz;
    return;
  end if;

  if v_booking.status = 'requested' then
    return query select 'requested'::text, v_booking.id, null::timestamptz;
    return;
  end if;
  if v_booking.status = 'attended' then
    insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
    values (v_booking.id, v_booking.client_id, v_booking.trainer_id, 'qr', v_client)
    on conflict on constraint check_ins_pkey do nothing;
    return query select 'already'::text, v_booking.id, null::timestamptz;
    return;
  end if;

  -- confirmed, or no_show marked before the client came: attended now. A no_show keeps its charge (as when the
  -- trainer corrects the mark); a confirmed booking is charged here, once.
  update public.bookings b
  set status = 'attended', attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_client
  where b.id = v_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking.id, v_booking.status, 'attended', v_client, 'client', '{"check_in": "qr"}');
  insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
  values (v_booking.id, v_booking.client_id, v_booking.trainer_id, 'qr', v_client)
  on conflict on constraint check_ins_pkey do nothing;
  if v_booking.status = 'confirmed' then
    perform private.post_charge(v_booking.id, 'attended');
  end if;
  return query select 'checked_in'::text, v_booking.id, null::timestamptz;
end $$;

comment on function public.check_in_by_qr(uuid, text) is
  'Client: check-in by the session''s QR. Marks the booking attended and charges it like the trainer''s mark; '
  'returns checked_in, already, requested, too_early, closed, expired or no_booking.';
revoke all on function public.check_in_by_qr(uuid, text) from public, anon;
grant execute on function public.check_in_by_qr(uuid, text) to authenticated;

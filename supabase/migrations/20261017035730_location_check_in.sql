-- The static check-in QR of a location (PRD wave-3 §5 rule 2b; data-model §2.3 "QR-чек-ин"): a code the trainer
-- prints for the gym. Scanning it checks the client in to their nearest booking at that location whose window is
-- open (30 minutes before the start to 15 minutes after the end), by the same rules as the session QR of
-- 20261017032700_qr_check_in.sql. The token stays until the trainer issues a new one. No location of the phone is
-- asked or stored (§5 rule 7).
--   * check_in_booking: the shared step of both QRs, extracted from check_in_by_qr, which now calls it.
--   * location_check_in_token: the trainer's token of a location, made on first use, renewed on request.
--   * check_in_by_location: the client's check-in by that token.

create table public.location_check_in_tokens (
  location_id uuid primary key references public.locations (id) on delete cascade,
  trainer_id  uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  issued_at   timestamptz not null default clock_timestamp()
);

comment on table public.location_check_in_tokens is
  'The printed check-in QR of a location (PRD wave-3 §5 rule 2b). Written only by location_check_in_token.';

create index location_check_in_tokens_trainer_idx on public.location_check_in_tokens (trainer_id);

alter table public.location_check_in_tokens enable row level security;
revoke all on table public.location_check_in_tokens from anon, authenticated;
-- No policy: the trainer gets the token from location_check_in_token, a client never reads it.

-- Checks in one booking of the caller (locked by the caller): attended and charged like the trainer's «Был», or
-- nothing new for an attended booking or a request. Returns checked_in, already or requested.
create function private.check_in_booking(p_booking public.bookings)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
begin
  if p_booking.status = 'requested' then
    return 'requested';
  end if;
  if p_booking.status = 'attended' then
    insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
    values (p_booking.id, p_booking.client_id, p_booking.trainer_id, 'qr', v_client)
    on conflict on constraint check_ins_pkey do nothing;
    return 'already';
  end if;
  -- confirmed, or no_show marked before the client came: attended now. A no_show keeps its charge (as when the
  -- trainer corrects the mark); a confirmed booking is charged here, once.
  update public.bookings b
  set status = 'attended', attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_client
  where b.id = p_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (p_booking.id, p_booking.status, 'attended', v_client, 'client', '{"check_in": "qr"}');
  insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
  values (p_booking.id, p_booking.client_id, p_booking.trainer_id, 'qr', v_client)
  on conflict on constraint check_ins_pkey do nothing;
  if p_booking.status = 'confirmed' then
    perform private.post_charge(p_booking.id, 'attended');
  end if;
  return 'checked_in';
end $$;

comment on function private.check_in_booking(public.bookings) is
  'The check-in of one booking of the caller: attended and charged once; returns checked_in, already or requested.';
revoke all on function private.check_in_booking(public.bookings) from public;

-- The session QR, now through check_in_booking; the rest is as in 20261017032700_qr_check_in.sql.
create or replace function public.check_in_by_qr(p_session_id uuid, p_code text)
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

  return query select private.check_in_booking(v_booking), v_booking.id, null::timestamptz;
end $$;

-- The trainer's printed QR of a location: its token, made on first use; p_renew issues a new one and the old print
-- stops working. Raises location_not_found for a location that is not the caller's or is archived.
create function public.location_check_in_token(p_location_id uuid, p_renew boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location public.locations;
  v_token text;
begin
  select l.* into v_location from public.locations l where l.id = p_location_id;
  if v_location.id is null or v_location.archived_at is not null
     or not private.acts_for_trainer(v_location.trainer_id, 'schedule') then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  v_token := pg_catalog.left(pg_catalog.translate(
    pg_catalog.encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), 22);
  insert into public.location_check_in_tokens as t (location_id, trainer_id, token)
  values (v_location.id, v_location.trainer_id, v_token)
  on conflict (location_id) do update
    set token = excluded.token, issued_at = pg_catalog.clock_timestamp()
    where p_renew
  returning t.token into v_token;
  if v_token is null then
    select t.token into v_token from public.location_check_in_tokens t where t.location_id = v_location.id;
  end if;
  return v_token;
end $$;

comment on function public.location_check_in_token(uuid, boolean) is
  'Trainer: the check-in token of a location for its printed QR, made on first use; p_renew replaces it.';
revoke all on function public.location_check_in_token(uuid, boolean) from public, anon;
grant execute on function public.location_check_in_token(uuid, boolean) to authenticated;

-- The client scans the printed QR of a location (§5 rule 2b): the nearest booking of the caller at that location
-- whose window is open is checked in. Returns one row like check_in_by_qr: checked_in, already, requested,
-- too_early (with opens_at of the next booking there), or expired for an unknown token and no_booking when the
-- caller has nothing at that location today or later.
create function public.check_in_by_location(p_token text)
returns table (outcome text, booking_id uuid, opens_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_location uuid;
  v_booking public.bookings;
  v_next timestamptz;
begin
  select t.location_id into v_location from public.location_check_in_tokens t where t.token = p_token;
  if v_location is null then
    return query select 'expired'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select b.* into v_booking
  from public.bookings b join public.sessions s on s.id = b.session_id
  where b.client_id = v_client and s.location_id = v_location and s.status <> 'cancelled'
    and b.status in ('requested', 'confirmed', 'attended', 'no_show')
    and pg_catalog.now() between private.check_in_opens_at(s) and private.check_in_closes_at(s)
  order by pg_catalog.abs(extract(epoch from s.starts_at - pg_catalog.now())), b.created_at desc
  limit 1
  for update of b;

  if v_booking.id is not null then
    return query select private.check_in_booking(v_booking), v_booking.id, null::timestamptz;
    return;
  end if;

  select pg_catalog.min(private.check_in_opens_at(s)) into v_next
  from public.bookings b join public.sessions s on s.id = b.session_id
  where b.client_id = v_client and s.location_id = v_location and s.status <> 'cancelled'
    and b.status in ('requested', 'confirmed') and private.check_in_opens_at(s) > pg_catalog.now();
  if v_next is not null then
    return query select 'too_early'::text, null::uuid, v_next;
    return;
  end if;
  return query select 'no_booking'::text, null::uuid, null::timestamptz;
end $$;

comment on function public.check_in_by_location(text) is
  'Client: check-in by the printed QR of a location, to the nearest booking there with an open window; returns '
  'checked_in, already, requested, too_early, expired or no_booking.';
revoke all on function public.check_in_by_location(text) from public, anon;
grant execute on function public.check_in_by_location(text) to authenticated;

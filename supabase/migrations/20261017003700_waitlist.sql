-- Waitlist for full group sessions (PRD wave-2 §9, data-model §5 "Лист ожидания"; screens.md /client/book).
-- A client joins the queue of a full open group session and sees their place. When a seat frees up, the first
-- in line gets an offer by bot, held for 30 minutes (10 when the session is less than 3 hours away). Accepting
-- books the seat by the usual rule (a pass or allowed debt confirms it, otherwise a request); declining,
-- leaving or letting the offer run out passes it to the next one. No offers go out in the last 30 minutes;
-- when the session starts, the queue closes and those still in it get one "no seat" message.
-- An active offer holds its seat: book_group_session counts it as taken, so a freed seat goes to the queue
-- and two people never take the same one (9.5). The trainer may still add anyone over the queue (§9 rule 7).

create type public.waitlist_status as enum ('waiting', 'offered', 'accepted', 'declined', 'expired', 'left', 'closed');

create table public.waitlist_entries (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions (id) on delete cascade,
  coaching_id      uuid not null references public.coachings (id) on delete cascade,
  client_id        uuid not null references public.profiles (id) on delete cascade,
  trainer_id       uuid not null references public.profiles (id) on delete cascade,
  status           public.waitlist_status not null default 'waiting',
  joined_at        timestamptz not null default clock_timestamp(),
  offered_at       timestamptz,
  offer_expires_at timestamptz,
  resolved_at      timestamptz,
  booking_id       uuid references public.bookings (id) on delete set null,
  constraint waitlist_entries_offer_check check (status <> 'offered' or offer_expires_at is not null)
);

comment on table public.waitlist_entries is
  'The queue of a full group session (PRD wave-2 §9): joined_at orders it. Written only by the waitlist RPCs and the '
  'waitlist job.';
comment on column public.waitlist_entries.trainer_id is 'The session''s trainer, for the trainer''s read policy.';
comment on column public.waitlist_entries.offer_expires_at is 'Until when an offered seat waits for the client''s answer.';

create unique index waitlist_entries_one_live_uniq on public.waitlist_entries (session_id, client_id)
  where status in ('waiting', 'offered');
create index waitlist_entries_queue_idx on public.waitlist_entries (session_id, joined_at);
create index waitlist_entries_offers_idx on public.waitlist_entries (offer_expires_at) where status = 'offered';
create index waitlist_entries_coaching_idx on public.waitlist_entries (coaching_id);
create index waitlist_entries_client_idx on public.waitlist_entries (client_id);
create index waitlist_entries_trainer_idx on public.waitlist_entries (trainer_id);
create index waitlist_entries_booking_idx on public.waitlist_entries (booking_id);

alter table public.waitlist_entries enable row level security;
revoke all on table public.waitlist_entries from anon, authenticated;

create policy "waitlist_entries: client and trainer read"
  on public.waitlist_entries for select
  to authenticated
  using (client_id = (select auth.uid()) or private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "waitlist_entries: client and trainer read" on public.waitlist_entries is
  'A client reads their own places in queues; the trainer reads the queues of their sessions. Writes go through RPCs.';

grant select on table public.waitlist_entries to authenticated;

-- An offer goes out even in quiet hours, silently: it lasts half an hour at most (PRD wave-2 §9 rule 3).
create or replace function private.notification_ignores_quiet_hours(p_type public.notification_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_type in ('session_reminder', 'bot_test', 'waitlist_offer'), false)
$$;

comment on function private.notification_ignores_quiet_hours(public.notification_type) is
  'True for types sent on time in quiet hours, silently: session reminders, waitlist offers and the bot test message.';

-- Seats of a group session nobody holds: capacity less the bookings holding a seat and the offers still open.
create function private.group_free_seats(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select s.capacity
         - (select pg_catalog.count(*)::integer from public.bookings b
            where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show'))
         - (select pg_catalog.count(*)::integer from public.waitlist_entries w
            where w.session_id = s.id and w.status = 'offered' and w.offer_expires_at > pg_catalog.now())
  from public.sessions s
  where s.id = p_session_id
$$;

revoke all on function private.group_free_seats(uuid) from public;

-- Offers free seats of a group session to the queue, first come first served, while the session is scheduled
-- and more than 30 minutes away. Each offer waits 30 minutes, or 10 when the session is less than 3 hours away,
-- and never past the start. Returns the number of offers made.
create function private.waitlist_offer_next(p_session_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_entry public.waitlist_entries;
  v_made integer := 0;
  v_location text;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id for update;
  if v_session.id is null or v_session.kind <> 'group' or v_session.status <> 'scheduled'
     or v_session.starts_at <= pg_catalog.now() + interval '30 minutes' then
    return 0;
  end if;
  select l.name into v_location from public.locations l where l.id = v_session.location_id;

  while private.group_free_seats(v_session.id) > 0 loop
    select w.* into v_entry from public.waitlist_entries w
    where w.session_id = v_session.id and w.status = 'waiting'
      and private.is_live_coaching(w.coaching_id)
    order by w.joined_at, w.id
    limit 1
    for update;
    exit when v_entry.id is null;

    update public.waitlist_entries w
    set status = 'offered', offered_at = pg_catalog.now(),
        offer_expires_at = least(
          pg_catalog.now() + case when v_session.starts_at > pg_catalog.now() + interval '3 hours'
                                  then interval '30 minutes' else interval '10 minutes' end,
          v_session.starts_at)
    where w.id = v_entry.id
    returning w.* into v_entry;

    perform private.enqueue_notification(
      'waitlist_offer',
      pg_catalog.format('waitlist_offer:%s', v_entry.id),
      pg_catalog.jsonb_build_object(
        'entry_id', v_entry.id, 'session_id', v_session.id, 'title', v_session.title, 'starts_at', v_session.starts_at,
        'mode', v_session.mode, 'location', v_location, 'expires_at', v_entry.offer_expires_at)
        || private.trainer_name(v_session.trainer_id),
      v_entry.client_id,
      p_session_id => v_session.id);
    v_made := v_made + 1;
    v_entry := null;
  end loop;
  return v_made;
end $$;

revoke all on function private.waitlist_offer_next(uuid) from public;

-- Closes the queue of a session: entries still waiting or offered become closed and get one К-message (rule 8),
-- with p_reason 'started' or 'cancelled'.
create function private.waitlist_close(p_session_id uuid, p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_closed integer := 0;
begin
  for v_entry in
    update public.waitlist_entries w
    set status = 'closed', resolved_at = pg_catalog.now()
    where w.session_id = p_session_id and w.status in ('waiting', 'offered')
    returning w.id, w.client_id, w.trainer_id
  loop
    perform private.enqueue_notification(
      'waitlist_closed',
      pg_catalog.format('waitlist_closed:%s', v_entry.id),
      pg_catalog.jsonb_build_object(
        'entry_id', v_entry.id, 'session_id', p_session_id, 'reason', p_reason,
        'title', (select s.title from public.sessions s where s.id = p_session_id),
        'starts_at', (select s.starts_at from public.sessions s where s.id = p_session_id))
        || private.trainer_name(v_entry.trainer_id),
      v_entry.client_id,
      p_session_id => p_session_id);
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end $$;

revoke all on function private.waitlist_close(uuid, text) from public;

-- Every minute: offers that ran out pass to the next in line, seats freed in any other way (more seats, a
-- trainer's change) reach the queue, and queues of sessions that started close.
create function private.process_waitlists()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_total integer := 0;
begin
  update public.waitlist_entries w
  set status = 'expired', resolved_at = pg_catalog.now()
  where w.status = 'offered' and w.offer_expires_at <= pg_catalog.now();

  for v_session_id in
    select distinct w.session_id from public.waitlist_entries w
    join public.sessions s on s.id = w.session_id
    where w.status in ('waiting', 'offered') and (s.starts_at <= pg_catalog.now() or s.status <> 'scheduled')
  loop
    perform private.waitlist_close(v_session_id, 'started');
  end loop;

  for v_session_id in
    select distinct w.session_id from public.waitlist_entries w where w.status = 'waiting'
  loop
    v_total := v_total + private.waitlist_offer_next(v_session_id);
  end loop;
  return v_total;
end $$;

revoke all on function private.process_waitlists() from public;

-- cron.schedule with a name replaces a job of the same name, so re-running this file is harmless.
select cron.schedule('waitlists', '* * * * *', 'select private.process_waitlists()');

-- A seat freed by a booking (a cancel, a declined or expired request, a move) goes to the queue at commit, after
-- the same transaction may have cancelled the whole session (cancel_session cancels bookings first).
create function private.bookings_offer_freed_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.waitlist_offer_next(new.session_id);
  return null;
end $$;

revoke all on function private.bookings_offer_freed_seat() from public;

create constraint trigger bookings_offer_freed_seat
  after update of status on public.bookings
  deferrable initially deferred
  for each row
  when (old.status in ('requested', 'confirmed') and new.status not in ('requested', 'confirmed', 'attended', 'no_show'))
  execute function private.bookings_offer_freed_seat();

-- A session's queue follows the session: more seats are offered, a cancelled session closes its queue.
create function private.sessions_waitlist_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'group' then
    return null;
  end if;
  if new.status = 'cancelled' then
    perform private.waitlist_close(new.id, 'cancelled');
  else
    perform private.waitlist_offer_next(new.id);
  end if;
  return null;
end $$;

revoke all on function private.sessions_waitlist_follow() from public;

create constraint trigger sessions_waitlist_follow
  after update of status, capacity on public.sessions
  deferrable initially deferred
  for each row
  when (old.status is distinct from new.status or new.capacity > old.capacity)
  execute function private.sessions_waitlist_follow();

-- Seats held by open offers are not free for a direct booking either: the group is full while the queue is
-- being offered its seats. Otherwise unchanged (20261016235700_group_sessions.sql).
create or replace function private.bookable_group_session(p_session_id uuid)
returns public.sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_notice integer;
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id;
  if v_session.id is null or v_session.kind <> 'group' or not v_session.open_for_booking
     or v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now()
     or not (v_session.trainer_id = any (private.client_trainer_ids(true))) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  select t.min_booking_notice_minutes into v_notice from public.trainer_profiles t where t.user_id = v_session.trainer_id;
  if v_session.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => coalesce(v_notice, 0)) then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.session_id = v_session.id and b.client_id = auth.uid()
      and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  if private.group_free_seats(v_session.id) <= 0 then
    raise exception 'session_full' using errcode = 'P0001';
  end if;
  return v_session;
end $$;

-- The client's booking takes the session lock first, so it and the queue never count the same free seat.
-- Otherwise unchanged (20261016235700_group_sessions.sql).
create or replace function public.book_group_session(p_session_id uuid)
returns table (booking_id uuid, status public.booking_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_session public.sessions;
  v_pair public.coachings;
  v_decision record;
  v_booking_id uuid;
  v_status public.booking_status;
  v_location text;
begin
  perform 1 from public.sessions s where s.id = p_session_id for update;
  v_session := private.bookable_group_session(p_session_id);
  v_pair := private.own_live_pair(v_session.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'group', v_session.starts_at);
  v_status := case when v_decision.confirmed then 'confirmed' else 'requested' end::public.booking_status;

  insert into public.bookings
    (session_id, coaching_id, client_id, trainer_id, status, source, reserved_pass_id, requested_at, confirmed_at)
  values
    (v_session.id, v_pair.id, v_pair.client_id, v_pair.trainer_id, v_status, 'client_session', v_decision.pass_id,
     pg_catalog.now(), case when v_decision.confirmed then pg_catalog.now() end)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, v_status, v_client, 'client',
          case when v_decision.confirmed
            then pg_catalog.jsonb_build_object('auto_confirmed', true, 'pass_id', v_decision.pass_id)
            else '{}'::jsonb end);

  select l.name into v_location from public.locations l where l.id = v_session.location_id;
  perform private.enqueue_notification(
    case when v_decision.confirmed then 'booking_created' else 'booking_requested' end::public.notification_type,
    pg_catalog.format('%s:%s', case when v_decision.confirmed then 'booking_created' else 'booking_requested' end, v_booking_id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking_id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'mode', v_session.mode,
      'location', v_location, 'debt', v_decision.confirmed and v_decision.pass_id is null, 'title', v_session.title)
      || private.person_name(v_pair.client_id),
    v_pair.trainer_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session.id);

  -- A client who was waiting for this session no longer needs the queue.
  update public.waitlist_entries w
  set status = 'accepted', resolved_at = pg_catalog.now(), booking_id = v_booking_id
  where w.session_id = v_session.id and w.client_id = v_client and w.status = 'waiting';

  return query select v_booking_id, v_status;
end $$;

-- The list on /client/book now also says how many are waiting and where the caller stands: taken counts the
-- seats held by open offers, so a group with an offer out shows as full.
drop function public.bookable_group_sessions(uuid, timestamptz, timestamptz);

create function public.bookable_group_sessions(p_trainer_id uuid, p_from timestamptz, p_until timestamptz)
returns table (
  session_id          uuid,
  title               text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  mode                public.session_mode,
  location_id         uuid,
  capacity            smallint,
  taken               integer,
  my_booking_id       uuid,
  my_waitlist_id      uuid,
  my_waitlist_status  public.waitlist_status,
  my_waitlist_place   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.starts_at, s.ends_at, s.mode, s.location_id, s.capacity,
         s.capacity - private.group_free_seats(s.id),
         (select b.id from public.bookings b
          where b.session_id = s.id and b.client_id = (select auth.uid())
            and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
          limit 1),
         w.id, w.status,
         case when w.status = 'waiting' then
           (select pg_catalog.count(*)::integer from public.waitlist_entries q
            where q.session_id = s.id and q.status = 'waiting' and (q.joined_at, q.id) <= (w.joined_at, w.id))
         end
  from public.sessions s
  join public.trainer_profiles t on t.user_id = s.trainer_id
  left join public.waitlist_entries w
    on w.session_id = s.id and w.client_id = (select auth.uid()) and w.status in ('waiting', 'offered')
  where s.trainer_id = p_trainer_id
    and s.trainer_id = any (private.client_trainer_ids(true))
    and s.kind = 'group' and s.open_for_booking and s.status = 'scheduled'
    and s.starts_at >= greatest(p_from, pg_catalog.now() + pg_catalog.make_interval(mins => t.min_booking_notice_minutes))
    and s.starts_at < p_until
  order by s.starts_at
$$;

comment on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) is
  'Client: open group sessions of a trainer of a live pair in a time range, with seats taken (open waitlist offers '
  'included), the caller''s booking and the caller''s place in the queue.';
revoke all on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.bookable_group_sessions(uuid, timestamptz, timestamptz) to authenticated;

-- The client joins the queue of a full open group session (rule 1-2). Returns the entry and the place in line.
-- Raises slot_unavailable, too_late, already_booked, already_waiting or seats_available (book it instead).
create function public.join_waitlist(p_session_id uuid)
returns table (entry_id uuid, place integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_pair public.coachings;
  v_entry_id uuid;
begin
  perform 1 from public.sessions s where s.id = p_session_id for update;
  begin
    v_session := private.bookable_group_session(p_session_id);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'session_full' then
      raise;
    end if;
    select s.* into v_session from public.sessions s where s.id = p_session_id;
  end;
  if private.group_free_seats(v_session.id) > 0 then
    raise exception 'seats_available' using errcode = 'P0001';
  end if;
  v_pair := private.own_live_pair(v_session.trainer_id);
  if exists (
    select 1 from public.waitlist_entries w
    where w.session_id = v_session.id and w.client_id = v_pair.client_id and w.status in ('waiting', 'offered')
  ) then
    raise exception 'already_waiting' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id)
  values (v_session.id, v_pair.id, v_pair.client_id, v_session.trainer_id)
  returning id into v_entry_id;

  return query
    select v_entry_id, (select pg_catalog.count(*)::integer from public.waitlist_entries w
                        where w.session_id = v_session.id and w.status = 'waiting');
end $$;

comment on function public.join_waitlist(uuid) is
  'Client: joins the queue of a full open group session of a trainer of a live pair; returns the place in line.';
revoke all on function public.join_waitlist(uuid) from public, anon;
grant execute on function public.join_waitlist(uuid) to authenticated;

-- The caller's own live entry, locked; raises waitlist_not_found.
create function private.own_waitlist_entry(p_entry_id uuid)
returns public.waitlist_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  select w.* into v_entry from public.waitlist_entries w
  where w.id = p_entry_id and w.client_id = auth.uid() and w.status in ('waiting', 'offered')
  for update;
  if v_entry.id is null then
    raise exception 'waitlist_not_found' using errcode = 'P0001';
  end if;
  return v_entry;
end $$;

revoke all on function private.own_waitlist_entry(uuid) from public;

-- The client leaves the queue, or declines an offered seat; an offered seat goes to the next in line.
create function public.leave_waitlist(p_entry_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  v_entry := private.own_waitlist_entry(p_entry_id);
  update public.waitlist_entries w
  set status = case when v_entry.status = 'offered' then 'declined' else 'left' end::public.waitlist_status,
      resolved_at = pg_catalog.now()
  where w.id = v_entry.id;
  if v_entry.status = 'offered' then
    perform private.waitlist_offer_next(v_entry.session_id);
  end if;
end $$;

comment on function public.leave_waitlist(uuid) is
  'Client: leaves a queue, or declines the seat offered to them, which then goes to the next in line.';
revoke all on function public.leave_waitlist(uuid) from public, anon;
grant execute on function public.leave_waitlist(uuid) to authenticated;

-- What the client sees on /client/waitlist/[id]: the session, their place or the offer and its deadline, and,
-- for an offer, whether a pass confirms the booking and whether a cancel would already be charged (rule 6).
create function public.waitlist_entry_view(p_entry_id uuid)
returns table (
  entry_id          uuid,
  status            public.waitlist_status,
  place             integer,
  offer_expires_at  timestamptz,
  booking_id        uuid,
  session_id        uuid,
  title             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  mode              public.session_mode,
  location          text,
  trainer_id        uuid,
  confirmed         boolean,
  pass_title        text,
  sessions_left     integer,
  inside_deadline   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_session public.sessions;
  v_confirmed boolean;
  v_pass uuid;
  v_deadline smallint;
begin
  select w.* into v_entry from public.waitlist_entries w where w.id = p_entry_id and w.client_id = auth.uid();
  if v_entry.id is null then
    return;
  end if;
  select s.* into v_session from public.sessions s where s.id = v_entry.session_id;
  if v_entry.status = 'offered' then
    select d.confirmed, d.pass_id into v_confirmed, v_pass
    from private.booking_auto_confirm(v_entry.coaching_id, 'group', v_session.starts_at) d;
  end if;
  select t.cancellation_deadline_hours into v_deadline from public.trainer_profiles t where t.user_id = v_session.trainer_id;

  return query
    select v_entry.id, v_entry.status,
           case when v_entry.status = 'waiting' then
             (select pg_catalog.count(*)::integer from public.waitlist_entries q
              where q.session_id = v_entry.session_id and q.status = 'waiting'
                and (q.joined_at, q.id) <= (v_entry.joined_at, v_entry.id))
           end,
           v_entry.offer_expires_at, v_entry.booking_id, v_session.id, v_session.title, v_session.starts_at,
           v_session.ends_at, v_session.mode, (select l.name from public.locations l where l.id = v_session.location_id),
           v_session.trainer_id, v_confirmed, p.title, pb.available - 1,
           pg_catalog.now() > v_session.starts_at - pg_catalog.make_interval(hours => coalesce(v_deadline, 24))
    from (select 1) one
    left join public.passes p on p.id = v_pass
    left join public.pass_balances pb on pb.pass_id = v_pass;
end $$;

comment on function public.waitlist_entry_view(uuid) is
  'Client: one of their queue entries with its session, place, offer deadline, what would pay for the seat and '
  'whether a cancel would already be charged.';
revoke all on function public.waitlist_entry_view(uuid) from public, anon;
grant execute on function public.waitlist_entry_view(uuid) to authenticated;

-- The client takes the offered seat (rule 5): confirmed with a pass or allowed debt, otherwise a request to the
-- trainer that holds the seat. Raises waitlist_not_found, offer_expired or session_full (the trainer gave the
-- seat to someone else meanwhile).
create function public.accept_waitlist_offer(p_entry_id uuid)
returns table (booking_id uuid, status public.booking_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_session public.sessions;
  v_pair public.coachings;
  v_decision record;
  v_booking_id uuid;
  v_status public.booking_status;
  v_location text;
begin
  v_entry := private.own_waitlist_entry(p_entry_id);
  select s.* into v_session from public.sessions s where s.id = v_entry.session_id for update;
  if v_entry.status <> 'offered' or v_entry.offer_expires_at <= pg_catalog.now()
     or v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now() then
    raise exception 'offer_expired' using errcode = 'P0001';
  end if;
  v_pair := private.own_live_pair(v_session.trainer_id);
  select * into v_decision from private.booking_auto_confirm(v_pair.id, 'group', v_session.starts_at);
  v_status := case when v_decision.confirmed then 'confirmed' else 'requested' end::public.booking_status;

  insert into public.bookings
    (session_id, coaching_id, client_id, trainer_id, status, source, reserved_pass_id, requested_at, confirmed_at)
  values
    (v_session.id, v_pair.id, v_pair.client_id, v_pair.trainer_id, v_status, 'waitlist', v_decision.pass_id,
     pg_catalog.now(), case when v_decision.confirmed then pg_catalog.now() end)
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, v_status, v_pair.client_id, 'client',
          pg_catalog.jsonb_build_object('waitlist_entry_id', v_entry.id)
            || case when v_decision.confirmed
                 then pg_catalog.jsonb_build_object('auto_confirmed', true, 'pass_id', v_decision.pass_id)
                 else '{}'::jsonb end);
  update public.waitlist_entries w
  set status = 'accepted', resolved_at = pg_catalog.now(), booking_id = v_booking_id
  where w.id = v_entry.id;

  select l.name into v_location from public.locations l where l.id = v_session.location_id;
  perform private.enqueue_notification(
    case when v_decision.confirmed then 'booking_created' else 'booking_requested' end::public.notification_type,
    pg_catalog.format('%s:%s', case when v_decision.confirmed then 'booking_created' else 'booking_requested' end, v_booking_id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking_id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'mode', v_session.mode,
      'location', v_location, 'debt', v_decision.confirmed and v_decision.pass_id is null, 'title', v_session.title,
      'waitlist', true)
      || private.person_name(v_pair.client_id),
    v_pair.trainer_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session.id);

  return query select v_booking_id, v_status;
end $$;

comment on function public.accept_waitlist_offer(uuid) is
  'Client: takes the seat offered from the queue; confirmed when a pass or allowed debt covers it, otherwise a '
  'request. Returns the booking and its status.';
revoke all on function public.accept_waitlist_offer(uuid) from public, anon;
grant execute on function public.accept_waitlist_offer(uuid) to authenticated;

-- The trainer offers a free seat to anyone in the queue, out of turn (rule 7). Raises waitlist_not_found or
-- session_full.
create function public.trainer_offer_waitlist(p_entry_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_session public.sessions;
  v_location text;
begin
  select w.* into v_entry from public.waitlist_entries w where w.id = p_entry_id and w.status = 'waiting';
  if v_entry.id is null or not private.acts_for_trainer(v_entry.trainer_id, 'schedule') then
    raise exception 'waitlist_not_found' using errcode = 'P0001';
  end if;
  select s.* into v_session from public.sessions s where s.id = v_entry.session_id for update;
  if v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now() then
    raise exception 'waitlist_not_found' using errcode = 'P0001';
  end if;
  if private.group_free_seats(v_session.id) <= 0 then
    raise exception 'session_full' using errcode = 'P0001';
  end if;

  update public.waitlist_entries w
  set status = 'offered', offered_at = pg_catalog.now(),
      offer_expires_at = least(
        pg_catalog.now() + case when v_session.starts_at > pg_catalog.now() + interval '3 hours'
                                then interval '30 minutes' else interval '10 minutes' end,
        v_session.starts_at)
  where w.id = v_entry.id
  returning w.* into v_entry;

  select l.name into v_location from public.locations l where l.id = v_session.location_id;
  perform private.enqueue_notification(
    'waitlist_offer',
    pg_catalog.format('waitlist_offer:%s', v_entry.id),
    pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id, 'session_id', v_session.id, 'title', v_session.title, 'starts_at', v_session.starts_at,
      'mode', v_session.mode, 'location', v_location, 'expires_at', v_entry.offer_expires_at)
      || private.trainer_name(v_session.trainer_id),
    v_entry.client_id,
    p_session_id => v_session.id);
end $$;

comment on function public.trainer_offer_waitlist(uuid) is
  'Trainer: offers a free seat of a group session to a client in its queue, out of turn.';
revoke all on function public.trainer_offer_waitlist(uuid) from public, anon;
grant execute on function public.trainer_offer_waitlist(uuid) to authenticated;

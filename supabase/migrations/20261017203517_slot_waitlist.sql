-- Waitlist for booked personal slots (PRD wave-2 §9 rule 1: "занятые персональные слоты"). It reuses the group
-- queue of 20261017003700_waitlist.sql: an entry now belongs to a group session or to a slot. A client joins the
-- queue of a future slot someone else booked; when the slot opens again (the booking was cancelled, declined,
-- withdrawn or moved), the first in line gets the same bot offer as for a group seat, and the slot is held for
-- them until they answer. Accepting books the slot by the usual rule (book_slot: a pass or allowed debt confirms
-- it, otherwise a request). Declining, leaving or letting the offer run out passes it on; no offers go out within
-- 30 minutes of the start or the trainer's booking notice; at the start the queue closes with one message.
-- Group sessions keep their behaviour: each replaced function below changes only the slot branch.

alter table public.waitlist_entries
  alter column session_id drop not null,
  add column slot_id uuid references public.slots (id) on delete cascade,
  add constraint waitlist_entries_target_check check (num_nonnulls(session_id, slot_id) = 1);

comment on table public.waitlist_entries is
  'The queue of a full group session or of a booked personal slot (PRD wave-2 §9): joined_at orders it. Written only '
  'by the waitlist RPCs and the waitlist jobs.';
comment on column public.waitlist_entries.slot_id is 'The booked personal slot this entry waits for; null for a group session.';

create unique index waitlist_entries_one_live_slot_uniq on public.waitlist_entries (slot_id, client_id)
  where status in ('waiting', 'offered');
create index waitlist_entries_slot_queue_idx on public.waitlist_entries (slot_id, joined_at) where slot_id is not null;

-- True while an open offer holds this slot for someone other than p_client.
create function private.slot_held(p_slot_id uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.waitlist_entries w
    where w.slot_id = p_slot_id and w.status = 'offered' and w.offer_expires_at > pg_catalog.now()
      and w.client_id is distinct from p_client)
$$;

revoke all on function private.slot_held(uuid, uuid) from public;

-- An open slot held by an offer is not bookable for anyone else (9.5). Otherwise unchanged
-- (20261016221900_client_bookings.sql).
create or replace function private.bookable_slot(p_slot_id uuid)
returns public.slots
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_notice integer;
begin
  select s.* into v_slot from public.slots s where s.id = p_slot_id;
  if v_slot.id is null or v_slot.status <> 'open' or v_slot.starts_at <= pg_catalog.now()
     or not (v_slot.trainer_id = any (private.client_trainer_ids(true)))
     or private.slot_held(v_slot.id, auth.uid()) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  select t.min_booking_notice_minutes into v_notice from public.trainer_profiles t where t.user_id = v_slot.trainer_id;
  if v_slot.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => coalesce(v_notice, 0)) then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  return v_slot;
end $$;

-- The latest a slot can still be offered: 30 minutes before the start (rule 4), or the booking notice if longer.
create function private.slot_offer_deadline(p_slot public.slots)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select p_slot.starts_at - greatest(
    interval '30 minutes',
    pg_catalog.make_interval(mins => coalesce(
      (select t.min_booking_notice_minutes from public.trainer_profiles t where t.user_id = p_slot.trainer_id), 0)))
$$;

revoke all on function private.slot_offer_deadline(public.slots) from public;

-- Offers the slot to one entry: 30 minutes to answer, 10 when the slot is less than 3 hours away, never past the
-- start; the client gets the waitlist_offer message.
create function private.slot_offer_to(p_entry_id uuid, p_slot public.slots)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  update public.waitlist_entries w
  set status = 'offered', offered_at = pg_catalog.now(),
      offer_expires_at = least(
        pg_catalog.now() + case when p_slot.starts_at > pg_catalog.now() + interval '3 hours'
                                then interval '30 minutes' else interval '10 minutes' end,
        p_slot.starts_at)
  where w.id = p_entry_id
  returning w.* into v_entry;

  perform private.enqueue_notification(
    'waitlist_offer',
    pg_catalog.format('waitlist_offer:%s', v_entry.id),
    pg_catalog.jsonb_build_object(
      'entry_id', v_entry.id, 'slot_id', p_slot.id, 'title', null, 'starts_at', p_slot.starts_at,
      'mode', p_slot.mode, 'location', (select l.name from public.locations l where l.id = p_slot.location_id),
      'expires_at', v_entry.offer_expires_at)
      || private.trainer_name(p_slot.trainer_id),
    v_entry.client_id);
end $$;

revoke all on function private.slot_offer_to(uuid, public.slots) from public;

-- Offers an open slot to the first in its queue, when nobody holds it and it is not too late. Returns 1 when an
-- offer went out, else 0.
create function private.slot_offer_next(p_slot_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_entry_id uuid;
begin
  select s.* into v_slot from public.slots s where s.id = p_slot_id for update;
  if v_slot.id is null or v_slot.status <> 'open' or pg_catalog.now() >= private.slot_offer_deadline(v_slot)
     or private.slot_held(v_slot.id, null) then
    return 0;
  end if;
  select w.id into v_entry_id from public.waitlist_entries w
  where w.slot_id = v_slot.id and w.status = 'waiting' and private.is_live_coaching(w.coaching_id)
  order by w.joined_at, w.id
  limit 1
  for update;
  if v_entry_id is null then
    return 0;
  end if;
  perform private.slot_offer_to(v_entry_id, v_slot);
  return 1;
end $$;

revoke all on function private.slot_offer_next(uuid) from public;

-- Closes the queue of a slot: entries still waiting or offered become closed and get one message (rule 8).
create function private.slot_waitlist_close(p_slot_id uuid, p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_closed integer := 0;
  v_starts timestamptz := (select s.starts_at from public.slots s where s.id = p_slot_id);
begin
  for v_entry in
    update public.waitlist_entries w
    set status = 'closed', resolved_at = pg_catalog.now()
    where w.slot_id = p_slot_id and w.status in ('waiting', 'offered')
    returning w.id, w.client_id, w.trainer_id
  loop
    perform private.enqueue_notification(
      'waitlist_closed',
      pg_catalog.format('waitlist_closed:%s', v_entry.id),
      pg_catalog.jsonb_build_object(
        'entry_id', v_entry.id, 'slot_id', p_slot_id, 'reason', p_reason, 'title', null, 'starts_at', v_starts)
        || private.trainer_name(v_entry.trainer_id),
      v_entry.client_id);
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end $$;

revoke all on function private.slot_waitlist_close(uuid, text) from public;

-- Every minute: slot offers that ran out pass to the next in line, queues of slots that started close, and
-- slots opened in any other way reach their queue.
create function private.process_slot_waitlists()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_total integer := 0;
begin
  update public.waitlist_entries w
  set status = 'expired', resolved_at = pg_catalog.now()
  where w.slot_id is not null and w.status = 'offered' and w.offer_expires_at <= pg_catalog.now();

  for v_slot_id in
    select distinct w.slot_id from public.waitlist_entries w
    join public.slots s on s.id = w.slot_id
    where w.status in ('waiting', 'offered') and (s.starts_at <= pg_catalog.now() or s.status = 'closed')
  loop
    perform private.slot_waitlist_close(v_slot_id, 'started');
  end loop;

  for v_slot_id in
    select distinct w.slot_id from public.waitlist_entries w where w.slot_id is not null and w.status = 'waiting'
  loop
    v_total := v_total + private.slot_offer_next(v_slot_id);
  end loop;
  return v_total;
end $$;

revoke all on function private.process_slot_waitlists() from public;

select cron.schedule('slot-waitlists', '* * * * *', 'select private.process_slot_waitlists()');

-- A slot that opens again (a cancel, a declined, withdrawn or expired request, a move) goes to its queue at commit.
create function private.slots_offer_reopened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.slot_offer_next(new.id);
  return null;
end $$;

revoke all on function private.slots_offer_reopened() from public;

create constraint trigger slots_offer_reopened
  after update of status on public.slots
  deferrable initially deferred
  for each row
  when (old.status = 'booked' and new.status = 'open')
  execute function private.slots_offer_reopened();

-- A slot that is deleted (the time passed or the trainer removed it) closes its queue first.
create function private.slots_close_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.slot_waitlist_close(old.id, 'cancelled');
  return old;
end $$;

revoke all on function private.slots_close_waitlist() from public;

create trigger slots_close_waitlist
  before delete on public.slots
  for each row
  execute function private.slots_close_waitlist();

-- The client joins the queue of a future slot of their trainer that someone else booked or holds (rule 1-2),
-- while an offer could still reach them.
-- Returns the entry and the place in line. Raises slot_unavailable, already_booked, already_waiting or
-- seats_available (the slot is free: book it instead).
create function public.join_slot_waitlist(p_slot_id uuid)
returns table (entry_id uuid, place integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_pair public.coachings;
  v_entry_id uuid;
begin
  select s.* into v_slot from public.slots s where s.id = p_slot_id for update;
  if v_slot.id is null or v_slot.status = 'closed' or pg_catalog.now() >= private.slot_offer_deadline(v_slot)
     or not (v_slot.trainer_id = any (private.client_trainer_ids(true))) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  v_pair := private.own_live_pair(v_slot.trainer_id);
  if v_slot.status = 'open' and not private.slot_held(v_slot.id, v_pair.client_id) then
    raise exception 'seats_available' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.sessions s
    join public.bookings b on b.session_id = s.id
    where s.slot_id = v_slot.id and b.client_id = v_pair.client_id and b.status in ('requested', 'confirmed')
  ) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.waitlist_entries w
    where w.slot_id = v_slot.id and w.client_id = v_pair.client_id and w.status in ('waiting', 'offered')
  ) then
    raise exception 'already_waiting' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries (slot_id, coaching_id, client_id, trainer_id)
  values (v_slot.id, v_pair.id, v_pair.client_id, v_slot.trainer_id)
  returning id into v_entry_id;

  return query
    select v_entry_id, (select pg_catalog.count(*)::integer from public.waitlist_entries w
                        where w.slot_id = v_slot.id and w.status = 'waiting');
end $$;

comment on function public.join_slot_waitlist(uuid) is
  'Client: joins the queue of a booked future slot of a trainer of a live pair; returns the place in line.';
revoke all on function public.join_slot_waitlist(uuid) from public, anon;
grant execute on function public.join_slot_waitlist(uuid) to authenticated;

-- The slots of a trainer a client could queue for on /client/book: booked or held by someone else, still ahead
-- of the offer deadline, with how many wait and the caller's own live entry.
create function public.waitlist_slots(p_trainer_id uuid, p_from timestamptz, p_until timestamptz)
returns table (
  slot_id     uuid,
  starts_at   timestamptz,
  ends_at     timestamptz,
  mode        public.session_mode,
  location_id uuid,
  waiting     integer,
  my_entry_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at, s.mode, s.location_id,
         (select pg_catalog.count(*)::integer from public.waitlist_entries w where w.slot_id = s.id and w.status = 'waiting'),
         (select w.id from public.waitlist_entries w
          where w.slot_id = s.id and w.client_id = (select auth.uid()) and w.status in ('waiting', 'offered'))
  from public.slots s
  where p_trainer_id = any (private.client_trainer_ids(true))
    and s.trainer_id = p_trainer_id
    and s.starts_at >= p_from and s.starts_at < p_until
    and pg_catalog.now() < private.slot_offer_deadline(s)
    and (s.status = 'booked' or (s.status = 'open' and private.slot_held(s.id, (select auth.uid()))))
    and not exists (
      select 1 from public.sessions x join public.bookings b on b.session_id = x.id
      where x.slot_id = s.id and b.client_id = (select auth.uid()) and b.status in ('requested', 'confirmed'))
  order by s.starts_at
$$;

comment on function public.waitlist_slots(uuid, timestamptz, timestamptz) is
  'Client: booked slots of their trainer they can queue for, with the queue length and their own entry.';
revoke all on function public.waitlist_slots(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.waitlist_slots(uuid, timestamptz, timestamptz) to authenticated;

-- The client leaves the queue, or declines an offered seat or slot, which goes to the next in line.
-- Otherwise unchanged (20261017003700_waitlist.sql).
create or replace function public.leave_waitlist(p_entry_id uuid)
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
    if v_entry.slot_id is not null then
      perform private.slot_offer_next(v_entry.slot_id);
    else
      perform private.waitlist_offer_next(v_entry.session_id);
    end if;
  end if;
end $$;

-- What the client sees on /client/waitlist/[id], for a slot too: its time, place, the offer and what would pay
-- for it (a personal booking). Otherwise unchanged (20261017003700_waitlist.sql).
create or replace function public.waitlist_entry_view(p_entry_id uuid)
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
  v_slot public.slots;
  v_starts timestamptz;
  v_trainer uuid;
  v_confirmed boolean;
  v_pass uuid;
  v_deadline smallint;
begin
  select w.* into v_entry from public.waitlist_entries w where w.id = p_entry_id and w.client_id = auth.uid();
  if v_entry.id is null then
    return;
  end if;
  if v_entry.slot_id is not null then
    select s.* into v_slot from public.slots s where s.id = v_entry.slot_id;
    v_starts := v_slot.starts_at;
    v_trainer := v_slot.trainer_id;
  else
    select s.* into v_session from public.sessions s where s.id = v_entry.session_id;
    v_starts := v_session.starts_at;
    v_trainer := v_session.trainer_id;
  end if;
  if v_entry.status = 'offered' then
    select d.confirmed, d.pass_id into v_confirmed, v_pass
    from private.booking_auto_confirm(
      v_entry.coaching_id, case when v_slot.id is null then 'group' else 'personal' end::public.session_kind, v_starts) d;
  end if;
  select t.cancellation_deadline_hours into v_deadline from public.trainer_profiles t where t.user_id = v_trainer;

  return query
    select v_entry.id, v_entry.status,
           case when v_entry.status = 'waiting' then
             (select pg_catalog.count(*)::integer from public.waitlist_entries q
              where (q.session_id = v_entry.session_id or q.slot_id = v_entry.slot_id) and q.status = 'waiting'
                and (q.joined_at, q.id) <= (v_entry.joined_at, v_entry.id))
           end,
           v_entry.offer_expires_at, v_entry.booking_id, v_session.id, v_session.title, v_starts,
           coalesce(v_session.ends_at, v_slot.ends_at), coalesce(v_session.mode, v_slot.mode),
           (select l.name from public.locations l where l.id = coalesce(v_session.location_id, v_slot.location_id)),
           v_trainer, v_confirmed, p.title, pb.available - 1,
           pg_catalog.now() > v_starts - pg_catalog.make_interval(hours => coalesce(v_deadline, 24))
    from (select 1) one
    left join public.passes p on p.id = v_pass
    left join public.pass_balances pb on pb.pass_id = v_pass;
end $$;

-- The client takes the offered seat or slot (rule 5). A slot is booked by book_slot, as from /client/book, and the
-- booking is marked as coming from the queue. Otherwise unchanged (20261017003700_waitlist.sql).
create or replace function public.accept_waitlist_offer(p_entry_id uuid)
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
  if v_entry.slot_id is not null then
    if v_entry.status <> 'offered' or v_entry.offer_expires_at <= pg_catalog.now() then
      raise exception 'offer_expired' using errcode = 'P0001';
    end if;
    begin
      select b.booking_id, b.status into v_booking_id, v_status from public.book_slot(v_entry.slot_id) b;
    exception when sqlstate 'P0001' then
      if sqlerrm not in ('slot_unavailable', 'too_late') then
        raise;
      end if;
      raise exception 'offer_expired' using errcode = 'P0001';
    end;
    update public.bookings b set source = 'waitlist' where b.id = v_booking_id;
    update public.waitlist_entries w
    set status = 'accepted', resolved_at = pg_catalog.now(), booking_id = v_booking_id
    where w.id = v_entry.id;
    return query select v_booking_id, v_status;
    return;
  end if;

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

-- The trainer offers a free slot to anyone in its queue, out of turn (rule 7); a slot still booked is
-- session_full. Otherwise unchanged (20261017003700_waitlist.sql).
create or replace function public.trainer_offer_waitlist(p_entry_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_session public.sessions;
  v_slot public.slots;
  v_location text;
begin
  select w.* into v_entry from public.waitlist_entries w where w.id = p_entry_id and w.status = 'waiting';
  if v_entry.id is null or not private.acts_for_trainer(v_entry.trainer_id, 'schedule') then
    raise exception 'waitlist_not_found' using errcode = 'P0001';
  end if;
  if v_entry.slot_id is not null then
    select s.* into v_slot from public.slots s where s.id = v_entry.slot_id for update;
    if v_slot.starts_at <= pg_catalog.now() then
      raise exception 'waitlist_not_found' using errcode = 'P0001';
    end if;
    if v_slot.status <> 'open' or private.slot_held(v_slot.id, null) then
      raise exception 'session_full' using errcode = 'P0001';
    end if;
    perform private.slot_offer_to(v_entry.id, v_slot);
    return;
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

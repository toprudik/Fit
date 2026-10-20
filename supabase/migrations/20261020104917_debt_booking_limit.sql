-- Debt bookings by the client (decision of 18.10.2026, docs/decisions.md Q22).
--
-- Without the trainer's permission a client holds at most one unpaid session at a time, and it comes to the trainer
-- as a request. With the permission (self_book_on_debt) the client books without confirmation, up to the number of
-- unpaid sessions the trainer set (debt_limit_sessions, 1 by default). Unpaid sessions are the ones charged to debt
-- plus live bookings no pass covers and not charged yet. Before, the limit counted only charged sessions, so a client
-- could confirm or request any number of future sessions. Bookings the trainer makes or confirms are not limited (Q20),
-- and an on-site check-in without a booking still reaches the trainer as a request.

alter table public.coachings alter column debt_limit_sessions set default 1;
update public.coachings set debt_limit_sessions = 1 where debt_limit_sessions is null;
comment on column public.coachings.debt_limit_sessions is
  'How many unpaid sessions the client may hold when booking on their own with self_book_on_debt: charged debt plus '
  'booked sessions no pass covers. The trainer sets it with the permission, 1 by default; null means no limit. '
  'Without the permission the client may hold one, as a request. The trainer''s own bookings are not limited.';

create function private.unpaid_sessions(p_coaching uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select cb.debt_sessions from public.coaching_balances cb where cb.coaching_id = p_coaching), 0)
       + (select count(*)::integer
          from public.bookings b
          where b.coaching_id = p_coaching
            and b.status in ('requested', 'confirmed', 'attended')
            and b.reserved_pass_id is null
            and b.source <> 'trial'
            and not exists (select 1 from public.ledger_entries e where e.booking_id = b.id and e.entry_type = 'charge'))
$$;
comment on function private.unpaid_sessions(uuid) is
  'Sessions of the pair the client has not paid for: charged to debt, plus live bookings with no pass behind them '
  'that are not charged yet (requests included). Trial bookings are paid on their own terms and do not count.';
revoke all on function private.unpaid_sessions(uuid) from public, anon, authenticated;

-- booking_auto_confirm (20261018194617_qa_money_booking_fixes.sql).
create or replace function private.booking_auto_confirm(p_coaching uuid, p_kind public.session_kind, p_starts_at timestamptz)
returns table (confirmed boolean, pass_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_day date;
  v_pass uuid;
  v_debt integer;
  v_cap integer;
begin
  perform pg_catalog.set_config('dafit.debt_limit_reached', '', true);
  -- One decision per pair at a time: a concurrent booking of the same pair waits here until this transaction
  -- ends, and its queries below then see the session this one reserved.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('booking_auto_confirm:' || p_coaching::text, 0));
  select c.* into v_pair from public.coachings c where c.id = p_coaching;
  if v_pair.id is null then
    return query select false, null::uuid;
    return;
  end if;
  v_day := (p_starts_at at time zone private.trainer_zone(v_pair.trainer_id))::date;

  select pb.pass_id into v_pass
  from public.pass_balances pb
  join public.passes p on p.id = pb.pass_id
  where pb.coaching_id = p_coaching
    and p.status = 'active'
    and pb.available >= 1
    and p.applies_to in ('any', case when p_kind = 'group' then 'group' else 'personal' end::public.package_applies_to)
    and p.starts_on <= v_day
    and (pb.effective_expires_at is null or pb.effective_expires_at > p_starts_at)
    and not exists (select 1 from public.pass_freezes f where f.pass_id = p.id and f.period @> v_day)
  order by pb.effective_expires_at nulls last, p.starts_on, p.created_at
  limit 1;
  if v_pass is not null then
    return query select true, v_pass;
    return;
  end if;

  v_debt := private.unpaid_sessions(p_coaching);
  if v_pair.self_book_on_debt and v_debt < coalesce(v_pair.debt_limit_sessions, 2147483647) then
    return query select true, null::uuid;
    return;
  end if;
  -- Past the client's own limit (one session awaiting the trainer, or the number the trainer allowed), the booking
  -- the client is about to make is refused by bookings_debt_limit. Previews call this too and insert nothing.
  v_cap := case when v_pair.self_book_on_debt then coalesce(v_pair.debt_limit_sessions, 2147483647) else 1 end;
  if v_debt >= v_cap then
    perform pg_catalog.set_config('dafit.debt_limit_reached', p_coaching::text, true);
  end if;
  return query select false, null::uuid;
end $$;

create function private.bookings_debt_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reserved_pass_id is null
     and new.source in ('client_slot', 'client_session', 'waitlist')
     and pg_catalog.current_setting('dafit.debt_limit_reached', true) = new.coaching_id::text then
    raise exception 'debt_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
comment on function private.bookings_debt_limit() is
  'Refuses a booking the client makes without a pass once booking_auto_confirm found the client at their debt limit.';
revoke all on function private.bookings_debt_limit() from public, anon, authenticated;

create trigger bookings_debt_limit
before insert on public.bookings
for each row execute function private.bookings_debt_limit();

-- accept_waitlist_offer (20261017203517_slot_waitlist.sql): past the debt limit the offer is not left hanging until
-- it expires, it goes to the next in line as on "Отказаться", and the answer is the status declined with no booking.
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
      if sqlerrm = 'debt_limit' then
        -- Past the debt limit the client cannot take the slot: the offer goes to the next in line, as on "Отказаться".
        perform public.leave_waitlist(v_entry.id);
        return query select null::uuid, 'declined'::public.booking_status;
        return;
      end if;
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
  if pg_catalog.current_setting('dafit.debt_limit_reached', true) = v_pair.id::text then
    perform public.leave_waitlist(v_entry.id);
    return query select null::uuid, 'declined'::public.booking_status;
    return;
  end if;
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
  'request. Returns the booking and its status. Past the client''s debt limit the offer goes to the next in line and '
  'the answer is declined with no booking.';

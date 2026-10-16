-- Charges and waivers (PRD wave-1 §2.6.2 rules 7 and 9, §2.6.6, SCHED-11..14, SCHED-22; data-model §3.3, §3.4).
-- The ledger tables and their cross-row rules are in 20261015120600_bookings_ledger_tables.sql; the pass choice
-- and share helpers in 20261016214300_passes_payments.sql. Here:
--   * private.post_charge: the one place that takes a session from a pass, or into debt, for a booking.
--   * private.waive_entry: the waiver of a charge, and the reversal of its settlement when there was one.
--   * private.complete_sessions (pg_cron): when a session ends, its confirmed bookings become attended and are
--     charged, and the session is completed (2.6.2-9).
--   * mark_attendance: the trainer corrects attended and no_show after the start (the charge stays), or marks the
--     booking "Не состоялось", a cancellation by the trainer that takes the charge back (2.6.6-5).
--   * waive_charge: the trainer forgives one charge (2.6.6-4); final, one per charge.
--   * record_past_session: the trainer records a session that already took place (2.6.2-7).
--   * adjust_pass: a manual correction of a pass with a note (R84), the way back from a mistaken waiver.
-- The client's late cancellation calls post_charge too; it comes with the client's cancel and reschedule.

-- The drop-in price of the trainer for a session of this kind, in the trainer's default currency: the live
-- package of one session that fits the kind, the cheapest when there are several. A debt charge earns it.
create function private.drop_in_price(p_trainer uuid, p_kind public.session_kind)
returns table (amount_minor bigint, currency public.currency_code)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select min(pk.price_minor)
           from public.packages pk
           where pk.trainer_id = t.user_id and pk.archived_at is null and pk.sessions_count = 1
             and pk.currency = t.default_currency and private.pass_fits_kind(pk.applies_to, p_kind)), 0),
         t.default_currency
  from public.trainer_profiles t
  where t.user_id = p_trainer
$$;

comment on function private.drop_in_price(uuid, public.session_kind) is
  'Price of one session of this kind from the trainer''s live one-session packages in the default currency (0 without one).';
revoke all on function private.drop_in_price(uuid, public.session_kind) from public;

-- Charges a booking once (data-model §3.3, §3.4): from the booking's reserved pass while it still qualifies,
-- else the pass the choice rule picks, else into debt at the drop-in price. A trial booking without a pass is
-- not charged: a free trial creates no ledger row (PRD 2.4-6). The booking already has its new status. Returns
-- the charge, the existing one when the booking was charged before, or null for a free trial.
create function private.post_charge(p_booking_id uuid, p_reason public.charge_reason)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_charge  uuid;
  v_pass    uuid;
  v_left    integer;
  v_amount  bigint;
  v_currency public.currency_code;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_session from public.sessions s where s.id = v_booking.session_id;
  select e.id into v_charge from public.ledger_entries e where e.booking_id = p_booking_id and e.entry_type = 'charge';
  if v_charge is not null then
    return v_charge;
  end if;

  -- Two charges may pick the same last session of a pass at once: lock the pass, check it still has one, and pick
  -- again otherwise. Each statement in READ COMMITTED sees what the other transaction committed meanwhile.
  for i in 1..3 loop
    v_pass := private.pick_pass(v_booking.coaching_id, v_session.kind, v_session.starts_at, v_booking.reserved_pass_id);
    exit when v_pass is null;
    perform 1 from public.passes p where p.id = v_pass for no key update;
    select coalesce(sum(e.sessions_delta), 0)::integer into v_left from public.ledger_entries e where e.pass_id = v_pass;
    exit when v_left > 0;
    v_pass := null;
  end loop;

  if v_pass is not null then
    select private.pass_next_share(v_pass), p.currency into v_amount, v_currency from public.passes p where p.id = v_pass;
  elsif v_booking.source = 'trial' then
    return null;
  else
    select d.amount_minor, d.currency into v_amount, v_currency from private.drop_in_price(v_booking.trainer_id, v_session.kind) d;
  end if;

  insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, sessions_delta, amount_minor, currency,
                                     charge_reason, occurred_at)
  values (v_booking.coaching_id, 'charge', v_pass, v_booking.id, -1, coalesce(v_amount, 0),
          case when coalesce(v_amount, 0) = 0 and v_pass is null then null else v_currency end,
          p_reason, v_session.starts_at)
  returning id into v_charge;
  return v_charge;
end $$;

comment on function private.post_charge(uuid, public.charge_reason) is
  'Charges a booking once: its reserved pass, the pass the choice rule picks, or debt at the drop-in price; a trial '
  'without a pass is free. Returns the charge (null for a free trial).';
revoke all on function private.post_charge(uuid, public.charge_reason) from public;

-- К8 to the client: a session was taken for a late cancellation or a no-show (PRD 2.6.6, §4 К8). The payload
-- names the pass and what is left on it, or the debt when the session went into debt.
create function private.notify_charge(p_charge_id uuid, p_type public.notification_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.ledger_entries;
  v_payload jsonb;
begin
  select * into v_entry from public.ledger_entries e where e.id = p_charge_id;
  if v_entry.id is null then
    return;
  end if;
  select pg_catalog.jsonb_build_object(
           'coaching_id', v_entry.coaching_id,
           'charge_id', p_charge_id,
           'reason', v_entry.charge_reason,
           'starts_at', v_entry.occurred_at,
           'pass_id', p.id,
           'pass_title', p.title,
           'remaining', (select coalesce(sum(x.sessions_delta), 0) from public.ledger_entries x where x.pass_id = p.id),
           'debt_sessions', (select cb.debt_sessions from public.coaching_balances cb where cb.coaching_id = v_entry.coaching_id))
         || private.trainer_name(v_entry.trainer_id)
    into v_payload
  from (select 1) one
  left join public.passes p on p.id = v_entry.pass_id;
  if p_type = 'charge_waived' then
    select v_payload || pg_catalog.jsonb_build_object('reason', e.charge_reason, 'starts_at', e.occurred_at)
      into v_payload
    from public.ledger_entries e where e.id = v_entry.related_entry_id;
  end if;
  perform private.enqueue_notification(
    p_type, pg_catalog.format('%s:%s', p_type, p_charge_id), v_payload, v_entry.client_id,
    p_booking_id => v_entry.booking_id);
end $$;

comment on function private.notify_charge(uuid, public.notification_type) is
  'Queues К8 (charge_posted) or К9 (charge_waived, given the waiver) to the client with the pass and what is left.';
revoke all on function private.notify_charge(uuid, public.notification_type) from public;

-- Waives a charge (data-model §3.3): a waiver that mirrors it, and when a settlement covered the charge, the
-- reversal of that settlement, so the session returns to the pass that paid for it. Returns the waiver, or null
-- when the charge was waived before.
create function private.waive_entry(p_charge_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.ledger_entries;
  v_settlement public.ledger_entries;
  v_waiver uuid;
begin
  select * into v_charge from public.ledger_entries e where e.id = p_charge_id and e.entry_type = 'charge';
  if v_charge.id is null
     or exists (select 1 from public.ledger_entries w where w.related_entry_id = p_charge_id and w.entry_type = 'waiver') then
    return null;
  end if;
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, related_entry_id, sessions_delta,
                                     amount_minor, currency, occurred_at, note)
  values (v_charge.coaching_id, 'waiver', v_charge.pass_id, v_charge.booking_id, v_charge.id, 1,
          -v_charge.amount_minor, v_charge.currency, pg_catalog.now(), p_note)
  returning id into v_waiver;

  select * into v_settlement from public.ledger_entries e where e.related_entry_id = p_charge_id and e.entry_type = 'settlement';
  if v_settlement.id is not null then
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, booking_id, related_entry_id, sessions_delta,
                                       amount_minor, currency, occurred_at, note)
    values (v_charge.coaching_id, 'settlement_reversal', v_settlement.pass_id, v_charge.booking_id, v_charge.id, 1,
            -v_settlement.amount_minor, v_settlement.currency, pg_catalog.now(), p_note);
  end if;
  return v_waiver;
end $$;

comment on function private.waive_entry(uuid, text) is
  'Writes the waiver of a charge and the reversal of its settlement if any; null when it was waived before.';
revoke all on function private.waive_entry(uuid, text) from public;

-- Session end (PRD 2.6.2-9, SCHED-11) ---------------------------------------------------------------------------

-- Sessions that have ended are completed; their confirmed bookings become attended and are charged. Each session
-- runs in its own subtransaction, so one bad row does not hold back the others; it is retried on the next run.
-- Every five minutes, so a session is charged at most five minutes after its end. Returns the sessions completed.
create function private.complete_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_booking uuid;
  v_done integer := 0;
begin
  for v_session in
    select s.id from public.sessions s
    where s.status = 'scheduled' and s.ends_at <= pg_catalog.now()
    order by s.ends_at
    limit 500
  loop
    begin
      perform 1 from public.sessions s where s.id = v_session and s.status = 'scheduled' for update skip locked;
      continue when not found;
      for v_booking in
        select b.id from public.bookings b where b.session_id = v_session and b.status = 'confirmed' for update
      loop
        update public.bookings set status = 'attended', attendance_marked_at = pg_catalog.now(), attendance_marked_by = null
        where id = v_booking;
        insert into public.booking_events (booking_id, from_status, to_status, actor_role, payload)
        values (v_booking, 'confirmed', 'attended', 'system', '{}');
        perform private.post_charge(v_booking, 'attended');
      end loop;
      update public.sessions set status = 'completed', completed_at = pg_catalog.now() where id = v_session;
      v_done := v_done + 1;
    exception when others then
      raise warning 'complete_sessions: session % skipped: %', v_session, sqlerrm;
    end;
  end loop;
  return v_done;
end $$;

comment on function private.complete_sessions() is
  'pg_cron: completes ended sessions; their confirmed bookings become attended and are charged. Returns how many.';
revoke all on function private.complete_sessions() from public;

select cron.schedule('sessions-complete', '*/5 * * * *', 'select private.complete_sessions()');

-- The trainer's side -------------------------------------------------------------------------------------------

-- A booking of the caller's pair, locked, with its session. Raises booking_not_found otherwise.
create function private.own_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id and b.trainer_id = auth.uid() for update;
  if v_booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  return v_booking;
end $$;

revoke all on function private.own_booking(uuid) from public;

-- After the start, the trainer marks a booking (PRD 2.6.2-9, SCHED-12):
--   * attended or no_show from confirmed: the booking is charged now;
--   * attended <-> no_show: only the status changes, the charge stays (К8 goes to the client on no_show);
--   * cancelled ("Не состоялось", with a reason): a cancellation by the trainer; a charge is taken back by a
--     waiver, and a personal session with no other booking left is cancelled too.
-- Returns the new status. Raises booking_not_found, not_started, invalid_status or reason_required.
create function public.mark_attendance(p_booking_id uuid, p_status public.booking_status, p_reason text default null)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_charge uuid;
begin
  v_booking := private.own_booking(p_booking_id);
  select * into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_session.starts_at > pg_catalog.now() then
    raise exception 'not_started' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show', 'cancelled')
     or v_booking.status not in ('confirmed', 'attended', 'no_show')
     or (v_session.status = 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if p_status = 'cancelled' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_status = v_booking.status then
    return p_status;
  end if;

  if p_status = 'cancelled' then
    update public.bookings
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'trainer',
        cancel_reason = v_reason, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_user
    where id = v_booking.id;
  else
    update public.bookings set status = p_status, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_user
    where id = v_booking.id;
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, v_booking.status, p_status, v_user, 'trainer', v_reason, '{}');

  select e.id into v_charge from public.ledger_entries e where e.booking_id = v_booking.id and e.entry_type = 'charge';
  if p_status = 'cancelled' then
    if v_charge is not null then
      perform private.waive_entry(v_charge, v_reason);
    end if;
    if v_session.kind <> 'group' and not exists (
      select 1 from public.bookings b
      where b.session_id = v_session.id and b.status in ('requested', 'confirmed', 'attended', 'no_show')
    ) then
      update public.sessions
      set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = v_reason
      where id = v_session.id;
    end if;
  elsif v_booking.status = 'confirmed' then
    v_charge := private.post_charge(v_booking.id, p_status::text::public.charge_reason);
    if p_status = 'no_show' then
      perform private.notify_charge(v_charge, 'charge_posted');
    end if;
  elsif p_status = 'no_show' then
    perform private.notify_charge(v_charge, 'charge_posted');
  end if;
  return p_status;
end $$;

comment on function public.mark_attendance(uuid, public.booking_status, text) is
  'Trainer, after the start: attended or no_show (charged once, corrections keep the charge), or cancelled with a '
  'reason ("Не состоялось"; the charge is taken back). Returns the new status.';
revoke all on function public.mark_attendance(uuid, public.booking_status, text) from public, anon;
grant execute on function public.mark_attendance(uuid, public.booking_status, text) to authenticated;

-- The trainer forgives one charge of a pair (PRD 2.6.6-4, SCHED-13): the session returns to the same pass, even
-- an expired one, or the debt shrinks; a settlement of the charge is reversed. The reason is optional. A waiver is
-- final. The client gets К9. Returns the waiver. Raises charge_not_found, already_waived or reason_too_long.
create function public.waive_charge(p_charge_id uuid, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_charge public.ledger_entries;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_status public.booking_status;
  v_waiver uuid;
begin
  select e.* into v_charge from public.ledger_entries e
  where e.id = p_charge_id and e.entry_type = 'charge' and e.trainer_id = v_user;
  if v_charge.id is null then
    raise exception 'charge_not_found' using errcode = 'P0002';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  -- Locks the booking, so a waiver and a "Не состоялось" of one booking run one after the other.
  if v_charge.booking_id is not null then
    select b.status into v_status from public.bookings b where b.id = v_charge.booking_id for update;
  end if;
  v_waiver := private.waive_entry(v_charge.id, v_reason);
  if v_waiver is null then
    raise exception 'already_waived' using errcode = '23505';
  end if;
  if v_charge.booking_id is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
    values (v_charge.booking_id, v_status, v_status, v_user, 'trainer', v_reason,
            pg_catalog.jsonb_build_object('waiver_id', v_waiver));
  end if;
  perform private.notify_charge(v_waiver, 'charge_waived');
  return v_waiver;
end $$;

comment on function public.waive_charge(uuid, text) is
  'Trainer: forgives one charge (final); the session returns to its pass or the debt shrinks, and the client gets '
  'К9. Returns the waiver.';
revoke all on function public.waive_charge(uuid, text) from public, anon;
grant execute on function public.waive_charge(uuid, text) to authenticated;

-- The trainer records a personal session that already took place (PRD 2.6.2-7): a completed session with an
-- attended (or no_show) booking, charged by the usual rules. No message to the client: nothing is planned.
-- Raises not_a_trainer, not_your_client, not_past, too_old, invalid_duration, invalid_status or an error of the
-- place check. Returns the session and the booking.
create function public.record_past_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_status public.booking_status default 'attended',
  p_title text default null
)
returns table (session_id uuid, booking_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
  v_pair public.coachings;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_ends_at timestamptz;
  v_session uuid;
  v_booking uuid;
begin
  if v_trainer is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_trainer) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for no key update;
  if v_pair.id is null or v_pair.trainer_id <> v_trainer or v_pair.status not in ('trial', 'active') then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  v_ends_at := p_starts_at + pg_catalog.make_interval(mins => p_duration_min);
  if p_starts_at is null or v_ends_at > pg_catalog.now() then
    raise exception 'not_past' using errcode = '22023';
  end if;
  if p_starts_at < pg_catalog.now() - interval '366 days' then
    raise exception 'too_old' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  perform private.check_session_place(v_trainer, p_mode, p_location_id, null);

  insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, location_id, mode, capacity, status,
                               completed_at, created_by)
  values (v_trainer, 'personal', v_title, p_starts_at, v_ends_at, p_location_id, p_mode, 1, 'completed',
          pg_catalog.now(), v_trainer)
  returning id into v_session;
  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, confirmed_at, decided_by,
                               attendance_marked_at, attendance_marked_by)
  values (v_session, v_pair.id, v_pair.client_id, v_trainer, 'attended', 'trainer', pg_catalog.now(), v_trainer,
          pg_catalog.now(), v_trainer)
  returning id into v_booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking, null, 'attended', v_trainer, 'trainer', '{"recorded_after": true}');
  if p_status = 'no_show' then
    update public.bookings set status = 'no_show' where id = v_booking;
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
    values (v_booking, 'attended', 'no_show', v_trainer, 'trainer', '{"recorded_after": true}');
  end if;
  perform private.post_charge(v_booking, p_status::text::public.charge_reason);
  return query select v_session, v_booking;
end $$;

comment on function public.record_past_session(uuid, timestamptz, smallint, public.session_mode, uuid, public.booking_status, text) is
  'Trainer: records a personal session that already ended (attended or no_show), charged by the usual rules. '
  'Returns the session and the booking.';
revoke all on function public.record_past_session(uuid, timestamptz, smallint, public.session_mode, uuid, public.booking_status, text)
  from public, anon;
grant execute on function public.record_past_session(uuid, timestamptz, smallint, public.session_mode, uuid, public.booking_status, text)
  to authenticated;

-- A manual correction of a pass by k sessions with a note (R84, PRD 2.6.6-4): the way to undo a mistaken waiver,
-- or to fix a balance. It carries no money. A pass never goes below zero (pass_overdrawn). Raises pass_not_found,
-- invalid_delta or note_required. Returns the ledger row.
create function public.adjust_pass(p_pass_id uuid, p_delta integer, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pass public.passes;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_entry uuid;
begin
  select p.* into v_pass from public.passes p where p.id = p_pass_id and p.trainer_id = auth.uid() for no key update;
  if v_pass.id is null then
    raise exception 'pass_not_found' using errcode = 'P0002';
  end if;
  if p_delta is null or p_delta = 0 or p_delta not between -200 and 200 then
    raise exception 'invalid_delta' using errcode = '22023';
  end if;
  if v_note is null or pg_catalog.char_length(v_note) > 500 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, occurred_at, note)
  values (v_pass.coaching_id, 'adjustment', v_pass.id, p_delta, pg_catalog.now(), v_note)
  returning id into v_entry;
  return v_entry;
end $$;

comment on function public.adjust_pass(uuid, integer, text) is
  'Trainer: corrects a pass by ±k sessions with a required note (no money). Returns the ledger row.';
revoke all on function public.adjust_pass(uuid, integer, text) from public, anon;
grant execute on function public.adjust_pass(uuid, integer, text) to authenticated;

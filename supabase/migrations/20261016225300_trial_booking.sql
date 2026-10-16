-- Booking a trial session through a trial link (PRD wave-1 §2.3 rules 4–6, SHOP-5..6; screens.md §3.1
-- "Лендинг ссылки на пробное"; data-model R23, R39). The landing lists the trainer's free slots that allow a
-- trial; a signed-in visitor picks one and becomes the trainer's client with a trial booking request. A trial
-- is never confirmed on its own: the trainer answers it like any request (decide_booking), and the request
-- is withdrawn and expires the same way (20261016221900_client_bookings.sql).
-- Not here: the drop-in pass of a paid trial and the pair turning active after the trial both come with
-- the balance and attendance work.

-- Who may book a trial through this link: 'open', or why not.
--   own      the trainer's own link;
--   client   an active pair that did not start from a trial link (an existing client sees no trial);
--   used     the pair already has a live, attended or charged trial booking ("never twice", R39).
-- A pair that ended, a pair in status trial and a pair made by "Стать клиентом" on a trial landing may book.
create function private.trial_booking_state(p_link public.trial_links, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
begin
  if p_user = p_link.trainer_id then
    return 'own';
  end if;
  select c.* into v_pair from public.coachings c where c.trainer_id = p_link.trainer_id and c.client_id = p_user;
  if v_pair.id is null then
    return 'open';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.coaching_id = v_pair.id and b.source = 'trial'
      and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled')
  ) then
    return 'used';
  end if;
  if v_pair.status = 'active' and v_pair.source <> 'trial_link' then
    return 'client';
  end if;
  return 'open';
end $$;

revoke all on function private.trial_booking_state(public.trial_links, uuid) from public;

-- The free slots a trial fits in, for two weeks past the trainer's booking notice: open, allowing a trial,
-- long enough for the trial and matching the link's format and place when the link sets them. The trial
-- takes the start of the slot, so ends_at is the start plus the trial length.
create function private.trial_slots(p_link public.trial_links)
returns setof public.slots
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.slots s
  join public.trainer_profiles t on t.user_id = s.trainer_id
  where s.trainer_id = p_link.trainer_id
    and s.status = 'open'
    and s.allow_trial
    and s.starts_at >= pg_catalog.now() + pg_catalog.make_interval(mins => t.min_booking_notice_minutes)
    and s.starts_at < pg_catalog.now() + interval '14 days'
    and s.ends_at - s.starts_at >= pg_catalog.make_interval(mins => p_link.duration_min)
    and (p_link.mode is null or s.mode = p_link.mode)
    and (p_link.location_id is null or s.location_id = p_link.location_id)
  order by s.starts_at
$$;

revoke all on function private.trial_slots(public.trial_links) from public;

-- What /trial/<token> offers to pick: the slots above, for anyone, signed in or not (data-model §1.1: trial
-- slots are public through the trial link). A dead link, an unavailable trainer, or a signed-in caller who
-- may not book a trial (own link, existing client, trial used) gets no rows.
create function public.get_trial_slots(p_token text)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, mode public.session_mode, location_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.trial_links;
begin
  select tl.* into v_link from public.trial_links tl where tl.token = p_token;
  if not private.trial_link_is_live(v_link)
     or exists (select 1 from public.profiles p where p.id = v_link.trainer_id and p.blocked_at is not null)
     or exists (select 1 from public.account_deletions d where d.user_id = v_link.trainer_id and d.cancelled_at is null)
     or (v_user is not null and private.trial_booking_state(v_link, v_user) <> 'open') then
    return;
  end if;
  return query
    select s.id, s.starts_at, s.starts_at + pg_catalog.make_interval(mins => v_link.duration_min), s.mode, l.name
    from private.trial_slots(v_link) s
    left join public.locations l on l.id = s.location_id;
end $$;

comment on function public.get_trial_slots(text) is
  'Free slots of a trial link''s trainer that fit the trial, for two weeks (anyone); none when the caller may not '
  'book a trial through it.';
revoke all on function public.get_trial_slots(text) from public;
grant execute on function public.get_trial_slots(text) to anon, authenticated;

-- "Отправить запрос" on a trial landing (SHOP-5, PRD 2.3-5): the caller becomes the trainer's client (a new
-- pair starts in status trial) and gets a trial booking request on the slot; the slot becomes booked and the
-- trainer gets Т2 marked as a trial. Raises invite_invalid, trainer_unavailable, own_invite, already_client,
-- trial_used, slot_unavailable, too_late or plan_limit_reached.
create function public.book_trial(p_token text, p_slot_id uuid)
returns table (booking_id uuid, coaching_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.trial_links;
  v_state text;
  v_slot public.slots;
  v_had_pair boolean;
  v_pair_id uuid;
  v_pair public.coachings;
  v_url text;
  v_ends timestamptz;
  v_session_id uuid;
  v_booking_id uuid;
  v_location text;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Locks the link, as join_by_trial_link does, so its last use is taken once.
  select tl.* into v_link from public.trial_links tl where tl.token = p_token for no key update;
  if not private.trial_link_is_live(v_link) then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_link.trainer_id and p.blocked_at is not null)
     or exists (select 1 from public.account_deletions d where d.user_id = v_link.trainer_id and d.cancelled_at is null)
  then
    raise exception 'trainer_unavailable' using errcode = 'P0001';
  end if;
  v_state := private.trial_booking_state(v_link, v_user);
  if v_state <> 'open' then
    raise exception '%', case v_state when 'own' then 'own_invite' when 'client' then 'already_client' else 'trial_used' end
      using errcode = 'P0001';
  end if;

  perform 1 from public.slots s where s.id = p_slot_id for update;   -- one booking per slot at a time
  select s.* into v_slot from private.trial_slots(v_link) s where s.id = p_slot_id;
  if v_slot.id is null then
    -- A slot that is still free but inside the booking notice is "too late"; anything else is gone.
    if exists (
      select 1 from public.slots s
      join public.trainer_profiles t on t.user_id = s.trainer_id
      where s.id = p_slot_id and s.trainer_id = v_link.trainer_id and s.status = 'open' and s.allow_trial
        and s.starts_at > pg_catalog.now()
        and s.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => t.min_booking_notice_minutes)
    ) then
      raise exception 'too_late' using errcode = 'P0001';
    end if;
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  v_had_pair := exists (
    select 1 from public.coachings c where c.trainer_id = v_link.trainer_id and c.client_id = v_user);
  v_pair_id := private.join_pair(v_link.trainer_id, 'trial_link', null, v_link.id);
  select c.* into v_pair from public.coachings c where c.id = v_pair_id;
  if not v_had_pair then
    update public.coachings c set status = 'trial' where c.id = v_pair.id returning * into v_pair;
  end if;

  if v_slot.mode = 'online' then
    select i.meeting_url into v_url from public.week_template_items i where i.id = v_slot.template_item_id;
  end if;
  v_ends := v_slot.starts_at + pg_catalog.make_interval(mins => v_link.duration_min);
  insert into public.sessions
    (trainer_id, kind, title, starts_at, ends_at, location_id, mode, meeting_url, capacity, slot_id, trial_link_id)
  values (v_slot.trainer_id, 'trial', v_link.title, v_slot.starts_at, v_ends, v_slot.location_id, v_slot.mode, v_url, 1,
          v_slot.id, v_link.id)
  returning id into v_session_id;
  update public.slots s set status = 'booked' where s.id = v_slot.id;

  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, requested_at)
  values (v_session_id, v_pair.id, v_pair.client_id, v_pair.trainer_id, 'requested', 'trial', pg_catalog.now())
  returning id into v_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking_id, null, 'requested', v_user, 'client', pg_catalog.jsonb_build_object('trial_link_id', v_link.id));

  select l.name into v_location from public.locations l where l.id = v_slot.location_id;
  perform private.enqueue_notification(
    'booking_requested',
    pg_catalog.format('booking_requested:%s', v_booking_id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking_id, 'session_id', v_session_id, 'starts_at', v_slot.starts_at, 'mode', v_slot.mode,
      'location', v_location, 'debt', false, 'trial', true)
      || private.person_name(v_user),
    v_link.trainer_id,
    p_booking_id => v_booking_id,
    p_session_id => v_session_id);

  return query select v_booking_id, v_pair.id;
end $$;

comment on function public.book_trial(text, uuid) is
  'Signed-in caller books a trial through a trial link: joins the trainer (a new pair starts as trial) and gets a '
  'trial booking request on a free slot that allows a trial. Returns the booking and the pair.';
revoke all on function public.book_trial(text, uuid) from public, anon;
grant execute on function public.book_trial(text, uuid) to authenticated;

-- A confirmed trial reserves no pass: a free trial is never charged, and a paid one is charged against its own
-- drop-in pass (data-model §3.4). Otherwise decide_booking is unchanged.
create or replace function public.decide_booking(p_booking_id uuid, p_accept boolean, p_reason text default null)
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
  v_pass uuid;
  v_status public.booking_status;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or not private.acts_for_trainer(v_booking.trainer_id, 'schedule')
     or v_booking.status <> 'requested' then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  if v_session.starts_at <= pg_catalog.now() then
    raise exception 'request_not_found' using errcode = 'P0001', detail = 'the session has started';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if coalesce(p_accept, false) then
    v_status := 'confirmed';
    if v_session.kind <> 'trial' then
      select d.pass_id into v_pass
      from private.booking_auto_confirm(v_booking.coaching_id, v_session.kind, v_session.starts_at) d;
    end if;
    update public.bookings b
    set status = 'confirmed', confirmed_at = pg_catalog.now(), decided_by = v_user, reserved_pass_id = v_pass
    where b.id = v_booking.id;
  else
    v_status := 'declined';
    update public.bookings b set status = 'declined', decided_by = v_user, cancel_reason = v_reason
    where b.id = v_booking.id;
    perform private.drop_request_session(v_session.id, v_user, v_reason);
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
  values (v_booking.id, 'requested', v_status, v_user, 'trainer', v_reason, '{}');

  perform private.enqueue_notification(
    case when v_status = 'confirmed' then 'booking_confirmed' else 'booking_declined' end::public.notification_type,
    pg_catalog.format('%s:%s', v_status, v_booking.id),
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking.id, 'session_id', v_session.id, 'starts_at', v_session.starts_at, 'reason', v_reason)
      || private.trainer_name(v_booking.trainer_id),
    v_booking.client_id,
    p_booking_id => v_booking.id,
    p_session_id => v_session.id);
  return v_status;
end $$;

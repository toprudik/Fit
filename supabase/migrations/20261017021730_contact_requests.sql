-- "Попросить связаться" (PRD wave-1 §2.12 rules 2-3, PRIV-2; notifications С1, С2; decision Q39). The table,
-- its read policy and the notification types exist since 20261015120300_pairs_tables.sql and
-- 20261015123200_pairs_policies.sql; this adds the three RPCs that write it.
--   request_contact: one side of a live pair asks the other, who has no Telegram username, to get in touch.
--     At most one request from a person to the same person in 24 hours, whatever happened to the last one.
--   decline_contact_request: the recipient says no; the requester learns it (С2).
--   accept_contact_request: the recipient shared the contact through Telegram (Mini App requestContact). Only the
--     server calls it, after checking Telegram's signature on the contact, so the phone number is the one
--     Telegram vouches for. The requester gets the name, the number and the Telegram id (С2); the number is
--     kept only in that message's outbox row, which the outbox retention job deletes after 90 days.
-- A request nobody answered in 7 days expires: answering it then only marks it expired.

-- request_contact ------------------------------------------------------------------------------------------

create function public.request_contact(p_coaching_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_recipient public.profiles;
  v_requester public.profiles;
  v_last timestamptz;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The pair row is locked, so two taps at once make one request.
  select c.* into v_pair
  from public.coachings c
  where c.id = p_coaching_id and v_user in (c.trainer_id, c.client_id)
  for no key update;
  if v_pair.id is null then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
  if v_pair.status = 'ended' then
    raise exception 'pair_ended' using errcode = 'P0001';
  end if;

  select p.* into v_recipient
  from public.profiles p
  where p.id = case when v_user = v_pair.trainer_id then v_pair.client_id else v_pair.trainer_id end;
  -- A card without an account has nobody to ask; a blocked or leaving account takes no requests.
  if v_recipient.managed_by_trainer_id is not null
     or v_recipient.blocked_at is not null
     or exists (select 1 from public.account_deletions d where d.user_id = v_recipient.id and d.cancelled_at is null)
  then
    raise exception 'recipient_unavailable' using errcode = 'P0001';
  end if;
  if nullif(pg_catalog.btrim(v_recipient.username), '') is not null then
    raise exception 'has_username' using errcode = 'P0001', detail = 'write to them in Telegram instead';
  end if;

  select max(r.created_at) into v_last
  from public.contact_requests r
  where r.requester_id = v_user and r.recipient_id = v_recipient.id;
  if v_last > pg_catalog.now() - interval '24 hours' then
    raise exception 'too_soon' using errcode = 'P0001',
      detail = pg_catalog.format('the next request is possible after %s', v_last + interval '24 hours');
  end if;

  insert into public.contact_requests as r (coaching_id, requester_id, recipient_id)
  values (v_pair.id, v_user, v_recipient.id)
  returning r.id into v_request_id;

  -- С1: the recipient sees who asks and from which side of the pair.
  select p.* into v_requester from public.profiles p where p.id = v_user;
  perform private.enqueue_notification(
    p_type => 'contact_request',
    p_dedupe_key => 'contact_request:' || v_request_id,
    p_payload => pg_catalog.jsonb_build_object(
      'request_id', v_request_id,
      'coaching_id', v_pair.id,
      'side', case when v_user = v_pair.trainer_id then 'trainer' else 'client' end,
      'first_name', v_requester.first_name,
      'last_name', v_requester.last_name
    ),
    p_user => v_recipient.id
  );
  return v_request_id;
end $$;

comment on function public.request_contact(uuid) is
  'One side of a live pair asks the other, who has no Telegram username, to share their contact (PRIV-2) and the '
  'bot tells them (С1). Raises pair_not_found, pair_ended, recipient_unavailable, has_username or too_soon (one '
  'request to the same person in 24 hours).';
revoke all on function public.request_contact(uuid) from public, anon;
grant execute on function public.request_contact(uuid) to authenticated;

-- Answers --------------------------------------------------------------------------------------------------

-- The pending request of this recipient, locked; an unanswered one older than 7 days is marked expired first.
-- Returns the request as it is now, or null when it is not theirs.
create function private.contact_request_to_answer(p_request_id uuid, p_recipient uuid)
returns public.contact_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.contact_requests;
begin
  select r.* into v_request
  from public.contact_requests r
  where r.id = p_request_id and r.recipient_id = p_recipient
  for no key update;
  if v_request.id is null then
    return null;
  end if;
  if v_request.status = 'pending' and v_request.created_at < pg_catalog.now() - interval '7 days' then
    update public.contact_requests r set status = 'expired' where r.id = v_request.id returning * into v_request;
  end if;
  return v_request;
end $$;

comment on function private.contact_request_to_answer(uuid, uuid) is
  'The recipient''s request, locked for the answer; an unanswered one older than 7 days is marked expired.';
revoke all on function private.contact_request_to_answer(uuid, uuid) from public;

-- С2 to the requester: the recipient's name and, when they agreed, their contact.
create function private.enqueue_contact_response(p_request public.contact_requests, p_extra jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recipient public.profiles;
  v_trainer uuid;
begin
  select p.* into v_recipient from public.profiles p where p.id = p_request.recipient_id;
  select c.trainer_id into v_trainer from public.coachings c where c.id = p_request.coaching_id;
  perform private.enqueue_notification(
    p_type => 'contact_response',
    p_dedupe_key => 'contact_response:' || p_request.id,
    p_payload => pg_catalog.jsonb_build_object(
      'request_id', p_request.id,
      'coaching_id', p_request.coaching_id,
      -- The requester's side, so the button opens their own card of the pair.
      'side', case when p_request.requester_id = v_trainer then 'trainer' else 'client' end,
      'accepted', p_request.status = 'accepted',
      'first_name', v_recipient.first_name,
      'last_name', v_recipient.last_name
    ) || p_extra,
    p_user => p_request.requester_id
  );
end $$;

comment on function private.enqueue_contact_response(public.contact_requests, jsonb) is
  'Queues С2 for the requester of an answered contact request, with p_extra merged into the payload.';
revoke all on function private.enqueue_contact_response(public.contact_requests, jsonb) from public;

create function public.decline_contact_request(p_request_id uuid)
returns public.contact_request_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request public.contact_requests;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_request := private.contact_request_to_answer(p_request_id, v_user);
  if v_request.id is null then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' then
    return v_request.status;
  end if;

  update public.contact_requests r
  set status = 'declined', responded_at = pg_catalog.now()
  where r.id = v_request.id
  returning * into v_request;
  perform private.enqueue_contact_response(v_request, '{}'::jsonb);
  return v_request.status;
end $$;

comment on function public.decline_contact_request(uuid) is
  'The recipient declines a contact request; the requester is told (С2). Returns the request status, which is '
  'the earlier answer or expired when it was no longer pending. Raises request_not_found.';
revoke all on function public.decline_contact_request(uuid) from public, anon;
grant execute on function public.decline_contact_request(uuid) to authenticated;

create function public.accept_contact_request(p_request_id uuid, p_user uuid, p_phone text)
returns public.contact_request_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phone text := pg_catalog.regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g');
  v_request public.contact_requests;
  v_telegram_id bigint;
begin
  if v_phone !~ '^\+?[0-9]{5,20}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  v_request := private.contact_request_to_answer(p_request_id, p_user);
  if v_request.id is null then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' then
    return v_request.status;
  end if;

  update public.contact_requests r
  set status = 'accepted', responded_at = pg_catalog.now()
  where r.id = v_request.id
  returning * into v_request;
  select p.telegram_id into v_telegram_id from public.profiles p where p.id = p_user;
  perform private.enqueue_contact_response(v_request, pg_catalog.jsonb_build_object(
    'phone', case when v_phone like '+%' then v_phone else '+' || v_phone end,
    'telegram_id', v_telegram_id
  ));
  return v_request.status;
end $$;

comment on function public.accept_contact_request(uuid, uuid, text) is
  'Server only (secret key): the recipient p_user shared the contact Telegram signed, so the requester gets the '
  'phone number and Telegram id (С2). Returns the request status, as decline_contact_request does. Raises '
  'invalid_phone or request_not_found.';
revoke all on function public.accept_contact_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_contact_request(uuid, uuid, text) to service_role;

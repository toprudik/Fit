-- Clients without an account (PRD wave-1 §2.5-3, 3a, §2.14-3; data-model §2.1 "Карточка клиента без аккаунта"):
-- public.create_managed_client makes a card and its pair, public.get_managed_client_claim shows the trainer the
-- "Это <Имя>?" screen, and public.resolve_managed_client_claim merges a card into the person who came by link or
-- keeps them as a new client. end_coaching now names its reason in the message, so the person whose new pair a
-- Free trainer had to close hears why (К12).

-- create_managed_client ---------------------------------------------------------------------------------------

-- A card is an auth user that cannot sign in (no Telegram id, banned for good, a synthetic address) with a
-- profile kept by the trainer and an active pair with source 'manual'. The pair trigger shares every data
-- category, since the trainer enters the data. The Free limit counts cards like any live client (PLAN-1).
-- The optional contact lands in the trainer's meta of the pair, the optional note as a note only the trainer
-- sees. Returns the new pair id.
create function public.create_managed_client(p_display_name text, p_contact text default null, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_display_name);
  v_contact text := nullif(pg_catalog.btrim(p_contact), '');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_card uuid := gen_random_uuid();
  v_pair uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 100 then
    raise exception 'name_invalid' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_contact) > 200 then
    raise exception 'contact_too_long' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_note) > 5000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  -- Raises not_a_trainer or plan_limit_reached, and holds the trainer row until the end.
  perform private.assert_can_add_client(v_user);

  insert into auth.users (
    instance_id, id, aud, role, email, banned_until, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_card, 'authenticated', 'authenticated',
    'managed-' || v_card || '@users.fit.invalid', 'infinity',
    pg_catalog.jsonb_build_object('provider', 'managed', 'providers', pg_catalog.jsonb_build_array()),
    '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  );
  insert into public.profiles (id, telegram_id, first_name, managed_by_trainer_id)
  values (v_card, null, v_name, v_user);

  insert into public.coachings (trainer_id, client_id, source)
  values (v_user, v_card, 'manual')
  returning id into v_pair;

  if v_contact is not null then
    update public.coaching_trainer_meta m set contact = v_contact where m.coaching_id = v_pair;
  end if;
  if v_note is not null then
    insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
    values (v_pair, v_user, v_note, false);
  end if;
  return v_pair;
end $$;

comment on function public.create_managed_client(text, text, text) is
  'The trainer adds a client without an account (PRD 2.5-3): a card that cannot sign in, its active pair with '
  'source manual and every data category shared, the contact in the pair meta and the note hidden from the '
  'client. Returns the pair id. Raises name_invalid, contact_too_long, note_too_long, not_a_trainer or '
  'plan_limit_reached.';
revoke all on function public.create_managed_client(text, text, text) from public, anon;
grant execute on function public.create_managed_client(text, text, text) to authenticated;

-- get_managed_client_claim ------------------------------------------------------------------------------------

-- The "Это тот же клиент?" screen in one call: the claim, the person who came, and every unclaimed card of the
-- trainer with what a merge would carry over (screens.md). Definer, because the counts span tables whose
-- policies differ (the card pair's ledger, bookings and measurements); it answers only the claim's trainer.
-- limit_full tells the screen that "new client" would close the new pair on Free (Q65).
create function public.get_managed_client_claim(p_claim_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_claim public.managed_client_claims;
  v_person public.profiles;
  v_limit integer;
  v_full boolean := false;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.* into v_claim from public.managed_client_claims c where c.id = p_claim_id and c.trainer_id = v_user;
  if v_claim.id is null then
    raise exception 'claim_not_found' using errcode = 'P0001';
  end if;
  select p.* into v_person from public.profiles p where p.id = v_claim.claimant_id;

  if v_claim.status = 'pending' and not private.has_entitlement(v_user, 'trainer.unlimited_clients') then
    select (p.limits ->> 'max_active_clients')::integer into v_limit from public.plans p where p.code = 'trainer_free';
    -- The new pair is already counted, so "new client" fits only while the count stays within the limit.
    v_full := v_limit is not null and private.active_client_count(v_user) > v_limit;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_claim.id,
    'status', v_claim.status,
    'new_coaching_id', v_claim.new_coaching_id,
    'created_at', v_claim.created_at,
    'limit_full', v_full,
    'person', pg_catalog.jsonb_build_object(
      'id', v_person.id, 'first_name', v_person.first_name, 'last_name', v_person.last_name,
      'username', v_person.username, 'photo_url', v_person.photo_url),
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', k.id,
        'coaching_id', c.id,
        'name', coalesce(m.client_alias, k.first_name),
        'started_at', c.started_at,
        'sessions', (select pg_catalog.count(*) from public.bookings b
                     where b.coaching_id = c.id and b.status in ('attended', 'no_show', 'late_cancelled')),
        'passes', (select pg_catalog.count(*) from public.passes s where s.coaching_id = c.id),
        'payments', (select pg_catalog.count(*) from public.payments y where y.coaching_id = c.id),
        'notes', (select pg_catalog.count(*) from public.coaching_notes n where n.coaching_id = c.id),
        'measurements', (select pg_catalog.count(*) from public.measurements x where x.client_id = k.id))
        order by c.started_at desc)
      from public.profiles k
      join public.coachings c on c.client_id = k.id and c.trainer_id = v_user
      left join public.coaching_trainer_meta m on m.coaching_id = c.id
      where k.managed_by_trainer_id = v_user and k.claimed_by is null
    ), '[]'::jsonb)
  );
end $$;

comment on function public.get_managed_client_claim(uuid) is
  '"Это тот же клиент?" (PRD 2.5-3a): the claim, the person who came, the trainer''s unclaimed cards with the '
  'counts a merge carries over, and limit_full when "new client" would close the new pair on Free. Raises '
  'claim_not_found for anyone but the claim''s trainer.';
revoke all on function public.get_managed_client_claim(uuid) from public, anon;
grant execute on function public.get_managed_client_claim(uuid) to authenticated;

-- resolve_managed_client_claim --------------------------------------------------------------------------------

-- The trainer's answer to "Это <Имя>?", in one transaction.
--   * null ("Это новый клиент"): the claim is rejected and the card stays. A Free trainer over the limit
--     cannot keep the new pair: it ends with reason plan_limit_reached and the person gets К12 (Q65).
--   * a card: the card's history becomes the person's (PRD 2.5-3a). The card pair survives with its start
--     date and source 'manual'; whatever the new pair already holds moves into it, and the new pair goes.
--     Then the card pair turns to the person: the composite pair keys cascade the client to bookings,
--     passes, payments, the ledger, money events and workout logs; measurements, photos and personal records
--     move by hand. Data shares go back to the client's defaults, so the person sees the consent step. The
--     card's auth user is deleted last, which removes its profile. A merge cannot be undone.
-- Returns the pair the person now has with the trainer.
create function public.resolve_managed_client_claim(p_claim_id uuid, p_managed_client_id uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_claim public.managed_client_claims;
  v_new public.coachings;
  v_card_pair public.coachings;
  v_limit integer;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.* into v_claim from public.managed_client_claims c
  where c.id = p_claim_id and c.trainer_id = v_user
  for update;
  if v_claim.id is null then
    raise exception 'claim_not_found' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'claim_decided' using errcode = 'P0001';
  end if;
  -- The same lock as the joins and assert_can_add_client: answers and joins of one trainer run in turn.
  perform 1 from public.trainer_profiles t where t.user_id = v_user for no key update;
  select c.* into v_new from public.coachings c where c.id = v_claim.new_coaching_id for update;

  if p_managed_client_id is null then
    update public.managed_client_claims c set status = 'rejected', decided_at = pg_catalog.now() where c.id = v_claim.id;
    if v_new.status <> 'ended' and not private.has_entitlement(v_user, 'trainer.unlimited_clients') then
      select (p.limits ->> 'max_active_clients')::integer into v_limit from public.plans p where p.code = 'trainer_free';
      if v_limit is not null and private.active_client_count(v_user) > v_limit then
        perform public.end_coaching(v_new.id, 'plan_limit_reached');
      end if;
    end if;
    return v_new.id;
  end if;

  if v_new.status = 'ended' then
    raise exception 'claim_pair_ended' using errcode = 'P0001';
  end if;
  select c.* into v_card_pair
  from public.coachings c
  join public.profiles k on k.id = c.client_id
  where c.trainer_id = v_user and c.client_id = p_managed_client_id
    and k.managed_by_trainer_id = v_user and k.claimed_by is null
  for update of c;
  if v_card_pair.id is null then
    raise exception 'card_not_found' using errcode = 'P0001';
  end if;

  update public.managed_client_claims c
  set status = 'merged', managed_client_id = p_managed_client_id, decided_at = pg_catalog.now()
  where c.id = v_claim.id;

  -- Rows of the new pair point at (card pair, trainer, person) before the card pair does; the composite
  -- keys are checked once everything is in place.
  set constraints public.bookings_pair_fkey, public.passes_pair_fkey, public.payments_pair_fkey,
    public.ledger_entries_pair_fkey, public.money_events_pair_fkey, public.workout_logs_pair_fkey,
    public.recurrences_coaching_fkey, public.milestones_booking_fkey deferred;

  update public.bookings b set coaching_id = v_card_pair.id where b.coaching_id = v_new.id;
  update public.passes s set coaching_id = v_card_pair.id where s.coaching_id = v_new.id;
  update public.payments y set coaching_id = v_card_pair.id where y.coaching_id = v_new.id;
  update public.ledger_entries l set coaching_id = v_card_pair.id where l.coaching_id = v_new.id;
  update public.money_events e set coaching_id = v_card_pair.id where e.coaching_id = v_new.id;
  update public.workout_logs w set coaching_id = v_card_pair.id where w.coaching_id = v_new.id;
  update public.recurrences r set coaching_id = v_card_pair.id where r.coaching_id = v_new.id;
  update public.coaching_notes n set coaching_id = v_card_pair.id where n.coaching_id = v_new.id;
  update public.contact_requests q set coaching_id = v_card_pair.id where q.coaching_id = v_new.id;
  -- One milestone of a kind per pair: the card pair's own one stays.
  delete from public.milestones m
  where m.coaching_id = v_new.id
    and exists (select 1 from public.milestones o where o.coaching_id = v_card_pair.id and o.kind = m.kind);
  update public.milestones m set coaching_id = v_card_pair.id where m.coaching_id = v_new.id;

  delete from public.coachings c where c.id = v_new.id;

  update public.coachings c
  set client_id = v_claim.claimant_id, status = v_new.status, ended_at = null, ended_by = null, end_reason = null
  where c.id = v_card_pair.id;
  update public.data_shares d
  set nutrition = true, measurements = true, photos = false, steps = true, intake = false,
      intake_decided_at = null, workouts = true
  where d.coaching_id = v_card_pair.id;
  update public.coaching_trainer_meta m set archived_at = null where m.coaching_id = v_card_pair.id;

  update public.measurements x set client_id = v_claim.claimant_id where x.client_id = p_managed_client_id;
  update public.progress_photos x set client_id = v_claim.claimant_id where x.client_id = p_managed_client_id;
  update public.workout_logs w set client_id = v_claim.claimant_id where w.client_id = p_managed_client_id;
  insert into public.personal_records (client_id, exercise_id, record_type, value, set_id, achieved_at)
  select v_claim.claimant_id, r.exercise_id, r.record_type, r.value, r.set_id, r.achieved_at
  from public.personal_records r
  where r.client_id = p_managed_client_id
  on conflict (client_id, exercise_id, record_type) do update
    set value = excluded.value, set_id = excluded.set_id, achieved_at = excluded.achieved_at
    where excluded.value > public.personal_records.value;

  set constraints public.bookings_pair_fkey, public.passes_pair_fkey, public.payments_pair_fkey,
    public.ledger_entries_pair_fkey, public.money_events_pair_fkey, public.workout_logs_pair_fkey,
    public.recurrences_coaching_fkey, public.milestones_booking_fkey immediate;

  update public.profiles k set claimed_by = v_claim.claimant_id where k.id = p_managed_client_id;
  delete from auth.users u where u.id = p_managed_client_id;
  return v_card_pair.id;
end $$;

comment on function public.resolve_managed_client_claim(uuid, uuid) is
  'The trainer answers "Это <Имя>?" (PRD 2.5-3a): null keeps the person as a new client (closing the new pair '
  'with plan_limit_reached on a full Free plan, Q65); a card id merges the card''s history into the person and '
  'deletes the card. Returns the person''s pair. Raises claim_not_found, claim_decided, claim_pair_ended or '
  'card_not_found.';
revoke all on function public.resolve_managed_client_claim(uuid, uuid) from public, anon;
grant execute on function public.resolve_managed_client_claim(uuid, uuid) to authenticated;

-- end_coaching ------------------------------------------------------------------------------------------------

-- Unchanged but for the message payload, which now carries the reason (plan_limit_reached selects К12).
create or replace function public.end_coaching(p_coaching_id uuid, p_reason text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_role public.actor_role;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_cancelled integer;
  v_other uuid;
  v_actor public.profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;

  -- The lock makes two ends of one pair (or an end and a join) run one after another.
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for update;
  if v_pair.id is null or v_user not in (v_pair.trainer_id, v_pair.client_id) then
    raise exception 'coaching_not_found' using errcode = 'P0001';
  end if;
  if v_pair.status = 'ended' then
    return 0;
  end if;
  v_role := case when v_user = v_pair.trainer_id then 'trainer'::public.actor_role else 'client'::public.actor_role end;

  update public.coachings c
  set status = 'ended', ended_at = pg_catalog.now(), ended_by = v_user, end_reason = v_reason
  where c.id = v_pair.id;

  -- cancel_reason is required for a cancellation by the trainer (PRD 2.6.5-4); here it is a fixed mark that
  -- the screens show as "the pair ended", and the reason itself stays on the pair.
  with future as (
    select b.id, b.status, b.session_id
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.coaching_id = v_pair.id and b.status in ('requested', 'confirmed') and s.starts_at > pg_catalog.now()
    for update of b
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = v_role,
        cancel_reason = 'coaching_ended'
    from future f
    where b.id = f.id
    returning b.id, f.status as from_status, b.session_id
  ), logged as (
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
    select x.id, x.from_status, 'cancelled', v_user, v_role, 'coaching_ended',
           pg_catalog.jsonb_build_object('coaching_id', v_pair.id)
    from cancelled x
    returning booking_id
  )
  select pg_catalog.count(*)::integer into v_cancelled from logged;

  -- A personal or trial session is only this pair's; a group session goes on for its other clients.
  update public.sessions s
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = 'coaching_ended'
  where s.trainer_id = v_pair.trainer_id and s.kind <> 'group' and s.status = 'scheduled'
    and s.starts_at > pg_catalog.now()
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.coaching_id = v_pair.id)
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled'));

  update public.recurrences r set ended_at = pg_catalog.now()
  where r.coaching_id = v_pair.id and r.ended_at is null;

  select p.* into v_actor from public.profiles p where p.id = v_user;
  v_other := case when v_role = 'trainer' then v_pair.client_id else v_pair.trainer_id end;
  perform private.enqueue_notification(
    'coaching_ended',
    pg_catalog.format('coaching_ended:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
    pg_catalog.jsonb_build_object('coaching_id', v_pair.id, 'ended_by', v_role, 'cancelled', v_cancelled,
                                  'first_name', v_actor.first_name, 'last_name', v_actor.last_name,
                                  'reason', v_reason),
    v_other);

  return v_cancelled;
end $$;

comment on function public.end_coaching(uuid, text) is
  'The trainer or the client ends a live pair: future bookings are cancelled without a charge, lone future '
  'personal sessions and the pair repeats stop, and the other side gets coaching_ended. Returns the number of '
  'cancelled bookings; 0 for a pair that has already ended. Raises coaching_not_found for anyone else.';
revoke all on function public.end_coaching(uuid, text) from public, anon;
grant execute on function public.end_coaching(uuid, text) to authenticated;

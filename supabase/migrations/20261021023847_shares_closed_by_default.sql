-- «Что видит тренер» is closed by default (legal product-changes А4, consent-health-data.md part Б): an open
-- category the client never chose is not consent to show health data. A new pair shares nothing until the client
-- answers the sharing step, which now asks about all six categories with nothing chosen in advance; the step's
-- answer is stamped in intake_decided_at as before (the column keeps its name, it now dates the whole step).
-- A card pair keeps sharing everything (the trainer enters its data and there is no client to ask).

alter table public.data_shares
  alter column nutrition set default false,
  alter column measurements set default false,
  alter column steps set default false,
  alter column workouts set default false;

-- Pairs that already exist keep what they share now; only new pairs start closed.

-- An ended pair coming back and a card merged into the person reset the step: they now close every category
-- too. Bodies of 20261017015200_join_refuses_deleting.sql and 20261016200000_managed_clients.sql, only that
-- write changed.

create or replace function private.join_pair(
  p_trainer_id uuid,
  p_source public.coaching_source,
  p_client_invite_id uuid,
  p_trial_link_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_has_card boolean;
  v_claim uuid;
  v_client public.profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.* into v_pair from public.coachings c where c.trainer_id = p_trainer_id and c.client_id = v_user;
  if v_pair.id is not null and v_pair.status <> 'ended' then
    return v_pair.id;
  end if;

  -- Nobody joins an account that is being deleted (data-model §1.6): a trainer reads as unavailable, like a
  -- blocked one; a client is told to cancel the deletion first.
  if exists (select 1 from public.account_deletions d where d.user_id = p_trainer_id and d.cancelled_at is null) then
    raise exception 'trainer_unavailable' using errcode = 'P0001', detail = 'the trainer is deleting their account';
  end if;
  if exists (select 1 from public.account_deletions d where d.user_id = v_user and d.cancelled_at is null) then
    raise exception 'account_deleting' using errcode = 'P0001', detail = 'cancel the account deletion to join a trainer';
  end if;

  v_has_card := exists (
    select 1 from public.profiles p where p.managed_by_trainer_id = p_trainer_id and p.claimed_by is null
  );
  if v_has_card then
    -- Same lock as assert_can_add_client, so joins of one trainer still run one after another.
    perform 1 from public.trainer_profiles t where t.user_id = p_trainer_id for no key update;
  else
    perform private.assert_can_add_client(p_trainer_id);
  end if;

  if v_pair.id is not null then
    update public.coachings c
    set status = 'active', ended_at = null, ended_by = null, end_reason = null
    where c.id = v_pair.id
    returning * into v_pair;
    -- Back to the defaults: nothing is shared until the client answers the sharing step again.
    update public.data_shares d
    set nutrition = false, measurements = false, photos = false, steps = false, intake = false,
        intake_decided_at = null, workouts = false
    where d.coaching_id = v_pair.id;
  else
    insert into public.coachings (trainer_id, client_id, source, client_invite_id, trial_link_id)
    values (p_trainer_id, v_user, p_source, p_client_invite_id, p_trial_link_id)
    returning * into v_pair;
  end if;

  if p_client_invite_id is not null then
    update public.client_invites ci set uses_count = ci.uses_count + 1 where ci.id = p_client_invite_id;
  end if;
  if p_trial_link_id is not null then
    update public.trial_links tl set uses_count = tl.uses_count + 1 where tl.id = p_trial_link_id;
  end if;

  select p.* into v_client from public.profiles p where p.id = v_user;
  if v_has_card then
    insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
    values (p_trainer_id, v_user, v_pair.id)
    returning id into v_claim;
    perform private.enqueue_notification(
      'managed_client_claim', pg_catalog.format('managed_client_claim:%s', v_claim),
      pg_catalog.jsonb_build_object('claim_id', v_claim, 'coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_trainer_id);
  else
    -- A pair that ends and starts again gets a new message each time.
    perform private.enqueue_notification(
      'coaching_created',
      pg_catalog.format('coaching_created:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
      pg_catalog.jsonb_build_object('coaching_id', v_pair.id,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_trainer_id);
  end if;

  update public.user_settings s set last_zone = 'client' where s.user_id = v_user;
  return v_pair.id;
end $$;

comment on function private.join_pair(uuid, public.coaching_source, uuid, uuid) is
  'Makes the caller a client of the trainer through the given client link or trial link (already checked by the '
  'caller) and returns the pair id; see join_by_invite. Raises trainer_unavailable when the trainer and '
  'account_deleting when the caller has a pending account deletion; a live pair is returned as it is.';

create or replace function public.resolve_managed_client_claim(p_claim_id uuid, p_managed_client_id uuid default null)
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
  -- The person decides what the trainer sees from now on: nothing until they answer the sharing step.
  update public.data_shares d
  set nutrition = false, measurements = false, photos = false, steps = false, intake = false,
      intake_decided_at = null, workouts = false
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

comment on column public.data_shares.intake_decided_at is
  'When the client answered the sharing step for this pair (all six categories); null until then.';

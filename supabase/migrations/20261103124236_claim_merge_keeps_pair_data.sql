-- «Объединить» deleted, by cascade with the person's pair, everything the merge did not move (QA 45): the
-- person lost their homework, groups and challenges, and old bot buttons «Открыть домашку» led to «Такой
-- страницы нет». The merge now moves these rows of the person's pair to the card pair too. Rows of the beta
-- area (review, monthly reports, referrals) are left for a separate change. Body of
-- 20261103121112_claim_merge_keeps_nutrition_target.sql (its header names 20261103083717, which was
-- renamed to 20261103090744 before merging), only the moves before the pair is deleted added.

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
    public.recurrences_coaching_fkey, public.milestones_booking_fkey, public.ledger_entries_booking_fkey,
    public.ledger_entries_pass_fkey, public.ledger_entries_related_entry_fkey, public.payments_pass_fkey,
    public.bookings_reserved_pass_fkey, public.bookings_rescheduled_to_fkey, public.workout_logs_booking_fkey deferred;

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

  -- The person decides what the trainer sees: their answers on the new pair (or its closed defaults, if they
  -- haven't answered yet) carry over to the card pair.
  update public.data_shares d
  set nutrition = s.nutrition, measurements = s.measurements, photos = s.photos, steps = s.steps,
      intake = s.intake, intake_decided_at = s.intake_decided_at, workouts = s.workouts
  from public.data_shares s
  where d.coaching_id = v_card_pair.id and s.coaching_id = v_new.id;

  -- The person's «Помощникам видно прогресс и питание» switch carries over too (QA 38): its row is keyed by the
  -- new pair and would go with it.
  insert into public.assistant_progress_blocks (coaching_id)
  select v_card_pair.id
  where exists (select 1 from public.assistant_progress_blocks b where b.coaching_id = v_new.id)
  on conflict (coaching_id) do nothing;

  -- The rest of the person's pair went with it by cascade (QA 45): homework, groups and challenges, waitlist
  -- places, food diary comments, the trainer's nutrition target, an assistant's hold on the client and the
  -- trainer's «уходящие» dismissal. Where the card pair already has the same row, the card's one stays.
  update public.homework h set coaching_id = v_card_pair.id where h.coaching_id = v_new.id;
  update public.group_members g set coaching_id = v_card_pair.id
  where g.coaching_id = v_new.id
    and not exists (select 1 from public.group_members o where o.group_id = g.group_id and o.coaching_id = v_card_pair.id);
  update public.challenge_participants p set coaching_id = v_card_pair.id
  where p.coaching_id = v_new.id
    and not exists (select 1 from public.challenge_participants o
                    where o.challenge_id = p.challenge_id and o.coaching_id = v_card_pair.id);
  update public.waitlist_entries w set coaching_id = v_card_pair.id where w.coaching_id = v_new.id;
  update public.food_day_comments f set coaching_id = v_card_pair.id where f.coaching_id = v_new.id;
  -- One open trainer target per pair: the older of two open ones closes where the newer begins.
  update public.nutrition_targets x
  set effective_to = greatest(y.effective_from, x.effective_from + 1)
  from public.nutrition_targets y
  where x.source = 'trainer' and y.source = 'trainer' and x.effective_to is null and y.effective_to is null
    and x.coaching_id in (v_new.id, v_card_pair.id) and y.coaching_id in (v_new.id, v_card_pair.id)
    and x.coaching_id <> y.coaching_id and (x.created_at, x.id) < (y.created_at, y.id);
  update public.nutrition_targets x set coaching_id = v_card_pair.id where x.coaching_id = v_new.id;
  update public.delegation_clients d set coaching_id = v_card_pair.id
  where d.coaching_id = v_new.id
    and not exists (select 1 from public.delegation_clients o
                    where o.delegation_id = d.delegation_id and o.coaching_id = v_card_pair.id);
  insert into public.trainer_churn_dismissals (coaching_id, hidden_until, created_at)
  select v_card_pair.id, t.hidden_until, t.created_at from public.trainer_churn_dismissals t where t.coaching_id = v_new.id
  on conflict (coaching_id) do nothing;

  delete from public.coachings c where c.id = v_new.id;

  update public.coachings c
  set client_id = v_claim.claimant_id, status = v_new.status, ended_at = null, ended_by = null, end_reason = null,
      started_at = least(c.started_at, v_new.started_at),
      -- The person's own reminder choice wins over the card's defaults (QA 39); the trigger on this column
      -- requeues the reminders of the moved bookings.
      client_reminder_offsets = v_new.client_reminder_offsets
  where c.id = v_card_pair.id;
  update public.coaching_trainer_meta m set archived_at = null where m.coaching_id = v_card_pair.id;

  update public.measurements x set client_id = v_claim.claimant_id where x.client_id = p_managed_client_id;
  -- The nutrition target the trainer set on the card (QA 42); it would go with the card's user below.
  update public.nutrition_targets x set client_id = v_claim.claimant_id
  where x.client_id = p_managed_client_id and x.source = 'trainer';
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
    public.recurrences_coaching_fkey, public.milestones_booking_fkey, public.ledger_entries_booking_fkey,
    public.ledger_entries_pass_fkey, public.ledger_entries_related_entry_fkey, public.payments_pass_fkey,
    public.bookings_reserved_pass_fkey, public.bookings_rescheduled_to_fkey, public.workout_logs_booking_fkey immediate;

  update public.profiles k set claimed_by = v_claim.claimant_id where k.id = p_managed_client_id;
  delete from auth.users u where u.id = p_managed_client_id;
  return v_card_pair.id;
end $$;

comment on function public.resolve_managed_client_claim(uuid, uuid) is
  'The trainer answers "Это <Имя>?" (PRD 2.5-3a): null keeps the person as a new client (closing the new pair '
  'with plan_limit_reached on a full Free plan, Q65); a card id merges the card''s history into the person and '
  'deletes the card. Returns the person''s pair. Raises claim_not_found, claim_decided, claim_pair_ended or '
  'card_not_found.';

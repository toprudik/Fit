-- A client who left while the trainer had not answered «Это <Имя>?» could not come back to that trainer by any
-- link while the trainer kept a card (QA bug 47): join_pair restored the ended pair and inserted a second
-- pending question for it, which managed_client_claims_one_pending_uniq refused, so the client saw «Не
-- получилось, попробуй ещё раз.». join_pair now reuses the pending question and sends it to the trainer again
-- (unless the first message is still waiting to go out), which also frees questions already stuck this way.
-- Body of 20261102222553_returning_client_notice.sql, only the claim branch changed.

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
  v_returning boolean;
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

  v_returning := v_pair.id is not null;
  if v_returning then
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
    -- A client who left while «Это <Имя>?» was unanswered comes back to the same pair, whose question is still
    -- pending (QA bug 47): reuse it and ask the trainer again, unless the first message has not gone out yet.
    select m.id into v_claim from public.managed_client_claims m
    where m.new_coaching_id = v_pair.id and m.status = 'pending';
    if v_claim is null then
      insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
      values (p_trainer_id, v_user, v_pair.id)
      returning id into v_claim;
      perform private.enqueue_notification(
        'managed_client_claim', pg_catalog.format('managed_client_claim:%s', v_claim),
        pg_catalog.jsonb_build_object('claim_id', v_claim, 'coaching_id', v_pair.id,
                                      'first_name', v_client.first_name, 'last_name', v_client.last_name),
        p_trainer_id);
    elsif not exists (
      select 1 from public.notification_outbox n
      where n.type = 'managed_client_claim' and n.status in ('pending', 'processing')
        and n.payload ->> 'claim_id' = v_claim::text
    ) then
      perform private.enqueue_notification(
        'managed_client_claim',
        pg_catalog.format('managed_client_claim:%s:%s', v_claim, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
        pg_catalog.jsonb_build_object('claim_id', v_claim, 'coaching_id', v_pair.id,
                                      'first_name', v_client.first_name, 'last_name', v_client.last_name),
        p_trainer_id);
    end if;
  else
    -- A pair that ends and starts again gets a new message each time.
    perform private.enqueue_notification(
      'coaching_created',
      pg_catalog.format('coaching_created:%s:%s', v_pair.id, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
      pg_catalog.jsonb_build_object('coaching_id', v_pair.id, 'returning', v_returning,
                                    'first_name', v_client.first_name, 'last_name', v_client.last_name),
      p_trainer_id);
  end if;

  update public.user_settings s set last_zone = 'client' where s.user_id = v_user;
  return v_pair.id;
end $$;

comment on function private.join_pair(uuid, public.coaching_source, uuid, uuid) is
  'Makes the caller a client of the trainer through the given client link or trial link (already checked by the '
  'caller) and returns the pair id; see join_by_invite. Raises trainer_unavailable when the trainer and '
  'account_deleting when the caller has a pending account deletion; a live pair is returned as it is. The '
  'coaching_created message carries returning = true when an ended pair starts again. A returning client whose '
  '«Это <Имя>?» question is still pending keeps it, and the trainer is asked again.';

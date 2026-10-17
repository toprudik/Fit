-- Joining refuses accounts that are being deleted (data-model §1.6, PRIV-7). Every way in (join_by_invite,
-- join_by_code, join_by_showcase, join_by_trial_link, book_trial) ends in private.join_pair, so the check sits
-- there once: a trainer with a pending deletion is trainer_unavailable (join_by_trial_link already said so for
-- its own links), a caller with one gets account_deleting. A live pair still comes back as it is: nothing new
-- starts. The rest of the body is unchanged from 20261016170000_trial_links.sql.

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
    -- Back to the client's defaults: the intake stays hidden until the consent step is answered again.
    update public.data_shares d
    set nutrition = true, measurements = true, photos = false, steps = true, intake = false,
        intake_decided_at = null, workouts = true
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

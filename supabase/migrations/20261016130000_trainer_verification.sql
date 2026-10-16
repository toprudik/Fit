-- Trainer verification (PRD wave-1 §2.2 rules 4-5, TINV-4..7, §3 С3 and А1, §4 ADM-4..6): the trainer sends
-- the uploaded certificates for review, an admin verifies or rejects with a reason. Tables, the 5-file cap and
-- the status sync trigger: 20261015120200_trainers_tables.sql; read policies and the certificates bucket:
-- 20261015123100_trainers_policies.sql and 20261015125200_storage.sql. Both functions append one row to
-- trainer_verifications (the trigger copies it into trainer_profiles) and queue the bot message in the same
-- transaction (ADR 0006). Verification never gates work: the trainer zone stays open in every status (Q55).

-- submit_trainer_verification ----------------------------------------------------------------------------

-- "Отправить на проверку": from not_submitted (first time) or rejected (again, Q60). The profile row is locked
-- like the certificate cap trigger locks it, so a submission and an upload never interleave.
create function public.submit_trainer_verification()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_status public.verification_status;
  v_documents integer;
  v_name text;
  v_verification_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.verification_status into v_status
  from public.trainer_profiles t
  where t.user_id = v_user
  for no key update;
  if not found then
    raise exception 'not_trainer' using errcode = '42501', detail = 'only trainers send documents for verification';
  end if;
  if v_status = 'pending' then
    raise exception 'verification_pending' using errcode = 'P0001', detail = 'the documents are already under review';
  elsif v_status = 'verified' then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  select count(*) into v_documents from public.trainer_certificates c where c.trainer_id = v_user;
  if v_documents = 0 then
    raise exception 'no_documents' using errcode = 'P0001', detail = 'upload at least one document first';
  end if;

  insert into public.trainer_verifications as v (trainer_id, decision)
  values (v_user, 'pending')
  returning v.id into v_verification_id;

  -- А1 goes to the closed admin group: the trainer's name and how many documents to look at.
  select coalesce(nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), ''), '@' || p.username)
  into v_name
  from public.profiles p
  where p.id = v_user;

  perform private.enqueue_notification(
    p_type => 'verification_submitted',
    p_dedupe_key => 'verification_submitted:' || v_verification_id,
    p_payload => pg_catalog.jsonb_build_object('trainer_name', v_name, 'documents', v_documents),
    p_chat_target => 'admin_group'
  );
end $$;

comment on function public.submit_trainer_verification() is
  'Trainer: sends the uploaded certificates for review. Allowed from not_submitted or rejected with at least one '
  'certificate; sets the status to pending and tells the admin group (А1). Raises not_trainer, '
  'verification_pending, already_verified or no_documents.';
revoke all on function public.submit_trainer_verification() from public, anon;
grant execute on function public.submit_trainer_verification() to authenticated;

-- admin_decide_verification ------------------------------------------------------------------------------

-- "Верифицировать" / "Отклонить" in /admin/verification. Only a pending trainer can be decided, so two admins
-- deciding at once get one decision and one verification_not_pending (ADM-4). A rejection needs a reason that
-- the trainer sees in the app and in the bot message (ADM-5, TINV-5); a verification carries none.
create function public.admin_decide_verification(
  p_trainer_id uuid,
  p_decision public.verification_status,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_status public.verification_status;
  v_verification_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501', detail = 'only admins decide verification';
  end if;
  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023', detail = 'the decision is verified or rejected';
  end if;
  if p_decision = 'rejected' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023', detail = 'a rejection needs a reason';
  end if;
  if pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023', detail = 'the reason is at most 1000 characters';
  end if;
  if p_decision = 'verified' then
    v_reason := null;
  end if;

  select t.verification_status into v_status
  from public.trainer_profiles t
  where t.user_id = p_trainer_id
  for no key update;
  if not found then
    raise exception 'trainer_not_found' using errcode = 'P0001';
  end if;
  if v_status <> 'pending' then
    raise exception 'verification_not_pending' using errcode = 'P0001', detail = 'only a trainer under review is decided';
  end if;

  insert into public.trainer_verifications as v (trainer_id, decision, reason, decided_by)
  values (p_trainer_id, p_decision, v_reason, auth.uid())
  returning v.id into v_verification_id;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'verification.decide', 'trainer', p_trainer_id, v_reason,
          pg_catalog.jsonb_build_object('decision', p_decision, 'verification_id', v_verification_id));

  -- С3: a service message, sent even when the trainer turned other notifications off (PRD §3-8).
  perform private.enqueue_notification(
    p_type => 'verification_result',
    p_dedupe_key => 'verification_result:' || v_verification_id,
    p_payload => pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('decision', p_decision, 'reason', v_reason)),
    p_user => p_trainer_id
  );
end $$;

comment on function public.admin_decide_verification(uuid, public.verification_status, text) is
  'Admin: verifies or rejects (with a required reason) a trainer whose documents are pending, notifies the '
  'trainer (С3) and audits it as verification.decide (ADM-4, ADM-5). Raises invalid_decision, reason_required, '
  'reason_too_long, trainer_not_found or verification_not_pending.';
revoke all on function public.admin_decide_verification(uuid, public.verification_status, text) from public, anon;
grant execute on function public.admin_decide_verification(uuid, public.verification_status, text) to authenticated;

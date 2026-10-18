-- Review messages (PRD wave-2 §11 rules 4 and 7): after the third attended session of a pair the bot offers the
-- client, once, to leave a review (review_prompt, which the client can switch off), and an admin's decision on a
-- disputed review reaches both sides (report_resolution: the trainer who disputed it and the review's author).

-- The offer: queued when an attendance brings the pair to exactly three attended sessions, the pair is live and
-- the client has no review yet. The dedupe key holds it to once per pair even if attendance is unmarked and marked
-- again.
create function private.offer_review_on_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_trainer public.profiles;
begin
  if new.status <> 'attended' or (tg_op = 'UPDATE' and old.status = 'attended') or new.coaching_id is null then
    return null;
  end if;
  select * into v_pair from public.coachings c where c.id = new.coaching_id;
  if v_pair.id is null or v_pair.status <> 'active' or private.review_sessions(v_pair.id) <> 3
     or exists (select 1 from public.reviews r where r.coaching_id = v_pair.id) then
    return null;
  end if;
  select * into v_trainer from public.profiles p where p.id = v_pair.trainer_id;
  perform private.enqueue_notification(
    'review_prompt',
    pg_catalog.format('review_prompt:%s', v_pair.id),
    pg_catalog.jsonb_build_object('coaching_id', v_pair.id,
                                  'first_name', v_trainer.first_name, 'last_name', v_trainer.last_name),
    v_pair.client_id);
  return null;
end $$;

comment on function private.offer_review_on_booking() is
  'Trigger: the third attended session of a live pair without a review queues review_prompt to the client (§11 rule 4).';
revoke all on function private.offer_review_on_booking() from public;

create trigger bookings_offer_review
  after insert or update of status on public.bookings
  for each row execute function private.offer_review_on_booking();

-- admin_decide_review_dispute, as in 20261017220335_reviews.sql, now also tells both sides about the decision.
create or replace function public.admin_decide_review_dispute(p_report_id uuid, p_hide boolean, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_review public.reviews;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_payload jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id and r.target_type = 'review' for update;
  if v_report.id is null or v_report.status <> 'open' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_hide is null or (p_hide and v_reason is null) or char_length(v_reason) > 2000 then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update public.reviews r
  set status = case when p_hide then 'hidden'::public.review_status else 'published'::public.review_status end,
      hidden_reason = case when p_hide then v_reason end
  where r.id = v_report.target_id
  returning * into v_review;
  update public.reports r
  set status = case when p_hide then 'hidden'::public.report_status else 'kept'::public.report_status end,
      resolved_by = auth.uid(), resolved_at = pg_catalog.now(), resolution_note = v_reason
  where r.target_type = 'review' and r.target_id = v_report.target_id and r.status = 'open';
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'review.decide', 'review', v_report.target_id,
          pg_catalog.jsonb_build_object('report_id', v_report.id, 'hidden', p_hide));

  if v_review.id is not null then
    v_payload := pg_catalog.jsonb_build_object('target_type', 'review', 'review_id', v_review.id,
                                               'coaching_id', v_review.coaching_id, 'hidden', p_hide);
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:trainer', v_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'trainer'), v_review.trainer_id);
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:author', v_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'author', 'reason', v_reason), v_review.client_id);
  end if;
end $$;

-- Admin reply to feedback (PRD wave-1 §4 ADM-10): an admin answers a feedback message in /admin/feedback and the
-- author gets the answer from the bot (feedback_reply, R72). The last answer stays on the message; a new answer
-- replaces it and is sent again. A new message moves to "in progress" on the first answer.

alter table public.feedback
  add column reply      text check (char_length(reply) between 1 and 2000),
  add column replied_at timestamptz,
  add column replied_by uuid references public.profiles (id) on delete set null,
  add constraint feedback_reply_pair_check check ((reply is null) = (replied_at is null));

comment on column public.feedback.reply is 'The admin''s last answer, sent to the author by the bot (ADM-10).';
comment on column public.feedback.replied_at is 'When the last answer was sent.';
comment on column public.feedback.replied_by is 'The admin who sent the last answer; null after their account is deleted.';

create index feedback_replied_by_idx on public.feedback (replied_by);

-- Errors (message): forbidden (42501), invalid_reply (22023), not_found (P0002), author_deleted (P0001).
create function public.admin_reply_feedback(p_feedback_id uuid, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_author uuid;
  v_kind public.feedback_kind;
  v_at timestamptz := pg_catalog.now();
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'invalid_reply' using errcode = '22023';
  end if;
  select f.user_id, f.kind into v_author, v_kind from public.feedback f where f.id = p_feedback_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_author is null then
    raise exception 'author_deleted' using errcode = 'P0001';
  end if;

  update public.feedback set
    reply = v_body, replied_at = v_at, replied_by = (select auth.uid()),
    status = case when status = 'new' then 'in_progress'::public.feedback_status else status end,
    updated_at = v_at
  where id = p_feedback_id;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'feedback.reply', 'feedback', p_feedback_id,
          pg_catalog.jsonb_build_object('length', char_length(v_body)));

  perform private.enqueue_notification(
    'feedback_reply', 'feedback_reply:' || p_feedback_id || ':' || pg_catalog.floor(extract(epoch from v_at))::bigint,
    pg_catalog.jsonb_build_object('feedback_id', p_feedback_id, 'kind', v_kind, 'reply', v_body),
    v_author);
  return v_at;
end $$;

comment on function public.admin_reply_feedback(uuid, text) is
  'Admin: answers a feedback message; the author gets the answer from the bot (ADM-10).';
revoke all on function public.admin_reply_feedback(uuid, text) from public, anon;
grant execute on function public.admin_reply_feedback(uuid, text) to authenticated;

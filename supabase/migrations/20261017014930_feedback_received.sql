-- The feedback button's message to the team (PRD wave-1 §2.13, FDBK-1, PRD §3 А2): every new feedback row puts one
-- feedback_received row in the outbox for the closed admin group. The payload carries the kind, the zone and the
-- start of the text, never the author: the team opens the message in /admin/feedback to see who wrote it.

create function private.feedback_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_notification(
    p_type => 'feedback_received',
    p_dedupe_key => 'feedback_received:' || new.id,
    p_payload => pg_catalog.jsonb_build_object(
      'feedback_id', new.id,
      'kind', new.kind,
      'zone', new.zone,
      'excerpt', pg_catalog.left(new.body, 400),
      'screenshots', pg_catalog.cardinality(new.attachment_paths)
    ),
    p_chat_target => 'admin_group'
  );
  return null;
end $$;

comment on function private.feedback_notify() is
  'Trigger: tells the admin group about a new feedback message (А2), without the author''s name.';
revoke all on function private.feedback_notify() from public;

create trigger feedback_notify
  after insert on public.feedback
  for each row execute function private.feedback_notify();

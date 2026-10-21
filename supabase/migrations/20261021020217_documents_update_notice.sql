-- A message in the bot ahead of a material change of the documents (право 15, legal Б19): an admin announces the
-- date the new edition takes effect, and everyone with a Telegram account gets one documents_update message with
-- that date and a link to the documents. When the edition is in force the consent screen asks to accept it.

alter type public.notification_type add value 'documents_update';

-- Queues the message for every person with an account (not a card, not one being deleted). Admins only; the day
-- must be in the future, since the point is to warn ahead. A second call for the same day queues nothing new.
-- Returns how many messages it queued.
create function public.announce_documents_update(p_effective_on date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_effective_on is null or p_effective_on <= (pg_catalog.now() at time zone 'Europe/Moscow')::date then
    raise exception 'date_not_ahead' using errcode = 'P0001';
  end if;
  for r in
    select p.id from public.profiles p
    where p.telegram_id is not null and p.managed_by_trainer_id is null
      and not exists (select 1 from public.account_deletions d where d.user_id = p.id and d.cancelled_at is null)
  loop
    if private.enqueue_notification(
         'documents_update', 'documents_update:' || p_effective_on || ':' || r.id,
         pg_catalog.jsonb_build_object('effective_on', p_effective_on), r.id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'documents.update_announced', 'documents', null,
    pg_catalog.jsonb_build_object('effective_on', p_effective_on, 'queued', v_count));
  return v_count;
end $$;

comment on function public.announce_documents_update(date) is
  'Queues the bot message about a new edition of the documents taking effect on that day (право 15), admins only.';
revoke all on function public.announce_documents_update(date) from public, anon;
grant execute on function public.announce_documents_update(date) to authenticated;

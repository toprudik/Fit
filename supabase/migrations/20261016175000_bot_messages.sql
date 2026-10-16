-- Whether the bot may write to the user (PRD wave-1 §2.1 rule 6, AUTH-7). profiles.bot_blocked_at is the one
-- mark: the dispatcher sets it when Telegram refuses a message (20261015220000_notification_dispatch.sql), and a
-- fresh sign-in clears it. The column is not granted to signed-in users (pair partners read profiles rows too),
-- so the app reads and changes the caller's own mark only through the two definer functions below.

-- The banner "Уведомления выключены" in the profile: true while the bot cannot write to the caller.
create function public.bot_messages_blocked()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select p.bot_blocked_at is not null from public.profiles p where p.id = v_user), false);
end $$;

comment on function public.bot_messages_blocked() is
  'True while the bot cannot write to the caller (profiles.bot_blocked_at is set). Signed-in users only.';
revoke all on function public.bot_messages_blocked() from public;
grant execute on function public.bot_messages_blocked() to authenticated;

-- Telegram's answer to the Mini App's requestWriteAccess, or the user's "I turned the bot on" on the website.
-- Denied marks the bot as blocked (Telegram answers "allowed" at once when the bot can already write, so a
-- denial means it cannot), keeping the earlier time if there was one. Allowed clears the mark; with
-- p_send_test it also queues the bot_test message (AUTH-7), at most one a minute per user: the dedupe key
-- carries the minute, so repeated taps in that minute queue nothing more.
create function public.set_bot_messages(p_allowed boolean, p_send_test boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'invalid_answer' using errcode = '22023', detail = 'p_allowed must be true or false';
  end if;

  if not p_allowed then
    update public.profiles p set bot_blocked_at = v_now where p.id = v_user and p.bot_blocked_at is null;
    return;
  end if;

  update public.profiles p set bot_blocked_at = null where p.id = v_user and p.bot_blocked_at is not null;
  if coalesce(p_send_test, false) then
    perform private.enqueue_notification(
      'bot_test',
      'bot_test:' || v_user || ':' || pg_catalog.to_char(v_now at time zone 'UTC', 'YYYYMMDDHH24MI'),
      '{}',
      v_user);
  end if;
end $$;

comment on function public.set_bot_messages(boolean, boolean) is
  'Records whether the bot may write to the caller: false sets profiles.bot_blocked_at, true clears it and, '
  'with p_send_test, queues one bot_test message per minute. Signed-in users only.';
revoke all on function public.set_bot_messages(boolean, boolean) from public;
grant execute on function public.set_bot_messages(boolean, boolean) to authenticated;

comment on column public.profiles.bot_blocked_at is
  'The bot cannot write to the user: Telegram refused a message (403 or chat not found), or the user denied '
  'requestWriteAccess. The dispatcher skips the user''s messages while it is set; a fresh sign-in and '
  'set_bot_messages(true) clear it, so the next message tries again.';

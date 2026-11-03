-- Two gaps of the trainer's daily digest (QA 37):
-- * a digest time inside the trainer's evening quiet hours (say 22:00) held the digest until morning, and it then
--   told the next day «Занятий сегодня нет» about the day before. The digest now goes out at the chosen time,
--   silently, like a session reminder;
-- * the digest and the bot named a client by the Telegram name before the name the client set in DaFit, while
--   the app (lib/pairs/clients.ts displayName) uses the DaFit name first. The label now follows the app's order:
--   alias, DaFit name, first and last name, @username. Bodies of 20261017003700_waitlist.sql and
--   20261016224300_daily_digest.sql otherwise.

create or replace function private.notification_ignores_quiet_hours(p_type public.notification_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_type in ('session_reminder', 'bot_test', 'waitlist_offer', 'daily_digest'), false)
$$;

comment on function private.notification_ignores_quiet_hours(public.notification_type) is
  'True for types sent on time in quiet hours, silently: session reminders, waitlist offers, the trainer''s daily '
  'digest at the time they chose, and the bot test message.';

create or replace function private.trainer_client_label(p_coaching uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.btrim(m.client_alias), ''),
    nullif(pg_catalog.btrim(p.display_name), ''),
    nullif(pg_catalog.btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    case when p.username is not null then '@' || p.username end,
    '')
  from public.coachings c
  join public.profiles p on p.id = c.client_id
  left join public.coaching_trainer_meta m on m.coaching_id = c.id
  where c.id = p_coaching
$$;

comment on function private.trainer_client_label(uuid) is
  'The client of a pair as the trainer names them, in the app''s order: alias, else the DaFit name, else first and '
  'last name, else @username.';

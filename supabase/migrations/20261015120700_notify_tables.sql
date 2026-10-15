-- Notifications and calendar (data-model §2.1 "Уведомления, напоминания, календарь"):
-- the notification outbox and calendar feeds. Policies: 20261015123600_notify_policies.sql.

-- notification_outbox: transactional outbox (ADR 0006). RPCs and triggers queue rows in the same transaction
-- as the change; the dispatcher sends them through the bot. Nobody but server code ever reads or writes it.
create table public.notification_outbox (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  type                public.notification_type not null,
  dedupe_key          text not null unique,
  payload             jsonb not null check (jsonb_typeof(payload) = 'object'),  -- template keys and deep link, no extra personal data
  booking_id          uuid references public.bookings (id) on delete cascade,
  session_id          uuid references public.sessions (id) on delete cascade,
  scheduled_for       timestamptz not null,                                     -- when it is meant to go out
  deliver_after       timestamptz not null,                                     -- after quiet hours are applied
  status              public.outbox_status not null default 'pending',
  attempts            smallint not null default 0 check (attempts >= 0),
  locked_until        timestamptz,                                              -- dispatcher lease
  last_error          text check (char_length(last_error) <= 500),              -- Telegram error code, no tokens or secret URLs
  telegram_message_id bigint,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  constraint notification_outbox_sent_check check (status <> 'sent' or sent_at is not null),
  constraint notification_outbox_lease_check check (status <> 'processing' or locked_until is not null),
  constraint notification_outbox_delivery_time_check check (deliver_after >= scheduled_for),
  constraint notification_outbox_reminder_booking_check check (type <> 'session_reminder' or booking_id is not null)
);

comment on table public.notification_outbox is
  'A bot message waiting to be sent or already handled. '
  'Written only by RPCs, triggers and the dispatcher; never granted to users.';
comment on column public.notification_outbox.dedupe_key is
  'Global idempotency key. Keys include the target time, for example '
  'reminder:{booking_id}:{offset_min}:{epoch_of_starts_at}, so a moved session gets new reminders (R75).';
comment on column public.notification_outbox.deliver_after is
  'Earliest send time: scheduled_for, or the end of the recipient quiet hours for non-urgent types (ADR 0006).';
comment on column public.notification_outbox.locked_until is 'Lease of the dispatcher run that is sending the row.';
comment on column public.notification_outbox.last_error is 'Last Telegram error code; never tokens or URLs with secrets.';

create index notification_outbox_deliver_after_idx on public.notification_outbox (deliver_after) where status = 'pending';
create index notification_outbox_booking_id_idx on public.notification_outbox (booking_id);
create index notification_outbox_user_id_idx on public.notification_outbox (user_id);
create index notification_outbox_session_id_idx on public.notification_outbox (session_id) where session_id is not null;
-- Retention job: handled rows older than 90 days are removed.
create index notification_outbox_created_at_idx on public.notification_outbox (created_at)
  where status in ('sent', 'skipped', 'cancelled');

-- RLS on and no policies, ever: the outbox is reached only with the secret key or from definer code.
alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from anon, authenticated;
revoke all on sequence public.notification_outbox_id_seq from anon, authenticated;

-- calendar_feeds: a personal ICS feed URL. Only the sha256 of the token is stored; the token is shown once.
create table public.calendar_feeds (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  zone             public.app_zone not null,                                   -- trainer or client schedule
  token_hash       bytea not null unique check (octet_length(token_hash) = 32),
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  constraint calendar_feeds_revoked_check check (revoked_at is null or revoked_at >= created_at)
);

comment on table public.calendar_feeds is
  'A calendar (ICS) feed of one user and zone. Written only by server code, which shows the token once.';
comment on column public.calendar_feeds.token_hash is 'sha256 of the feed token (32 bytes). Never granted to signed-in users.';
comment on column public.calendar_feeds.last_accessed_at is 'Last time a calendar app fetched the feed; written by the ICS route.';

-- One active feed per user and zone; reissuing revokes the old one first.
create unique index calendar_feeds_one_active_uniq on public.calendar_feeds (user_id, zone) where revoked_at is null;
create index calendar_feeds_user_id_idx on public.calendar_feeds (user_id);

alter table public.calendar_feeds enable row level security;
revoke all on table public.calendar_feeds from anon, authenticated;

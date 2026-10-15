-- Notify policies (data-model §4.2, contract §1.4 file 20): notification_outbox and calendar_feeds.
-- Tables: 20261015120700_notify_tables.sql. Every table starts from no privileges; the grants below are the
-- whole API surface for signed-in users.

revoke all on table public.notification_outbox, public.calendar_feeds from anon, authenticated;

-- notification_outbox

-- Server only (ADR 0006): RPCs and triggers queue rows, the dispatcher sends them with the secret key.
-- No grant, ever. The revokes repeat the table file on purpose, so this file alone shows that signed-in
-- users cannot reach the outbox or its identity sequence. The later claim functions are definer functions
-- executable only by service_role (R76).
revoke all on sequence public.notification_outbox_id_seq from anon, authenticated;

-- An explicit deny instead of no policy at all: the same effect, but it says so in the catalog (and keeps the
-- rls_enabled_no_policy advisor quiet). Restrictive, so a permissive policy added by mistake later still opens
-- nothing; service_role bypasses RLS and is unaffected.
create policy "notification_outbox: nobody reads or writes"
  on public.notification_outbox as restrictive for all
  to authenticated
  using (false)
  with check (false);

-- calendar_feeds

-- The owner sees which feeds exist and when they were used. Issuing and revoking go through the
-- create_calendar_feed and revoke_calendar_feed RPCs, which show the token once, so there are no write grants.
-- token_hash is never granted: select=* fails with 42501, so the app lists columns.
create policy "calendar_feeds: owner reads"
  on public.calendar_feeds for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select (id, user_id, zone, created_at, revoked_at, last_accessed_at) on table public.calendar_feeds to authenticated;

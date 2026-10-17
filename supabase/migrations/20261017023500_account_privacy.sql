-- Data export and account deletion (PRD wave-1 §2.12 rules 6-8, PRIV-6, PRIV-7; data-model §1.6, §1.10).
--
-- * request_account_deletion / cancel_account_deletion: the 30-day window. The request at once cancels the
--   user's future bookings without a charge, stops recurrences and open slots, and tells the user and every
--   partner of a live pair. Sign-in stays possible: the app shows only the deletion screen (src/proxy.ts reads
--   app_metadata.deletion_pending from the JWT).
-- * purge_account (service role): after 30 days, anonymization instead of a full cascade. Personal rows go,
--   the trainers' accounting stays with the client replaced by the "deleted client" stub; a trainer's own
--   accounting goes with trainer_profiles. The web route removes the Storage objects first and the Auth user
--   last (GoTrue), so nothing here touches storage or auth.
-- * request_data_export / claim_data_exports / complete_data_export / fail_data_export: the archive. The web
--   route builds it (JSON, CSV and photos) into bucket exports and the bot sends the link (export_ready).
-- * pg_cron calls the privacy route when there is work, with the URL and secret the notification dispatcher
--   already keeps in Vault (same host, path /api/cron/privacy), so nothing new is configured per environment.

-- request_account_deletion: marks the account for deletion in 30 days; repeating it keeps the first date.
create function public.request_account_deletion()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_scheduled timestamptz;
  v_actor public.profiles;
  v_pair record;
  v_cancelled_pairs uuid[];
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- One request at a time per user; a second tap waits for the first and then sees its row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_deletion:' || v_user::text, 0));

  select d.scheduled_for into v_scheduled
  from public.account_deletions d
  where d.user_id = v_user and d.cancelled_at is null;
  if v_scheduled is not null then
    return v_scheduled;
  end if;

  v_scheduled := pg_catalog.now() + interval '30 days';
  insert into public.account_deletions (user_id, requested_at, scheduled_for, cancelled_at)
  values (v_user, pg_catalog.now(), v_scheduled, null)
  on conflict (user_id) do update
    set requested_at = excluded.requested_at, scheduled_for = excluded.scheduled_for, cancelled_at = null;
  -- The mark rides in the session's JWT (app_metadata, which only the server writes), so the proxy keeps the
  -- user on the deletion screen without a query per request; other devices get it with their next token.
  update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"deletion_pending": true}'::jsonb
  where u.id = v_user;

  -- Future bookings on either side end without a charge (data-model §1.6-2), marked as the system's doing.
  -- v_cancelled_pairs keeps one entry per cancelled booking, for the count in the partner's message.
  with future as (
    select b.id, b.status
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where (b.client_id = v_user or b.trainer_id = v_user)
      and b.status in ('requested', 'confirmed') and s.starts_at > pg_catalog.now()
    for update of b
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancelled_by_role = 'system',
        cancel_reason = 'account_deletion'
    from future f
    where b.id = f.id
    returning b.id, b.coaching_id, f.status as from_status
  ), logged as (
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason, payload)
    select x.id, x.from_status, 'cancelled', v_user, 'system', 'account_deletion', '{}'::jsonb
    from cancelled x
    returning booking_id
  )
  select coalesce(pg_catalog.array_agg(c.coaching_id), '{}') into v_cancelled_pairs
  from cancelled c join logged l on l.booking_id = c.id;

  -- Sessions left without anyone: all of a deleting trainer's future sessions, and a client's personal ones.
  update public.sessions s
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = v_user, cancel_reason = 'account_deletion'
  where s.status = 'scheduled' and s.starts_at > pg_catalog.now()
    and (s.trainer_id = v_user
         or (s.kind <> 'group'
             and exists (select 1 from public.bookings b where b.session_id = s.id and b.client_id = v_user)
             and not exists (
               select 1 from public.bookings b
               where b.session_id = s.id and b.status in ('requested', 'confirmed', 'attended', 'no_show', 'late_cancelled'))));

  update public.recurrences r set ended_at = pg_catalog.now()
  where r.ended_at is null
    and (r.trainer_id = v_user or r.coaching_id in (select c.id from public.coachings c where c.client_id = v_user));

  -- Nobody books a deleting trainer's free time; the trainer opens it again by hand after cancelling.
  update public.slots sl set status = 'closed'
  where sl.trainer_id = v_user and sl.status = 'open' and sl.starts_at > pg_catalog.now();

  -- The showcase and the trial links need nothing here: they already hide a trainer with a pending deletion,
  -- and come back by themselves when it is cancelled.
  select p.* into v_actor from public.profiles p where p.id = v_user;
  for v_pair in
    select c.id, c.trainer_id, c.client_id
    from public.coachings c
    join public.profiles other on other.id = case when c.trainer_id = v_user then c.client_id else c.trainer_id end
    where (c.trainer_id = v_user or c.client_id = v_user) and c.status <> 'ended' and other.managed_by_trainer_id is null
  loop
    perform private.enqueue_notification(
      'counterpart_deleting',
      pg_catalog.format('counterpart_deleting:%s:%s:%s', v_pair.id, v_user, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
      pg_catalog.jsonb_build_object(
        'coaching_id', v_pair.id,
        'side', case when v_pair.trainer_id = v_user then 'trainer' else 'client' end,
        'first_name', v_actor.first_name, 'last_name', v_actor.last_name,
        'cancelled', pg_catalog.cardinality(pg_catalog.array_positions(v_cancelled_pairs, v_pair.id)), 'scheduled_for', v_scheduled),
      case when v_pair.trainer_id = v_user then v_pair.client_id else v_pair.trainer_id end);
  end loop;

  perform private.enqueue_notification(
    'account_deletion',
    pg_catalog.format('account_deletion:requested:%s:%s', v_user, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
    pg_catalog.jsonb_build_object('stage', 'requested', 'scheduled_for', v_scheduled),
    v_user);

  return v_scheduled;
end $$;

comment on function public.request_account_deletion() is
  'Marks the caller''s account for deletion in 30 days (data-model §1.6): cancels future bookings without a '
  'charge, ends recurrences, closes open slots and notifies the user and the partners of live pairs. Returns '
  'the deletion date; a pending request keeps its date.';
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

-- cancel_account_deletion: the account stays. What the request cancelled stays cancelled (PRD 2.12-7).
create function public.cancel_account_deletion()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.account_deletions d set cancelled_at = pg_catalog.now()
  where d.user_id = v_user and d.cancelled_at is null;
  if not found then
    return false;
  end if;
  update auth.users u set raw_app_meta_data = u.raw_app_meta_data - 'deletion_pending' where u.id = v_user;
  perform private.enqueue_notification(
    'account_deletion',
    pg_catalog.format('account_deletion:cancelled:%s:%s', v_user, pg_catalog.floor(extract(epoch from pg_catalog.now()))),
    pg_catalog.jsonb_build_object('stage', 'cancelled'),
    v_user);
  return true;
end $$;

comment on function public.cancel_account_deletion() is
  'Cancels the caller''s pending account deletion. Bookings, recurrences and slots it cancelled stay as they are.';
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- request_data_export: queues an archive of everything the caller has in every role (PRIV-6). A queued or
-- running export is reused, and a new one waits an hour after the last, so a double tap builds one archive.
create function public.request_data_export()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('data_export:' || v_user::text, 0));
  select e.id into v_id
  from public.data_exports e
  where e.user_id = v_user
    and (e.status in ('queued', 'processing') or (e.status = 'ready' and e.requested_at > pg_catalog.now() - interval '1 hour'))
  order by e.requested_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.data_exports (user_id) values (v_user) returning id into v_id;
  return v_id;
end $$;

comment on function public.request_data_export() is
  'Queues an export of the caller''s data (PRIV-6), or returns the one queued, running or made in the last hour.';
revoke all on function public.request_data_export() from public, anon;
grant execute on function public.request_data_export() to authenticated;

-- The privacy route's work list (service role only). An export left in processing by a dead run goes back
-- after 15 minutes.
create function public.claim_data_exports(p_limit integer default 3)
returns table (id uuid, user_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select e.id
    from public.data_exports e
    where e.status = 'queued' or (e.status = 'processing' and e.updated_at < pg_catalog.now() - interval '15 minutes')
    order by e.requested_at
    limit greatest(1, least(p_limit, 10))
    for update skip locked
  )
  update public.data_exports e set status = 'processing'
  from picked
  where e.id = picked.id
  returning e.id, e.user_id;
end $$;

comment on function public.claim_data_exports(integer) is 'Privacy route: takes queued exports for building.';
revoke all on function public.claim_data_exports(integer) from public, anon, authenticated;
grant execute on function public.claim_data_exports(integer) to service_role;

-- The archive is in place: the link lives 7 days (PRD 2.12-6) and the bot says so.
create function public.complete_data_export(p_id uuid, p_storage_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_export public.data_exports;
begin
  update public.data_exports e
  set status = 'ready', storage_path = p_storage_path, ready_at = pg_catalog.now(),
      expires_at = pg_catalog.now() + interval '7 days'
  where e.id = p_id and e.status = 'processing'
  returning e.* into v_export;
  if v_export.id is null then
    raise exception 'export_not_processing' using errcode = 'P0001';
  end if;
  perform private.enqueue_notification(
    'export_ready',
    'export_ready:' || v_export.id::text,
    pg_catalog.jsonb_build_object('export_id', v_export.id, 'expires_at', v_export.expires_at),
    v_export.user_id);
end $$;

comment on function public.complete_data_export(uuid, text) is
  'Privacy route: marks an export ready for 7 days and queues the bot message with the link (export_ready).';
revoke all on function public.complete_data_export(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_data_export(uuid, text) to service_role;

create function public.fail_data_export(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.data_exports e set status = 'failed' where e.id = p_id and e.status = 'processing';
$$;

comment on function public.fail_data_export(uuid) is 'Privacy route: an export that could not be built.';
revoke all on function public.fail_data_export(uuid) from public, anon, authenticated;
grant execute on function public.fail_data_export(uuid) to service_role;

-- The "deleted client" stub (data-model §1.6): one profile per database, made on first use. It has an Auth
-- user that can never sign in, because profiles.id references auth.users.
create function private.ensure_deleted_client()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.deleted_client_id();
begin
  if exists (select 1 from public.profiles p where p.id = v_id) then
    return v_id;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, banned_until,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          'deleted-client@users.fit.invalid', pg_catalog.now(), 'infinity',
          pg_catalog.jsonb_build_object('provider', 'email', 'providers', pg_catalog.jsonb_build_array('email')),
          '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
  on conflict (id) do nothing;
  insert into public.profiles (id, telegram_id, first_name) values (v_id, null, null) on conflict (id) do nothing;
  return v_id;
end $$;

comment on function private.ensure_deleted_client() is 'Creates the single "deleted client" stub profile on first use.';
revoke all on function private.ensure_deleted_client() from public;

-- purge_account: the anonymization 30 days after the request (data-model §1.6-4). Only a due, uncancelled
-- request is purged. Order matters: personal rows go before the pairs move to the stub, or on update cascade
-- would carry them along. Returns the Auth users the route deletes next: the user and, for a trainer, the
-- client cards whose profiles went with trainer_profiles. Null when nothing was due.
create function public.purge_account(p_user uuid)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stub uuid;
  v_users uuid[];
begin
  if not exists (
    select 1 from public.account_deletions d
    where d.user_id = p_user and d.cancelled_at is null and d.scheduled_for <= pg_catalog.now()
  ) then
    return null;
  end if;
  v_stub := private.ensure_deleted_client();
  select pg_catalog.array_agg(x.id) into v_users
  from (select p_user as id union all select p.id from public.profiles p where p.managed_by_trainer_id = p_user) x;

  -- Personal data of the user as a client and as a person.
  delete from public.measurements m where m.client_id = p_user;
  delete from public.progress_photos ph where ph.client_id = p_user;
  delete from public.intakes i where i.user_id = p_user;
  delete from public.personal_records pr where pr.client_id = p_user;
  delete from public.workout_logs w where w.client_id = p_user and w.coaching_id is null;
  delete from public.coaching_notes n where n.coaching_id in (select c.id from public.coachings c where c.client_id = p_user);
  delete from public.data_shares ds where ds.coaching_id in (select c.id from public.coachings c where c.client_id = p_user);
  delete from public.contact_requests cr where cr.requester_id = p_user or cr.recipient_id = p_user;
  delete from public.calendar_feeds f where f.user_id = p_user;
  delete from public.notification_outbox o where o.user_id = p_user;
  update public.coaching_trainer_meta m set client_alias = null, contact = null
  where m.coaching_id in (select c.id from public.coachings c where c.client_id = p_user);

  -- The trainers keep sessions, bookings, passes, payments and the ledger of the user's pairs, under the stub.
  update public.coachings c
  set status = 'ended', ended_at = coalesce(c.ended_at, pg_catalog.now()), ended_by = null, client_id = v_stub
  where c.client_id = p_user;

  -- The user's own trainer accounting goes with the trainer profile (pairs, passes, notes cascade).
  delete from public.trainer_profiles tp where tp.user_id = p_user;

  -- The fact of deletion stays (§1.6-5): the bare id, no FK and nothing personal.
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (null, 'account.purge', 'user', p_user, pg_catalog.jsonb_build_object('cards', pg_catalog.cardinality(v_users) - 1));
  return v_users;
end $$;

comment on function public.purge_account(uuid) is
  'Privacy route: anonymizes an account whose deletion is due (data-model §1.6-4) and returns the Auth users '
  'to delete next, whose deletion cascades the profiles and the rest of the personal rows.';
revoke all on function public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_account(uuid) to service_role;

-- pg_cron: calls the privacy route when an export waits, an archive expired or a deletion is due.
create function private.dispatch_privacy()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.data_exports e where e.status = 'queued'
                   or (e.status = 'processing' and e.updated_at < pg_catalog.now() - interval '15 minutes')
                   or (e.status = 'ready' and e.expires_at <= pg_catalog.now()))
     and not exists (select 1 from public.account_deletions d where d.cancelled_at is null and d.scheduled_for <= pg_catalog.now())
  then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := pg_catalog.regexp_replace(v_url, '/api/cron/notifications$', '/api/cron/privacy'),
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000);
end $$;

comment on function private.dispatch_privacy() is
  'pg_cron job body: when exports or deletions wait, calls the web privacy route on the dispatcher''s host.';
revoke all on function private.dispatch_privacy() from public;

select cron.schedule('privacy-work', '*/5 * * * *', 'select private.dispatch_privacy()');

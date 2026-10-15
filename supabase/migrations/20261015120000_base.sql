-- Wave 1 base: schemas, extensions, default privileges, every wave 1 enum, domains, immutable helpers and
-- generic trigger functions. Tables come in the next files; RLS helpers in 20261015122000_rls_helpers.sql.

create schema if not exists private;      -- RLS helpers and trigger functions; PostgREST does not expose it
create schema if not exists analytics;    -- admin materialized views later; no grants

comment on schema private is 'Internal functions for RLS, checks and triggers. Not exposed by the API; nobody gets USAGE.';
comment on schema analytics is 'Admin analytics (materialized views, later). Not exposed by the API.';

create extension if not exists pgcrypto with schema extensions;    -- already present on Supabase; gen_random_bytes
create extension if not exists btree_gist with schema extensions;  -- uuid "=" in exclusion constraints
create extension if not exists pg_trgm with schema extensions;     -- exercise name search
-- Not here: pg_cron and pg_net come with the notification dispatcher (pg_cron cannot be created outside the postgres DB).

-- Safety net: tables, sequences and functions that postgres creates in public stop being granted to anon and
-- authenticated automatically. Every file still revokes and grants explicitly. service_role keeps its defaults.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- PUBLIC keeps EXECUTE on new functions (global default), so every function still needs
-- "revoke all on function ... from public" (and "from anon" for functions in public).

revoke all on function public.set_updated_at() from public, anon, authenticated;  -- trigger only; triggers do not check EXECUTE

-- The profiles migration predates the default-privilege change above, so anon and authenticated got every table
-- privilege there. RLS already blocked them; drop the unused ones now. The people policies migration sets the
-- final column grants on profiles (signed-in users keep table SELECT until then).
revoke all on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger, maintain on table public.profiles from authenticated;

-- Enums. Every wave 1 value is created here, so table files never wait for each other. Later-wave values are
-- created too: they cost nothing, and new values would need "alter type ... add value" anyway.

create type public.app_role as enum ('admin');
create type public.app_locale as enum ('ru', 'en');
create type public.app_theme as enum ('system', 'light', 'dark');
create type public.unit_system as enum ('metric', 'imperial');
create type public.app_zone as enum ('trainer', 'client');
create type public.share_category as enum ('nutrition', 'measurements', 'photos', 'steps', 'intake', 'workouts');
-- Delegation scopes are a wave 3 feature; the type exists now so RLS helper signatures never change.
create type public.delegation_scope as enum (
  'schedule', 'attendance', 'workouts', 'homework', 'notes', 'progress', 'nutrition', 'passes', 'payments'
);
create type public.notification_type as enum (
  'booking_created', 'booking_requested', 'booking_confirmed', 'booking_declined', 'booking_expired',
  'booking_cancelled', 'booking_rescheduled', 'session_reminder', 'session_changed',
  'charge_posted', 'charge_waived', 'pass_ending', 'pass_expired', 'debt', 'payment_reported',
  'daily_digest', 'coaching_created', 'coaching_ended', 'managed_client_claim', 'intake_submitted',
  'contact_request', 'contact_response', 'verification_result', 'export_ready', 'account_deletion',
  'counterpart_deleting', 'plan_granted', 'plan_revoked', 'plan_expiring', 'feedback_reply',
  'break_glass', 'report_resolution',
  -- wave 2
  'trainer_comment', 'trainer_broadcast', 'homework_reminder', 'homework_done', 'waitlist_offer',
  'waitlist_closed', 'review_prompt', 'review_reply', 'goal_changed',
  -- wave 3
  'delegation', 'challenge', 'badge', 'referral_bonus'
);
create type public.consent_kind as enum ('beta_terms', 'privacy_policy', 'contact_share');
create type public.export_status as enum ('queued', 'processing', 'ready', 'failed', 'expired');
create type public.verification_status as enum ('not_submitted', 'pending', 'verified', 'rejected');
create type public.coaching_status as enum ('trial', 'active', 'ended');
-- 'manual' = a card (managed client without an account).
create type public.coaching_source as enum ('client_invite', 'trainer_code', 'trial_link', 'referral', 'manual');
create type public.managed_client_claim_status as enum ('pending', 'merged', 'rejected');
create type public.contact_request_status as enum ('pending', 'accepted', 'declined', 'expired');
create type public.session_mode as enum ('offline', 'online');
create type public.session_kind as enum ('personal', 'group', 'trial');
create type public.session_status as enum ('scheduled', 'completed', 'cancelled');
create type public.slot_status as enum ('open', 'booked', 'closed');
create type public.booking_status as enum (
  'requested', 'confirmed', 'declined', 'expired', 'cancelled', 'late_cancelled', 'rescheduled', 'attended', 'no_show'
);
create type public.booking_source as enum ('trainer', 'client_slot', 'client_session', 'waitlist', 'recurrence', 'trial');
create type public.actor_role as enum ('client', 'trainer', 'delegate', 'system', 'admin');
create type public.package_applies_to as enum ('any', 'personal', 'group');
-- exhausted, expired and frozen are derived in the pass_balances view.
create type public.pass_status as enum ('active', 'cancelled');
create type public.ledger_entry_type as enum (
  'grant', 'charge', 'waiver', 'settlement', 'settlement_reversal', 'refund', 'adjustment'
);
create type public.charge_reason as enum ('attended', 'late_cancel', 'no_show', 'manual');
create type public.payment_method as enum ('cash', 'bank_transfer', 'sbp', 'card', 'payment_link', 'other');
create type public.payment_status as enum ('reported', 'confirmed', 'voided');
create type public.payment_direction as enum ('in', 'refund');
create type public.payment_link_kind as enum ('sbp', 'self_employed', 'bank', 'other');
create type public.outbox_status as enum ('pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled');
create type public.exercise_source as enum ('wger', 'custom');
create type public.pr_type as enum ('max_weight', 'max_reps', 'max_duration');
create type public.measurement_kind as enum (
  'weight', 'neck', 'chest', 'waist', 'abdomen', 'hips', 'thigh', 'upper_arm', 'calf'
);
create type public.photo_angle as enum ('front', 'side', 'back');
create type public.milestone_kind as enum ('sessions_10', 'sessions_25', 'sessions_50', 'sessions_100');
create type public.feedback_kind as enum ('bug', 'idea', 'other');
create type public.feedback_status as enum ('new', 'in_progress', 'closed');
create type public.report_target as enum ('review', 'user', 'trainer_profile', 'club', 'post', 'buddy_profile');
create type public.report_status as enum ('open', 'kept', 'hidden', 'dismissed');
create type public.plan_side as enum ('trainer', 'client');
create type public.plan_grant_source as enum ('admin', 'purchase', 'referral_bonus');
create type public.access_request_status as enum ('open', 'granted', 'declined');

-- Immutable helpers. Checks, domains, defaults and generated columns run as the writing role, so signed-in
-- users and service_role get EXECUTE. They do not get USAGE on schema private, which EXECUTE does not need.

-- Declared immutable on purpose: the zone list changes only when Postgres itself is upgraded.
create function private.is_valid_tz(tz text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz)
$$;

comment on function private.is_valid_tz(text) is 'True when the text is an IANA time zone name known to Postgres (case-sensitive).';
revoke all on function private.is_valid_tz(text) from public;
grant execute on function private.is_valid_tz(text) to authenticated, service_role;

-- Must stay immutable: a partial unique index on coachings uses it in its predicate.
create function private.deleted_client_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-0000-0000-0000-00000000dead'::uuid
$$;

comment on function private.deleted_client_id() is 'Id of the single "deleted client" stub profile that anonymized pairs point to.';
revoke all on function private.deleted_client_id() from public;
grant execute on function private.deleted_client_id() to authenticated, service_role;

create function private.valid_reminder_offsets(p smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p is not null
      and coalesce(pg_catalog.array_ndims(p), 1) = 1
      and pg_catalog.cardinality(p) <= 3
      and pg_catalog.array_position(p, null) is null
      and 5 <= all (p)
      and 10080 >= all (p)
      and pg_catalog.cardinality(p) = (select count(distinct x) from pg_catalog.unnest(p) as u (x)),
    false)
$$;

comment on function private.valid_reminder_offsets(smallint[]) is
  'Reminder offsets in minutes before a session: at most 3, each from 5 to 10080, no NULLs, no duplicates.';
revoke all on function private.valid_reminder_offsets(smallint[]) from public;
grant execute on function private.valid_reminder_offsets(smallint[]) to authenticated, service_role;

-- The jsonpath operator returns NULL instead of raising on a non-object, so the function never raises.
create function private.parq_any_yes(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_typeof(p) = 'object' and p @? 'strict $.* ? (@ == true)'::jsonpath,
    false)
$$;

comment on function private.parq_any_yes(jsonb) is
  'True when the PAR-Q answers object has at least one answer that is JSON true. False for any other input.';
revoke all on function private.parq_any_yes(jsonb) from public;
grant execute on function private.parq_any_yes(jsonb) to authenticated, service_role;

-- Service and account notifications cannot be switched off (PRD 2.9-8); everything else is optional.
create function private.notification_type_is_optional(t public.notification_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(t not in (
    'managed_client_claim', 'contact_request', 'contact_response', 'verification_result', 'export_ready',
    'account_deletion', 'counterpart_deleting', 'plan_granted', 'plan_revoked', 'plan_expiring',
    'feedback_reply', 'break_glass', 'report_resolution'
  ), false)
$$;

comment on function private.notification_type_is_optional(public.notification_type) is
  'True when the user may turn this notification type off. Service and account messages are mandatory.';
revoke all on function private.notification_type_is_optional(public.notification_type) from public;
grant execute on function private.notification_type_is_optional(public.notification_type) to authenticated, service_role;

create function private.all_paths_under(p_paths text[], p_prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_prefix is not null
      and not exists (
        select 1 from pg_catalog.unnest(p_paths) as u (path)
        where u.path is null
           or not pg_catalog.starts_with(u.path, p_prefix)
           or pg_catalog.strpos(u.path, '..') > 0),
    false)
$$;

comment on function private.all_paths_under(text[], text) is
  'True when every storage path is non-null, starts with the prefix and has no "..". An empty array passes.';
revoke all on function private.all_paths_under(text[], text) from public;
grant execute on function private.all_paths_under(text[], text) to authenticated, service_role;

-- Domains. is_valid_tz(NULL) is false, not NULL, so the iana_tz check lets NULL through explicitly, as a CHECK
-- normally does; otherwise a PL/pgSQL variable of this type could not even be declared. Columns add NOT NULL.
create domain public.iana_tz as text check (value is null or private.is_valid_tz(value));
create domain public.currency_code as char(3) check (value ~ '^[A-Z]{3}$');

comment on domain public.iana_tz is 'IANA time zone name, for example Europe/Moscow.';
comment on domain public.currency_code is 'ISO 4217 currency code in upper case, for example RUB.';

-- Generic trigger functions. Trigger functions get no EXECUTE grants: firing a trigger does not check them.

-- BEFORE UPDATE OR DELETE, FOR EACH ROW. Arguments (all optional, text):
--   tg_argv[0]  columns that may change freely ('{client_id,coaching_id}'), for reassignment
--   tg_argv[1]  columns that may change only to NULL ('{created_by}'), for FK ON DELETE SET NULL
--   tg_argv[2]  'true' = DELETE allowed when it comes from an FK cascade (pg_trigger_depth() > 1)
-- updated_at is always ignored. Applies to every role, including postgres and service_role.
create function private.enforce_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable  text[] := coalesce(tg_argv[0], '{}')::text[];
  v_nullable text[] := coalesce(tg_argv[1], '{}')::text[];
  v_col text;
begin
  if tg_op = 'DELETE' then
    if coalesce(tg_argv[2], 'false')::boolean and pg_catalog.pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'append_only' using errcode = 'P0001',
      detail = pg_catalog.format('rows of %I.%I cannot be deleted', tg_table_schema, tg_table_name);
  end if;
  if (pg_catalog.to_jsonb(new) - v_mutable - v_nullable - 'updated_at'::text)
     is distinct from (pg_catalog.to_jsonb(old) - v_mutable - v_nullable - 'updated_at'::text) then
    raise exception 'append_only' using errcode = 'P0001',
      detail = pg_catalog.format('rows of %I.%I cannot be changed', tg_table_schema, tg_table_name);
  end if;
  foreach v_col in array v_nullable loop
    if (pg_catalog.to_jsonb(new) -> v_col) is distinct from (pg_catalog.to_jsonb(old) -> v_col)
       and (pg_catalog.to_jsonb(new) ->> v_col) is not null then
      raise exception 'append_only' using errcode = 'P0001',
        detail = pg_catalog.format('%I.%I.%I may only be cleared', tg_table_schema, tg_table_name, v_col);
    end if;
  end loop;
  return new;
end $$;

comment on function private.enforce_append_only() is
  'Trigger: rows may not change or be deleted, except the listed free columns, columns cleared by FK set-null and FK cascade deletes.';
revoke all on function private.enforce_append_only() from public;

-- BEFORE TRUNCATE, FOR EACH STATEMENT.
create function private.forbid_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only' using errcode = 'P0001',
    detail = pg_catalog.format('%I.%I cannot be truncated', tg_table_schema, tg_table_name);
end $$;

comment on function private.forbid_truncate() is 'Trigger: append-only tables cannot be truncated, not even by postgres.';
revoke all on function private.forbid_truncate() from public;

-- BEFORE INSERT, FOR EACH ROW. tg_argv[0] = column name. A signed-in caller (also inside a definer RPC)
-- is always stamped; server code without a JWT keeps the value it supplied.
create function private.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new := pg_catalog.jsonb_populate_record(new, pg_catalog.jsonb_build_object(tg_argv[0], auth.uid()));
  end if;
  return new;
end $$;

comment on function private.stamp_actor() is
  'Trigger: writes auth.uid() into the column named by the first argument whenever the caller is signed in.';
revoke all on function private.stamp_actor() from public;

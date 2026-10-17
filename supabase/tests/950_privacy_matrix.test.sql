-- Privacy matrix cross-check (data-model §4.3, contract §6 950_privacy_matrix), generated per table with format():
-- pair rows never cross the pair boundary (PAIR-1), an ended pair keeps its accounting but closes personal data,
-- the admin reads nothing outside the data-model §4.2 list without break-glass, anon holds no privilege on any
-- public relation, a trainer's card stays with that trainer, and no blind UPDATE or DELETE of any actor touches
-- a row that actor does not own.
begin;
\ir _helpers.psql

-- Fixtures: C has live pairs to A and B and shares everything with both, so only the pair boundary can hide
-- a pair row. D is A's other client, E's pair with A has ended, M is A's card, S a plain user. X and Y are
-- admins whose break-glass grants have expired (they open nothing but can still be revoked).
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_admin('admin_y');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_card('trainer_a', 'card_m');
select tests.set_share(t, 'client_c', c, true)
from unnest(array['trainer_a', 'trainer_b']) t, unnest(enum_range(null::public.share_category)) c;
select tests.set_share('trainer_a', 'client_e', c, true) from unnest(enum_range(null::public.share_category)) c;

-- The imported wger catalog (20261016231700_wger_catalog.sql) is replaced by one row, so the counts below are
-- this test's rows only.
delete from public.exercises where source = 'wger';
insert into public.exercises (id, source, wger_id, name, license)
values ('00000000-0000-4000-8000-000000000950', 'wger', 950, 'Squat', 'CC-BY-SA-4.0');

-- Trainer-owned rows: a place, a week template with an item, an open slot, a package, a payment link, a client
-- link, a trial link, a certificate, a custom exercise with a translation, a workout template with an item.
create function tests.fill_trainer(p_trainer text) returns void language plpgsql set search_path = '' as $$
declare
  v_trainer  uuid := tests.user_id(p_trainer);
  v_template uuid;
  v_exercise uuid := gen_random_uuid();
  v_workout  uuid;
begin
  insert into public.locations (trainer_id, name) values (v_trainer, 'Gym of ' || p_trainer);
  insert into public.week_templates (trainer_id, name, time_zone) values (v_trainer, 'Week', 'Europe/Moscow')
  returning id into v_template;
  insert into public.week_template_items (template_id, iso_weekday, start_time, end_time, duration_min)
  values (v_template, 1, '10:00', '12:00', 60);
  insert into public.slots (trainer_id, starts_at, ends_at) values (v_trainer, now() + interval '5 days', now() + interval '5 days 1 hour');
  insert into public.packages (trainer_id, title, sessions_count, price_minor, currency) values (v_trainer, 'Pack 10', 10, 10000, 'RUB');
  insert into public.payment_links (trainer_id, title, url) values (v_trainer, 'SBP', 'https://pay.example.com/' || p_trainer);
  insert into public.client_invites (trainer_id, label) values (v_trainer, 'QR');
  insert into public.trial_links (trainer_id, title, currency) values (v_trainer, 'Trial', 'RUB');
  insert into public.trainer_certificates (trainer_id, title, storage_path) values (v_trainer, 'Diploma', v_trainer::text || '/diploma.pdf');
  insert into public.exercises (id, source, owner_id, name) values (v_exercise, 'custom', v_trainer, 'Move of ' || p_trainer);
  insert into public.exercise_translations (exercise_id, locale, name) values (v_exercise, 'en', 'Move');
  insert into public.workout_templates (owner_id, title) values (v_trainer, 'Template') returning id into v_workout;
  insert into public.workout_template_items (template_id, position, exercise_id)
  values (v_workout, 1, '00000000-0000-4000-8000-000000000950');
end $$;
select tests.fill_trainer('trainer_a');
select tests.fill_trainer('trainer_b');

-- One row of every pair-scoped table in the pair (coaching_trainer_meta and data_shares come from triggers;
-- money_events from the pass, freeze and payment), plus the trainer's measurement of the client.
create function tests.fill_pair(p_trainer text, p_client text) returns void language plpgsql set search_path = '' as $$
declare
  v_pair    uuid := tests.pair_id(p_trainer, p_client);
  v_trainer uuid := tests.user_id(p_trainer);
  v_client  uuid := tests.user_id(p_client);
  v_session uuid;
  v_booking uuid;
  v_pass    uuid;
  v_log     uuid;
  v_le      uuid;
begin
  insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
  values (v_pair, v_trainer, 'Note of ' || p_trainer, true);
  insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
  values (v_trainer, v_pair, 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal');
  v_session := tests.create_session(p_trainer, now() + interval '1 day');
  v_booking := tests.create_booking(v_session, p_trainer, p_client);
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason)
  values (v_booking, null, 'confirmed', v_trainer, 'trainer', 'test');
  insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
  values (v_booking, v_client, v_trainer, 'qr', v_client);
  insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id)
  values (v_session, v_pair, v_client, v_trainer);
  insert into public.app_opens (user_id, source) values (v_client, 'session_reminder');
  insert into public.trainer_churn_dismissals (coaching_id, hidden_until) values (v_pair, now() + interval '30 days');
  v_pass := tests.create_pass(p_trainer, p_client, 10, 10000);
  insert into public.pass_freezes (pass_id, period, reason)
  values (v_pass, daterange(current_date + 10, current_date + 12), 'trip');
  insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
  values (v_pair, v_pass, 10000, 'RUB', 'cash', now(), 'confirmed');
  insert into public.milestones (coaching_id, kind, achieved_at) values (v_pair, 'sessions_10', now());
  insert into public.workout_logs (client_id, coaching_id, performed_at, local_date, created_by)
  values (v_client, v_pair, now() - interval '1 day', current_date - 1, v_trainer)
  returning id into v_log;
  insert into public.workout_log_exercises (log_id, position, exercise_id)
  values (v_log, 1, '00000000-0000-4000-8000-000000000950') returning id into v_le;
  insert into public.workout_sets (log_exercise_id, position, reps, weight_kg) values (v_le, 1, 5, 60);
  insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
  values (v_client, 'waist', 80, now(), current_date, v_trainer);
  insert into public.contact_requests (coaching_id, requester_id, recipient_id) values (v_pair, v_trainer, v_client);
  insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id) values (v_trainer, v_client, v_pair);
  insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
  values ('trainer', v_client, v_pair, 1800, current_date, v_trainer);
end $$;
select tests.fill_pair('trainer_a', 'client_c');
select tests.fill_pair('trainer_b', 'client_c');
select tests.fill_pair('trainer_a', 'client_e');

-- Personal data of C and E: a self log with a set (which builds a personal record), a measurement, a photo, an
-- intake; C also has an export, a calendar feed, notification preferences, a consent, feedback and an outbox row.
create function tests.fill_client(p_client text) returns void language plpgsql set search_path = '' as $$
declare
  v_client uuid := tests.user_id(p_client);
  v_log    uuid;
  v_le     uuid;
  v_photo  uuid := gen_random_uuid();
begin
  insert into public.workout_logs (client_id, performed_at, local_date, created_by)
  values (v_client, now(), current_date, v_client) returning id into v_log;
  insert into public.workout_log_exercises (log_id, position, exercise_id)
  values (v_log, 1, '00000000-0000-4000-8000-000000000950') returning id into v_le;
  insert into public.workout_sets (log_exercise_id, position, reps, weight_kg) values (v_le, 1, 5, 100);
  insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
  values (v_client, 'weight', 80, now(), current_date, v_client);
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  values (v_photo, v_client, 'front', current_date, v_client::text || '/' || v_photo::text || '.webp', true, 'auto', 1080, 1440);
  insert into public.intakes (user_id, form_version, answers, parq_answers)
  values (v_client, 'v1', '{"goal": "strength"}', '{"q1": false}');
  insert into public.client_goals (user_id, goal) values (v_client, 'lose');
  insert into public.body_profiles (user_id, calc_sex, birth_date, height_cm, activity_level)
  values (v_client, 'female', '1995-05-05', 165, 'moderate');
  insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
  values ('calculator', v_client, 1700, current_date, v_client);
end $$;
select tests.fill_client('client_c');
select tests.fill_client('client_e');
insert into public.data_exports (user_id) values (tests.user_id('client_c'));
insert into public.calendar_feeds (user_id, zone, token_hash)
values (tests.user_id('client_c'), 'client', sha256('feed-token'::bytea));
insert into public.notification_preferences (user_id, type, enabled)
values (tests.user_id('client_c'), 'daily_digest', false), (tests.user_id('client_d'), 'debt', false);
insert into public.consents (user_id, kind, version)
values (tests.user_id('client_c'), 'beta_terms', '2026-11-beta'), (tests.user_id('client_d'), 'beta_terms', '2026-11-beta');
insert into public.feedback (user_id, kind, body)
values (tests.user_id('client_c'), 'bug', 'The button is grey'), (tests.user_id('client_d'), 'idea', 'Dark mode');
insert into public.notification_outbox (user_id, type, dedupe_key, payload, scheduled_for, deliver_after)
values (tests.user_id('client_c'), 'daily_digest', 'digest:c', '{}', now(), now());
-- A reported payment of C (the client may still edit it).
insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status, note)
values (tests.pair_id('trainer_a', 'client_c'), 500, 'RUB', 'sbp', now(), 'reported', 'c report');
-- Expired grants: nothing opens, but the issuing admin may still revoke them.
select tests.create_break_glass('admin_x', 'client_c', '{photos}', now() - interval '1 hour', now() - interval '90 minutes');
select tests.create_break_glass('admin_y', 'client_d', '{photos}', now() - interval '1 hour', now() - interval '90 minutes');

-- The A-E pair ends: A keeps the accounting and the pair logs, and loses E's personal data (§4.3).
update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_a', 'client_e');

-- =========================================================================================================
-- Generated cases

-- Pair-scoped tables: how to find a row of a pair (pair_expr, %L = pair id) and how to name it (key_expr).
create table tests.pair_tables (tbl text primary key, key_expr text not null, pair_expr text not null);
insert into tests.pair_tables values
  ('coachings',             't.id::text',          't.id = %L'),
  ('coaching_trainer_meta', 't.coaching_id::text', 't.coaching_id = %L'),
  ('data_shares',           't.coaching_id::text', 't.coaching_id = %L'),
  ('coaching_notes',        't.id::text',          't.coaching_id = %L'),
  ('contact_requests',      't.id::text',          't.coaching_id = %L'),
  ('managed_client_claims', 't.id::text',          't.new_coaching_id = %L'),
  ('recurrences',           't.id::text',          't.coaching_id = %L'),
  ('bookings',              't.id::text',          't.coaching_id = %L'),
  ('booking_events',        't.id::text',          't.booking_id in (select b.id from public.bookings b where b.coaching_id = %L)'),
  ('check_ins',             't.booking_id::text',  't.booking_id in (select b.id from public.bookings b where b.coaching_id = %L)'),
  ('passes',                't.id::text',          't.coaching_id = %L'),
  ('pass_freezes',          't.id::text',          't.pass_id in (select p.id from public.passes p where p.coaching_id = %L)'),
  ('ledger_entries',        't.id::text',          't.coaching_id = %L'),
  ('payments',              't.id::text',          't.coaching_id = %L'),
  ('money_events',          't.id::text',          't.coaching_id = %L'),
  ('milestones',            't.id::text',          't.coaching_id = %L'),
  ('workout_logs',          't.id::text',          't.coaching_id = %L'),
  ('nutrition_targets',     't.id::text',          't.coaching_id = %L');

-- The keys of every pair row, collected as postgres (no RLS).
create table tests.pair_rows (tbl text not null, pair text not null, key text not null);
do $$
declare
  r record;
  p record;
begin
  for r in select * from tests.pair_tables loop
    for p in select * from (values ('ac', tests.pair_id('trainer_a', 'client_c')),
                                   ('bc', tests.pair_id('trainer_b', 'client_c')),
                                   ('ae', tests.pair_id('trainer_a', 'client_e'))) v (pair, id) loop
      execute format('insert into tests.pair_rows select %L, %L, %s from public.%I t where ' || r.pair_expr,
                     r.tbl, p.pair, r.key_expr, r.tbl, p.id);
    end loop;
  end loop;
end $$;
grant select on tests.pair_tables, tests.pair_rows to authenticated;

-- Accounting of an ended pair stays with both sides (§4.3); personal data of the client closes.
create table tests.ended_accounting (tbl text primary key);
insert into tests.ended_accounting values
  ('bookings'), ('booking_events'), ('check_ins'), ('passes'), ('pass_freezes'), ('ledger_entries'), ('payments'), ('money_events'),
  ('milestones');
create table tests.personal_of_client (tbl text primary key, client_col text not null);
insert into tests.personal_of_client values
  ('measurements', 'client_id'), ('progress_photos', 'client_id'), ('intakes', 'user_id'),
  ('personal_records', 'client_id'), ('client_goals', 'user_id'), ('body_profiles', 'user_id'),
  ('nutrition_targets', 'client_id');

-- Personal data the admin never reads without break-glass.
create table tests.personal_tables (tbl text primary key);
insert into tests.personal_tables values
  ('measurements'), ('progress_photos'), ('intakes'), ('coaching_notes'), ('workout_logs'),
  ('workout_log_exercises'), ('workout_sets'), ('personal_records'), ('data_exports'), ('calendar_feeds'),
  ('client_goals'), ('body_profiles'), ('nutrition_targets');

-- What the admin may read without break-glass (data-model §4.2); every other public table and view must give
-- the admin 0 rows. exercises is listed for the wger catalog; custom exercises are checked separately.
create table tests.admin_readable (tbl text primary key);
insert into tests.admin_readable values
  ('profiles'), ('public_profiles'), ('user_roles'), ('consents'), ('account_deletions'), ('trainer_profiles'),
  ('trainer_certificates'), ('trainer_verifications'), ('trainer_invites'), ('feedback'), ('reports'),
  ('admin_audit_log'), ('break_glass_grants'), ('plan_grants'), ('access_requests'), ('plans'), ('exercises');
create table tests.admin_checked as
select c.relname::text as tbl
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and not exists (select 1 from pg_catalog.pg_depend d where d.objid = c.oid and d.deptype = 'e')
  and c.relname not in (select tbl from tests.admin_readable);
grant select on tests.ended_accounting, tests.personal_of_client, tests.personal_tables, tests.admin_checked to authenticated;

-- Blind writes: every table with an UPDATE or DELETE grant, a constant SET on a granted column, no WHERE and
-- nothing read back (a WHERE or RETURNING that reads columns would apply the SELECT policy and hide a broken
-- write policy). owner_expr (%1$L = the actor) is exactly the rows the write policy and the guards let the
-- actor change; key_expr names a row across the write.
create table tests.write_cases (
  label      text primary key,
  tbl        text not null,
  cmd        text not null check (cmd in ('update', 'delete')),
  set_clause text,
  key_expr   text not null default 't.id::text',
  owner_expr text not null,
  actors     text[] not null default array['trainer_a', 'trainer_b', 'client_c', 'client_d', 'client_e', 'stranger_s', 'admin_x']
);
insert into tests.write_cases (label, tbl, cmd, set_clause, key_expr, owner_expr, actors) values
  ('body_profiles', 'body_profiles', 'update', 'height_cm = 170', 't.user_id::text', 't.user_id = %1$L', default),
  ('break_glass_grants', 'break_glass_grants', 'update', 'revoked_at = now()', 't.id::text',
   $o$t.admin_id = %1$L and t.revoked_at is null and exists (select 1 from public.user_roles r where r.user_id = %1$L and r.role = 'admin')$o$,
   default),
  ('client_invites', 'client_invites', 'update', $s$label = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('coaching_notes', 'coaching_notes', 'update', $s$body = 'probe'$s$, 't.id::text',
   't.author_id = %1$L and exists (select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L)', default),
  ('coaching_trainer_meta', 'coaching_trainer_meta', 'update', $s$client_alias = 'probe'$s$, 't.coaching_id::text',
   'exists (select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L)', default),
  ('coachings (client columns)', 'coachings', 'update', $s$client_reminder_offsets = '{60}'$s$, 't.id::text',
   't.client_id = %1$L', array['client_c', 'client_d', 'client_e', 'stranger_s', 'admin_x']),
  ('coachings (trainer columns)', 'coachings', 'update', 'self_book_on_debt = true', 't.id::text',
   't.trainer_id = %1$L', array['trainer_a', 'trainer_b']),
  ('consents', 'consents', 'update', 'revoked_at = now()', 't.id::text', 't.user_id = %1$L', default),
  ('data_shares', 'data_shares', 'update', 'steps = true', 't.coaching_id::text',
   'exists (select 1 from public.coachings c where c.id = t.coaching_id and c.client_id = %1$L)', default),
  ('exercise_translations', 'exercise_translations', 'update', $s$name = 'probe'$s$, $k$t.exercise_id::text || t.locale::text$k$,
   $o$exists (select 1 from public.exercises e where e.id = t.exercise_id and e.source = 'custom' and e.owner_id = %1$L)$o$, default),
  ('exercises', 'exercises', 'update', $s$name = 'probe'$s$, 't.id::text', $o$t.source = 'custom' and t.owner_id = %1$L$o$, default),
  ('feedback', 'feedback', 'update', $s$status = 'in_progress'$s$, 't.id::text',
   $o$exists (select 1 from public.user_roles r where r.user_id = %1$L and r.role = 'admin')$o$, default),
  ('locations', 'locations', 'update', $s$name = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('measurements', 'measurements', 'update', $s$note = 'probe'$s$, 't.id::text',
   $o$t.entered_by = %1$L and (t.client_id = %1$L or exists (
      select 1 from public.coachings c join public.data_shares d on d.coaching_id = c.id
      where c.client_id = t.client_id and c.trainer_id = %1$L and c.status in ('trial', 'active') and d.measurements))$o$, default),
  ('notification_preferences', 'notification_preferences', 'update', 'enabled = true', $k$t.user_id::text || t.type::text$k$,
   't.user_id = %1$L', default),
  ('packages', 'packages', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('pass_freezes', 'pass_freezes', 'update', $s$reason = 'probe'$s$, 't.id::text',
   $o$exists (select 1 from public.passes p join public.coachings c on c.id = p.coaching_id
              where p.id = t.pass_id and p.status = 'active' and c.trainer_id = %1$L)$o$, default),
  ('passes', 'passes', 'update', $s$title = 'probe'$s$, 't.id::text',
   $o$t.status = 'active' and exists (select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L)$o$, default),
  ('payment_links', 'payment_links', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('payments (client columns)', 'payments', 'update', $s$note = 'probe'$s$, 't.id::text',
   $o$t.client_id = %1$L and t.status = 'reported'$o$, array['client_c', 'client_d', 'client_e', 'stranger_s', 'admin_x']),
  ('payments (trainer void)', 'payments', 'update', $s$status = 'voided', void_reason = 'probe'$s$, 't.id::text',
   'exists (select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L)', array['trainer_a', 'trainer_b']),
  ('progress_photos', 'progress_photos', 'update', $s$note = 'probe'$s$, 't.id::text', 't.client_id = %1$L', default),
  ('recurrences', 'recurrences', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('sessions', 'sessions', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('slots', 'slots', 'update', 'allow_trial = false', 't.id::text', $o$t.trainer_id = %1$L and t.status <> 'booked'$o$, default),
  ('trainer_certificates', 'trainer_certificates', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('trainer_profiles', 'trainer_profiles', 'update', $s$headline = 'probe'$s$, 't.user_id::text', 't.user_id = %1$L', default),
  ('trial_links', 'trial_links', 'update', $s$title = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('user_settings', 'user_settings', 'update', $s$locale = 'en'$s$, 't.user_id::text', 't.user_id = %1$L', default),
  ('week_template_items', 'week_template_items', 'update', 'allow_trial = false', 't.id::text',
   'exists (select 1 from public.week_templates w where w.id = t.template_id and w.trainer_id = %1$L)', default),
  ('week_templates', 'week_templates', 'update', $s$name = 'probe'$s$, 't.id::text', 't.trainer_id = %1$L', default),
  ('workout_log_exercises', 'workout_log_exercises', 'update', $s$notes = 'probe'$s$, 't.id::text',
   $o$exists (select 1 from public.workout_logs l where l.id = t.log_id and l.created_by = %1$L
              and (l.client_id = %1$L or exists (select 1 from public.coachings c where c.id = l.coaching_id and c.trainer_id = %1$L))
              and (l.coaching_id is null or exists (select 1 from public.coachings c where c.id = l.coaching_id and c.status in ('trial', 'active'))))$o$,
   default),
  ('workout_logs', 'workout_logs', 'update', $s$notes = 'probe'$s$, 't.id::text',
   $o$t.created_by = %1$L and (t.client_id = %1$L or exists (
      select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L and c.status in ('trial', 'active')))$o$,
   default),
  ('workout_sets', 'workout_sets', 'update', 'rpe = 5', 't.id::text',
   $o$exists (select 1 from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
              where e.id = t.log_exercise_id and l.created_by = %1$L
              and (l.client_id = %1$L or exists (select 1 from public.coachings c where c.id = l.coaching_id and c.trainer_id = %1$L))
              and (l.coaching_id is null or exists (select 1 from public.coachings c where c.id = l.coaching_id and c.status in ('trial', 'active'))))$o$,
   default),
  ('workout_template_items', 'workout_template_items', 'update', $s$notes = 'probe'$s$, 't.id::text',
   'exists (select 1 from public.workout_templates w where w.id = t.template_id and w.owner_id = %1$L)', default),
  ('workout_templates', 'workout_templates', 'update', $s$title = 'probe'$s$, 't.id::text', 't.owner_id = %1$L', default);

insert into tests.write_cases (label, tbl, cmd, key_expr, owner_expr, actors)
select 'delete ' || w.tbl, w.tbl, 'delete', w.key_expr, w.owner_expr, w.actors
from tests.write_cases w
where w.cmd = 'update'
  and w.tbl in ('coaching_notes', 'exercise_translations', 'measurements', 'notification_preferences', 'progress_photos',
                'slots', 'trainer_certificates', 'week_template_items', 'week_templates', 'workout_log_exercises',
                'workout_sets', 'workout_template_items', 'workout_templates');
insert into tests.write_cases (label, tbl, cmd, key_expr, owner_expr, actors) values
  ('delete intakes', 'intakes', 'delete', 't.id::text', 't.user_id = %1$L', default),
  ('delete workout_logs', 'workout_logs', 'delete', 't.id::text',
   $o$t.client_id = %1$L or (t.created_by = %1$L and exists (
      select 1 from public.coachings c where c.id = t.coaching_id and c.trainer_id = %1$L and c.status in ('trial', 'active')))$o$,
   default),
  ('delete pass_freezes', 'pass_freezes', 'delete', 't.id::text',
   $o$exists (select 1 from public.passes p join public.coachings c on c.id = p.coaching_id join public.profiles pr on pr.id = p.trainer_id
              where p.id = t.pass_id and p.status = 'active' and c.trainer_id = %1$L
                and lower(t.period) > (now() at time zone pr.time_zone)::date)$o$,
   default),
  -- Every pass of the fixtures is in use (payments), so the pass delete guard would refuse its trainer: only
  -- actors without passes of their own are probed.
  ('delete passes', 'passes', 'delete', 't.id::text', 'false', array['client_c', 'client_d', 'client_e', 'stranger_s', 'admin_x']);

-- Runs one blind write as the actor, then rolls it back. 'ok' when exactly the owned rows changed and every
-- other row is byte for byte the same; else what went wrong.
create function tests.write_probe(p_label text, p_actor text) returns text language plpgsql set search_path = '' as $$
declare
  c          tests.write_cases;
  v_actor    uuid := tests.user_id(p_actor);
  v_owner    text;
  v_owned    text[];
  v_before   text;
  v_after    text;
  v_changed  integer;
  v_result   text;
begin
  select * into c from tests.write_cases w where w.label = p_label;
  v_owner := format(c.owner_expr, v_actor);
  execute format('select coalesce(array_agg(%s), ''{}'') from public.%I t where %s', c.key_expr, c.tbl, v_owner) into v_owned;
  execute format(
    'select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text), '''')) from public.%I t where not (%s = any ($1))',
    c.tbl, c.key_expr) using v_owned into v_before;
  begin
    perform tests.authenticate_as(p_actor);
    if c.cmd = 'update' then
      execute format('update public.%I set %s', c.tbl, c.set_clause);
    else
      execute format('delete from public.%I', c.tbl);
    end if;
    get diagnostics v_changed = row_count;
    perform tests.clear_authentication();
    execute format(
      'select md5(coalesce(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text), '''')) from public.%I t where not (%s = any ($1))',
      c.tbl, c.key_expr) using v_owned into v_after;
    v_result := case
      when v_after is distinct from v_before then 'changed rows it does not own'
      when v_changed <> cardinality(v_owned) then format('changed %s rows, owns %s', v_changed, cardinality(v_owned))
      else 'ok'
    end;
    raise exception 'write_probe_rollback';
  exception when others then
    if sqlerrm <> 'write_probe_rollback' then
      v_result := 'error: ' || sqlerrm;
    end if;
  end;
  perform tests.clear_authentication();
  return v_result;
end $$;
grant select on tests.write_cases to authenticated;

-- 6 checks per pair-scoped table, 1 per ended-pair accounting table, 1 per client personal table, 2 per
-- personal-data table, 1 per relation the admin must not read, 1 custom exercise check, 11 card checks,
-- 1 sequence check, one anon check per public table and view, one per blind write and actor.
select plan(
  (select count(*)::integer * 6 from tests.pair_tables)
  + (select count(*)::integer from tests.ended_accounting)
  + (select count(*)::integer from tests.personal_of_client)
  + (select count(*)::integer * 2 from tests.personal_tables)
  + (select count(*)::integer from tests.admin_checked) + 1
  + 11 + 1
  + (select count(*)::integer
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = c.oid and d.deptype = 'e'))
  + (select sum(cardinality(actors))::integer from tests.write_cases)
);

-- =========================================================================================================
-- Pair-scoped tables (PAIR-1)

-- How many rows of the pair the current role reads in the table.
create function tests.pair_rows_read(p_tbl text, p_pair text) returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  execute format(
    'select count(*)::integer from public.%I t where %s in (select r.key from tests.pair_rows r where r.tbl = %L and r.pair = %L)',
    p_tbl, (select k.key_expr from tests.pair_tables k where k.tbl = p_tbl), p_tbl, p_pair)
  into v_count;
  return v_count;
end $$;
create function tests.pair_rows_total(p_tbl text, p_pair text) returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from tests.pair_rows r where r.tbl = p_tbl and r.pair = p_pair
$$;

select ok(
  tests.pair_rows_total(tbl, 'ac') > 0 and tests.pair_rows_total(tbl, 'bc') > 0,
  format('%s: fixtures have rows in the A-C and B-C pairs', tbl)
)
from tests.pair_tables order by tbl;

select tests.authenticate_as('trainer_a');
select is(tests.pair_rows_read(tbl, 'ac'), tests.pair_rows_total(tbl, 'ac'), format('%s: A reads every row of the A-C pair', tbl))
from tests.pair_tables order by tbl;
select is(tests.pair_rows_read(tbl, 'bc'), 0, format('%s: A reads 0 rows of the B-C pair', tbl))
from tests.pair_tables order by tbl;

select tests.authenticate_as('trainer_b');
select is(tests.pair_rows_read(tbl, 'bc'), tests.pair_rows_total(tbl, 'bc'), format('%s: B reads every row of the B-C pair', tbl))
from tests.pair_tables order by tbl;
select is(tests.pair_rows_read(tbl, 'ac'), 0, format('%s: B reads 0 rows of the A-C pair', tbl))
from tests.pair_tables order by tbl;

select tests.authenticate_as('client_d');
select is(tests.pair_rows_read(tbl, 'ac'), 0, format('%s: D, another client of A, reads 0 rows of the A-C pair', tbl))
from tests.pair_tables order by tbl;

-- =========================================================================================================
-- The ended A-E pair: accounting stays with A; E's personal data closes for A (§4.3, PRD 2.12-5)

select tests.authenticate_as('trainer_a');
select ok(
  tests.pair_rows_total(a.tbl, 'ae') > 0 and tests.pair_rows_read(a.tbl, 'ae') = tests.pair_rows_total(a.tbl, 'ae'),
  format('%s: A still reads every row of the ended A-E pair', a.tbl)
)
from tests.ended_accounting a order by a.tbl;

select tests.clear_authentication();
create function tests.client_rows_read(p_tbl text, p_col text, p_client uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  execute format('select count(*)::integer from public.%I t where t.%I = $1', p_tbl, p_col) using p_client into v_count;
  return v_count;
end $$;
select tests.authenticate_as('trainer_a');
select is(tests.client_rows_read(p.tbl, p.client_col, tests.user_id('client_e')), 0,
  format('%s: A reads 0 of E''s rows once the pair ended', p.tbl))
from tests.personal_of_client p order by p.tbl;

-- =========================================================================================================
-- The admin: no personal data without break-glass, and nothing outside the data-model §4.2 list

select tests.clear_authentication();

-- How many rows of the table the current role reads.
create function tests.rows_read(p_tbl text) returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  execute format('select count(*)::integer from public.%I', p_tbl) into v_count;
  return v_count;
end $$;

select ok(tests.rows_read(tbl) > 0, format('%s: fixtures have rows', tbl)) from tests.personal_tables order by tbl;
-- Rows the current role reads; a relation without any grant (the outbox) reads as 0.
create function tests.rows_visible(p_tbl text) returns integer language plpgsql set search_path = '' as $$
begin
  return tests.rows_read(p_tbl);
exception when insufficient_privilege then
  return 0;
end $$;
-- Row totals as the owner, kept for the admin check below; own is the admin's own rows (the settings row).
create table tests.admin_totals as
select tbl, tests.rows_read(tbl) as total, case tbl when 'user_settings' then 1 else 0 end as own
from tests.admin_checked;
grant select on tests.admin_totals to authenticated;

select tests.authenticate_as('admin_x');
select is(tests.rows_read(tbl), 0, format('%s: the admin reads 0 rows without break-glass', tbl))
from tests.personal_tables order by tbl;
select ok(
  t.total > t.own and tests.rows_visible(t.tbl) = t.own,
  format('%s: the admin reads none of the other %s rows (not on the data-model §4.2 list)', t.tbl, t.total - t.own)
)
from tests.admin_totals t order by t.tbl;
select is((select count(*)::integer from public.exercises where source = 'custom'), 0,
  'exercises: the admin reads the wger catalog but no custom exercise');

-- =========================================================================================================
-- anon holds nothing on any public table, view or sequence

select tests.clear_authentication();
select ok(
  not exists (
    select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p (priv)
    where pg_catalog.has_table_privilege('anon', c.oid, p.priv))
  and not pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'),
  format('anon: no table or column privilege on public.%I', c.relname)
)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  -- relations of extensions (pgTAP views when it is installed in public) are not ours
  and not exists (select 1 from pg_catalog.pg_depend d where d.objid = c.oid and d.deptype = 'e')
order by c.relname;

select is_empty(
  $$ select c.relname
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       -- case keeps the planner from probing non-sequences in other schemas before the filter
       and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') end $$,
  'anon: no privilege on any public sequence'
);

-- =========================================================================================================
-- Card M stays with A: B, S and the admin read neither M's profile nor M's pair

create table tests.card (profile_id uuid not null, pair_id uuid not null);
insert into tests.card values (tests.user_id('card_m'), tests.pair_id('trainer_a', 'card_m'));
grant select on tests.card to authenticated;

select tests.authenticate_as('trainer_a');
select isnt_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: A reads M''s profile');
select isnt_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id $$,
  'card: A reads M''s pair');

select tests.authenticate_as('trainer_b');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: B reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: B reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: B reads 0 rows of M''s pair');

select tests.authenticate_as('stranger_s');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: S reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: S reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: S reads 0 rows of M''s pair');

select tests.authenticate_as('admin_x');
select is_empty($$ select 1 from public.profiles p join tests.card m on m.profile_id = p.id $$,
  'card: the admin reads 0 rows of M''s profile');
select is_empty($$ select 1 from public.public_profiles p join tests.card m on m.profile_id = p.id $$,
  'card: the admin reads 0 rows of M in public_profiles');
select is_empty($$ select 1 from public.coachings c join tests.card m on m.pair_id = c.id or m.profile_id = c.client_id $$,
  'card: the admin reads 0 rows of M''s pair');

-- =========================================================================================================
-- Blind writes: no actor changes or deletes a row it does not own (each probe is rolled back)

select tests.clear_authentication();
select is(tests.write_probe(w.label, a.actor), 'ok', format('%s: a blind %s by %s changes only own rows', w.label, w.cmd, a.actor))
from tests.write_cases w cross join lateral unnest(w.actors) a (actor)
order by w.label, a.actor;

select * from finish();
rollback;

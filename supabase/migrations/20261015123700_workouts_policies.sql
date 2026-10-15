-- Workouts policies (data-model §4.2, §4.3, contract §1.4 file 21): exercises, exercise_translations,
-- workout_templates, workout_template_items, workout_logs, workout_log_exercises, workout_sets, personal_records.
-- Tables: 20261015120800_workouts_tables.sql. Every table starts from no privileges; the grants below are the
-- whole API surface for signed-in users. Who may change which column is settled by the grants alone: on each
-- table every actor the UPDATE policy lets through may change the same columns (contract §3.5), so there are
-- no guard triggers here. The author columns (workout_logs.created_by) are stamped by an invariant trigger.

revoke all on table
  public.exercises,
  public.exercise_translations,
  public.workout_templates,
  public.workout_template_items,
  public.workout_logs,
  public.workout_log_exercises,
  public.workout_sets,
  public.personal_records
from anon, authenticated;

-- exercises

-- The wger catalog is open to everyone signed in. A custom exercise is seen by its trainer and by the clients
-- of that trainer in any pair status (R81), so an ended client still reads old logs (PRD 2.10-1, WORK-2).
-- A custom exercise whose author deleted the account has owner_id null (R61); a client whose own logs use it
-- keeps reading it, because the logs stay with the client (PRD 2.12-8). Nobody else reads it. The client could
-- read it before the author left, so this opens nothing new.
create policy "exercises: catalog, own and own trainers' read"
  on public.exercises for select
  to authenticated
  using (
    source = 'wger'
    or owner_id = (select auth.uid())
    or owner_id in (select private.trainer_ids_visible())
    or (source = 'custom' and owner_id is null and id in (select private.own_logged_exercise_ids())));

-- Only trainers add their own exercises; wger rows come from the import job with the secret key.
create policy "exercises: trainer adds custom"
  on public.exercises for insert
  to authenticated
  with check (source = 'custom' and owner_id = (select auth.uid()) and (select private.is_trainer()));

-- The owner edits and archives (no DELETE: logs and templates keep referencing the exercise).
create policy "exercises: owner updates custom"
  on public.exercises for update
  to authenticated
  using (source = 'custom' and owner_id = (select auth.uid()))
  with check (source = 'custom' and owner_id = (select auth.uid()));

grant select on table public.exercises to authenticated;
grant insert (
  id, source, owner_id, name, category, muscles_primary, muscles_secondary, equipment, video_url, image_path,
  license, license_author, source_url
) on table public.exercises to authenticated;
grant update (
  name, category, muscles_primary, muscles_secondary, equipment, video_url, image_path, license, license_author,
  source_url, archived_at
) on table public.exercises to authenticated;

-- exercise_translations

-- Readable together with the exercise (the subquery runs under the exercises policy).
create policy "exercise_translations: readers of the exercise read"
  on public.exercise_translations for select
  to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));

-- The owner of a custom exercise writes its translations; wger translations come from the import job.
create policy "exercise_translations: owner of custom inserts"
  on public.exercise_translations for insert
  to authenticated
  with check (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.source = 'custom' and e.owner_id = (select auth.uid())));

create policy "exercise_translations: owner of custom updates"
  on public.exercise_translations for update
  to authenticated
  using (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.source = 'custom' and e.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.source = 'custom' and e.owner_id = (select auth.uid())));

create policy "exercise_translations: owner of custom deletes"
  on public.exercise_translations for delete
  to authenticated
  using (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.source = 'custom' and e.owner_id = (select auth.uid())));

grant select, delete on table public.exercise_translations to authenticated;
grant insert (exercise_id, locale, name, description) on table public.exercise_translations to authenticated;
grant update (name, description) on table public.exercise_translations to authenticated;

-- workout_templates

-- A trainer's own library: no client and no other trainer reads it in wave 1 (homework templates come in
-- wave 2). Reading goes through acts_for_trainer because wave 3 delegates with the workouts scope read too.
create policy "workout_templates: owner reads"
  on public.workout_templates for select
  to authenticated
  using (private.acts_for_trainer(owner_id, 'workouts'));

create policy "workout_templates: trainer creates own"
  on public.workout_templates for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_trainer()));

create policy "workout_templates: owner updates"
  on public.workout_templates for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- The UI archives; a hard delete is allowed and logs keep a null template_id (R51).
create policy "workout_templates: owner deletes"
  on public.workout_templates for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant select, delete on table public.workout_templates to authenticated;
grant insert (id, owner_id, title, notes) on table public.workout_templates to authenticated;
grant update (title, notes, archived_at) on table public.workout_templates to authenticated;

-- workout_template_items

-- Readable with the template (the subquery runs under the workout_templates policy).
create policy "workout_template_items: template readers read"
  on public.workout_template_items for select
  to authenticated
  using (exists (select 1 from public.workout_templates t where t.id = template_id));

-- The template owner writes items, and only with exercises the owner can see: never another trainer's
-- custom exercise.
create policy "workout_template_items: template owner inserts"
  on public.workout_template_items for insert
  to authenticated
  with check (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id));

create policy "workout_template_items: template owner updates"
  on public.workout_template_items for update
  to authenticated
  using (exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id));

create policy "workout_template_items: template owner deletes"
  on public.workout_template_items for delete
  to authenticated
  using (exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = (select auth.uid())));

grant select, delete on table public.workout_template_items to authenticated;
grant insert (
  id, template_id, position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, rest_s, notes
) on table public.workout_template_items to authenticated;
grant update (
  position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, rest_s, notes
) on table public.workout_template_items to authenticated;

-- workout_logs

-- The client reads every own log. The trainer of the pair reads its pair logs in any status: they are part of
-- the shared history, like sessions. Self logs (coaching_id null and written by the client, R62) are read by
-- the trainers of the client's live pairs while workouts is shared (Q38, PRIV-4), and by an admin only through
-- a live break-glass grant (both inside can_view). A pair log whose pair was deleted has coaching_id null but a
-- trainer author, so it is no self log and stays with the client alone: it never leaks to another trainer.
create policy "workout_logs: client, pair trainer, shared self logs read"
  on public.workout_logs for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (coaching_id is not null and private.is_coaching_trainer(coaching_id, 'workouts'))
    or (coaching_id is null and created_by = client_id and private.can_view(client_id, 'workouts')));

-- The client writes self logs only (no pair, no booking). The trainer writes pair logs only in a live pair of
-- their own; the composite foreign keys keep client_id and booking_id inside that pair (23503 otherwise).
-- created_by is stamped from auth.uid() before this check runs. A template must be one the caller can read.
create policy "workout_logs: client or live pair trainer inserts"
  on public.workout_logs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (template_id is null or exists (select 1 from public.workout_templates t where t.id = template_id))
    and (
      (client_id = (select auth.uid()) and coaching_id is null and booking_id is null)
      or (coaching_id is not null
          and private.is_coaching_trainer(coaching_id, 'workouts')
          and private.is_live_coaching(coaching_id))));

-- Only the author edits (PRD 2.10-10, R42), and only while still the client or the trainer of a live pair:
-- after the client ends the pair, the trainer keeps reading the pair logs but can no longer change them
-- (PRD 2.12-5). Deviation from contract §1.4: the check also requires a readable template, as on insert, so
-- an edit cannot point a log at another trainer's template.
create policy "workout_logs: author updates"
  on public.workout_logs for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and (client_id = (select auth.uid())
         or (coaching_id is not null
             and private.is_coaching_trainer(coaching_id, 'workouts')
             and private.is_live_coaching(coaching_id))))
  with check (
    created_by = (select auth.uid())
    and (template_id is null or exists (select 1 from public.workout_templates t where t.id = template_id))
    and (client_id = (select auth.uid())
         or (coaching_id is not null
             and private.is_coaching_trainer(coaching_id, 'workouts')
             and private.is_live_coaching(coaching_id))));

-- The client deletes any own log, pair logs included (the data belongs to the client); a trainer deletes the
-- pair logs they wrote while the pair is live. Exercises and sets go with the log by cascade.
create policy "workout_logs: client or authoring trainer deletes"
  on public.workout_logs for delete
  to authenticated
  using (
    client_id = (select auth.uid())
    or (created_by = (select auth.uid())
        and coaching_id is not null
        and private.is_coaching_trainer(coaching_id, 'workouts')
        and private.is_live_coaching(coaching_id)));

grant select, delete on table public.workout_logs to authenticated;
grant insert (
  id, client_id, coaching_id, booking_id, template_id, title, performed_at, local_date, duration_min, notes
) on table public.workout_logs to authenticated;
grant update (template_id, title, performed_at, local_date, duration_min, notes) on table public.workout_logs to authenticated;

-- workout_log_exercises

-- Readable with the log (the subquery runs under the workout_logs policy).
create policy "workout_log_exercises: log readers read"
  on public.workout_log_exercises for select
  to authenticated
  using (exists (select 1 from public.workout_logs l where l.id = log_id));

-- Only the author of a log the caller can still read writes its exercises, only while the log is a self log
-- or its pair is live (an ended pair's logs are read-only for the trainer), and only with exercises the
-- caller can see.
create policy "workout_log_exercises: log author inserts"
  on public.workout_log_exercises for insert
  to authenticated
  with check (
    exists (select 1 from public.workout_logs l
            where l.id = log_id and l.created_by = (select auth.uid())
              and (l.coaching_id is null or private.is_live_coaching(l.coaching_id)))
    and exists (select 1 from public.exercises e where e.id = exercise_id));

create policy "workout_log_exercises: log author updates"
  on public.workout_log_exercises for update
  to authenticated
  using (exists (select 1 from public.workout_logs l
                 where l.id = log_id and l.created_by = (select auth.uid())
                   and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))))
  with check (
    exists (select 1 from public.workout_logs l
            where l.id = log_id and l.created_by = (select auth.uid())
              and (l.coaching_id is null or private.is_live_coaching(l.coaching_id)))
    and exists (select 1 from public.exercises e where e.id = exercise_id));

create policy "workout_log_exercises: log author deletes"
  on public.workout_log_exercises for delete
  to authenticated
  using (exists (select 1 from public.workout_logs l
                 where l.id = log_id and l.created_by = (select auth.uid())
                   and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))));

grant select, delete on table public.workout_log_exercises to authenticated;
grant insert (id, log_id, position, exercise_id, notes) on table public.workout_log_exercises to authenticated;
grant update (position, exercise_id, notes) on table public.workout_log_exercises to authenticated;

-- workout_sets

-- Readable with the log exercise (the subquery runs under the workout_log_exercises policy).
create policy "workout_sets: log readers read"
  on public.workout_sets for select
  to authenticated
  using (exists (select 1 from public.workout_log_exercises e where e.id = log_exercise_id));

-- Only the author of the log writes its sets, and only while the log is a self log or its pair is live.
create policy "workout_sets: log author inserts"
  on public.workout_sets for insert
  to authenticated
  with check (exists (
    select 1 from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
    where e.id = log_exercise_id and l.created_by = (select auth.uid())
      and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))));

create policy "workout_sets: log author updates"
  on public.workout_sets for update
  to authenticated
  using (exists (
    select 1 from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
    where e.id = log_exercise_id and l.created_by = (select auth.uid())
      and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))))
  with check (exists (
    select 1 from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
    where e.id = log_exercise_id and l.created_by = (select auth.uid())
      and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))));

create policy "workout_sets: log author deletes"
  on public.workout_sets for delete
  to authenticated
  using (exists (
    select 1 from public.workout_log_exercises e join public.workout_logs l on l.id = e.log_id
    where e.id = log_exercise_id and l.created_by = (select auth.uid())
      and (l.coaching_id is null or private.is_live_coaching(l.coaching_id))));

grant select, delete on table public.workout_sets to authenticated;
grant insert (id, log_exercise_id, position, reps, weight_kg, duration_s, distance_m, rpe, is_warmup)
  on table public.workout_sets to authenticated;
grant update (position, reps, weight_kg, duration_s, distance_m, rpe, is_warmup) on table public.workout_sets to authenticated;

-- personal_records

-- The cache holds one best per client over every log of the client, including logs a trainer may not see
-- (self logs not shared, other trainers' pairs). Showing a trainer a row only when its set is visible still
-- leaked: the trainer controls a competing set and learns whether it became the record (a binary search over
-- the value and the date). So only the client reads the cache. Trainers and break-glass admins read
-- public.visible_personal_records, which computes the bests over the sets they can see (R43).
-- Written only by the recompute triggers.
create policy "personal_records: client reads own"
  on public.personal_records for select
  to authenticated
  using (client_id = (select auth.uid()));

grant select on table public.personal_records to authenticated;

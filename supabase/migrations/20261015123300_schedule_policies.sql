-- Schedule policies (data-model §4.2, contract §1.4 file 17): locations, week_templates, week_template_items,
-- slots, recurrences, sessions. Tables: 20261015120400_schedule_tables.sql.
-- Every table starts from no privileges; the grants below are the whole API surface for signed-in users.
-- Rows a delegate may reach in wave 3 go through private.acts_for_trainer(..., 'schedule'), which in wave 1
-- is the owner check. Reference data (locations) is visible in any pair status; open slots and open sessions
-- only while the pair is live (R81).

revoke all on table
  public.locations,
  public.week_templates,
  public.week_template_items,
  public.slots,
  public.recurrences,
  public.sessions
from anon, authenticated;

-- locations -----------------------------------------------------------------------------------------------

-- Clients of any pair status see where their trainer works, archived places included, so past sessions keep
-- their address (R81). Only the owner writes; the matrix gives delegates read access only.
create policy "locations: trainer and their clients read"
  on public.locations for select
  to authenticated
  using (trainer_id in (select private.trainer_ids_visible()) or private.acts_for_trainer(trainer_id, 'schedule'));

create policy "locations: trainer inserts"
  on public.locations for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy "locations: trainer updates"
  on public.locations for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

comment on policy "locations: trainer and their clients read" on public.locations is
  'The trainer and clients of any pair with that trainer read the trainer''s places, archived ones too (R81).';
comment on policy "locations: trainer inserts" on public.locations is 'A trainer adds places only for themselves.';
comment on policy "locations: trainer updates" on public.locations is
  'A trainer edits and archives own places. No DELETE: sessions and trial links keep pointing at them.';

grant select on table public.locations to authenticated;
grant insert (trainer_id, name, address, lat, lng, notes, archived_at) on table public.locations to authenticated;
grant update (name, address, lat, lng, notes, archived_at) on table public.locations to authenticated;

-- week_templates ------------------------------------------------------------------------------------------

-- Trainer-only planning data. generated_until belongs to the slot generator, so it is not granted.
create policy "week_templates: trainer manages"
  on public.week_templates for all
  to authenticated
  using (private.acts_for_trainer(trainer_id, 'schedule'))
  with check (private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "week_templates: trainer manages" on public.week_templates is
  'Only the trainer (wave 3: a schedule delegate) reads and writes the week templates.';

grant select, delete on table public.week_templates to authenticated;
grant insert (trainer_id, name, time_zone, is_active, horizon_weeks, buffer_min) on table public.week_templates to authenticated;
grant update (name, time_zone, is_active, horizon_weeks, buffer_min) on table public.week_templates to authenticated;

-- week_template_items -------------------------------------------------------------------------------------

-- Items follow their template. The subquery runs under the week_templates policy too, so another trainer's
-- template is simply not found. The items hold the private online link (R77), so clients never read them.
-- template_id is not in the UPDATE grant: an item cannot be moved to another template.
create policy "week_template_items: trainer manages"
  on public.week_template_items for all
  to authenticated
  using (exists (
    select 1 from public.week_templates t
    where t.id = template_id and private.acts_for_trainer(t.trainer_id, 'schedule')))
  with check (exists (
    select 1 from public.week_templates t
    where t.id = template_id and private.acts_for_trainer(t.trainer_id, 'schedule')));

comment on policy "week_template_items: trainer manages" on public.week_template_items is
  'Only the trainer of the template reads and writes its items, which hold the private online link (R77).';

grant select, delete on table public.week_template_items to authenticated;
grant insert (template_id, iso_weekday, start_time, end_time, duration_min, location_id, mode, meeting_url, allow_trial)
  on table public.week_template_items to authenticated;
grant update (iso_weekday, start_time, end_time, duration_min, location_id, mode, meeting_url, allow_trial)
  on table public.week_template_items to authenticated;

-- slots ---------------------------------------------------------------------------------------------------

-- Clients of a live pair see only open future slots (R81); booked and closed ones would reveal other
-- clients' times and the trainer's days off. 'booked' is set and cleared only by the booking RPCs, so a
-- user may neither write it nor touch or delete a booked slot. template_item_id belongs to the generator.
create policy "slots: trainer, or live clients for open future slots, read"
  on public.slots for select
  to authenticated
  using (
    (status = 'open' and starts_at > now() and trainer_id in (select private.trainer_ids_visible(true)))
    or private.acts_for_trainer(trainer_id, 'schedule')
  );

create policy "slots: trainer inserts open or closed"
  on public.slots for insert
  to authenticated
  with check (status in ('open', 'closed') and private.acts_for_trainer(trainer_id, 'schedule'));

create policy "slots: trainer updates unbooked"
  on public.slots for update
  to authenticated
  using (status <> 'booked' and private.acts_for_trainer(trainer_id, 'schedule'))
  with check (status in ('open', 'closed') and private.acts_for_trainer(trainer_id, 'schedule'));

create policy "slots: trainer deletes unbooked"
  on public.slots for delete
  to authenticated
  using (status <> 'booked' and private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "slots: trainer, or live clients for open future slots, read" on public.slots is
  'The trainer reads all own slots; clients of a live pair read only open slots that start in the future (R81).';
comment on policy "slots: trainer inserts open or closed" on public.slots is
  'The trainer adds open slots or closed markers (time off, R92); booked is set only by booking RPCs.';
comment on policy "slots: trainer updates unbooked" on public.slots is
  'The trainer edits open and closed slots and switches between the two; booked slots change only through RPCs.';
comment on policy "slots: trainer deletes unbooked" on public.slots is
  'The trainer removes open and closed slots, never booked ones.';

grant select, delete on table public.slots to authenticated;
grant insert (trainer_id, starts_at, ends_at, location_id, mode, status, allow_trial) on table public.slots to authenticated;
grant update (starts_at, ends_at, location_id, mode, status, allow_trial) on table public.slots to authenticated;

-- recurrences ---------------------------------------------------------------------------------------------

-- The client of a personal repeat sees it in any pair status (it explains their past sessions). A new repeat
-- may name only a live pair; the composite key already ties the pair to the trainer. The pair cannot be
-- changed later (coaching_id is not in the UPDATE grant). "Stop repeating" (ended_at) also cancels future
-- sessions and notifies clients, so it is an RPC; materialized_until belongs to the job; created_by is stamped.
create policy "recurrences: trainer and the pair client read"
  on public.recurrences for select
  to authenticated
  using (
    private.acts_for_trainer(trainer_id, 'schedule')
    or (coaching_id is not null and private.is_coaching_client(coaching_id))
  );

create policy "recurrences: trainer inserts for a live pair"
  on public.recurrences for insert
  to authenticated
  with check (
    private.acts_for_trainer(trainer_id, 'schedule')
    and (coaching_id is null or private.is_live_coaching(coaching_id))
  );

create policy "recurrences: trainer updates"
  on public.recurrences for update
  to authenticated
  using (private.acts_for_trainer(trainer_id, 'schedule'))
  with check (private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "recurrences: trainer and the pair client read" on public.recurrences is
  'The trainer reads own repeats; the client reads personal repeats of own pairs, in any pair status.';
comment on policy "recurrences: trainer inserts for a live pair" on public.recurrences is
  'The trainer creates group repeats, or personal repeats for a trial or active pair only.';
comment on policy "recurrences: trainer updates" on public.recurrences is
  'The trainer edits the rule of own repeats. No DELETE: a repeat ends through ended_at (RPC).';

-- meeting_url is not granted for SELECT, as on sessions (R25, SCHED-21): the client of a personal repeat
-- reads the repeat in any pair status and with no confirmed booking, and a trainer often reuses one room
-- link. Each session carries its own link through public.session_meeting_url(); the trainer's edit form reads
-- the repeat's link through public.recurrence_meeting_url(). Clients must list columns: select=* fails.
grant select (
  id, trainer_id, coaching_id, rrule, dtstart_local, time_zone, until_date, occurrence_count, duration_min, kind,
  title, capacity, location_id, mode, open_for_booking, materialized_until, ended_at, created_by, created_at,
  updated_at
) on table public.recurrences to authenticated;
grant insert (
  trainer_id, coaching_id, rrule, dtstart_local, time_zone, until_date, occurrence_count, duration_min, kind,
  title, capacity, location_id, mode, meeting_url, open_for_booking
) on table public.recurrences to authenticated;
grant update (
  rrule, dtstart_local, time_zone, until_date, occurrence_count, duration_min, kind, title, capacity,
  location_id, mode, meeting_url, open_for_booking
) on table public.recurrences to authenticated;

-- sessions ------------------------------------------------------------------------------------------------

-- Three readers: the trainer; clients of a live pair for open scheduled group sessions they may book; and
-- anyone with a booking on the session, in any status, so history and exports keep cancelled ones (R80).
-- meeting_url is not granted for SELECT (R25): the column grant is per role, not per row, so it would show
-- the link to every client who sees an open session. public.session_meeting_url() returns it to the trainer
-- and to confirmed or attended participants. Clients must list columns: select=* fails with 42501.
-- Every arm compares a column with an array computed once, so a calendar read without a trainer filter uses
-- the indexes instead of calling a helper for every session of every trainer.
create policy "sessions: trainer, participants and live clients read"
  on public.sessions for select
  to authenticated
  using (
    trainer_id = any ((select private.acting_trainer_ids('{schedule}'))::uuid[])
    or id = any ((select private.own_booked_session_ids())::uuid[])
    or (open_for_booking and status = 'scheduled' and trainer_id = any ((select private.client_trainer_ids(true))::uuid[]))
  );

-- Trial sessions come only from book_trial, and every session starts scheduled. Links to slots, repeats and
-- trial links are set by RPCs and jobs, so they are not in the INSERT grant.
create policy "sessions: trainer inserts scheduled personal or group"
  on public.sessions for insert
  to authenticated
  with check (
    kind in ('personal', 'group') and status = 'scheduled' and private.acts_for_trainer(trainer_id, 'schedule')
  );

-- Moving and cancelling a session touch bookings, the ledger and the outbox, so they are RPCs; directly the
-- trainer edits only the title, the seats (never below the seats taken) and self-booking.
create policy "sessions: trainer updates"
  on public.sessions for update
  to authenticated
  using (private.acts_for_trainer(trainer_id, 'schedule'))
  with check (private.acts_for_trainer(trainer_id, 'schedule'));

comment on policy "sessions: trainer, participants and live clients read" on public.sessions is
  'The trainer; clients with any booking on the session (R80); clients of a live pair for open scheduled sessions.';
comment on policy "sessions: trainer inserts scheduled personal or group" on public.sessions is
  'The trainer creates scheduled personal or group sessions; trial sessions come from book_trial.';
comment on policy "sessions: trainer updates" on public.sessions is
  'The trainer edits title, capacity and open_for_booking. No DELETE: sessions are cancelled through an RPC.';

grant select (
  id, trainer_id, kind, title, starts_at, ends_at, location_id, mode, capacity, open_for_booking, status,
  cancelled_at, cancelled_by, cancel_reason, slot_id, recurrence_id, original_starts_at, is_exception,
  trial_link_id, created_by, manually_adjusted_at, completed_at, created_at, updated_at
) on table public.sessions to authenticated;
grant insert (trainer_id, kind, title, starts_at, ends_at, location_id, mode, meeting_url, capacity, open_for_booking)
  on table public.sessions to authenticated;
grant update (title, capacity, open_for_booking) on table public.sessions to authenticated;

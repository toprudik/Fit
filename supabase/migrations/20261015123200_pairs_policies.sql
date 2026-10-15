-- Pairs policies (data-model §4.2, §4.3, contract §1.4 file 16): coachings, coaching_trainer_meta, data_shares,
-- managed_client_claims, coaching_notes, intakes, contact_requests. Tables: 20261015120300_pairs_tables.sql.
-- Every table starts from no privileges; the grants below are the whole API surface for signed-in users.
-- Pairs, claims and contact requests are created only by RPCs (join, book_trial, create_managed_client,
-- request_contact), so they get no INSERT grant: a direct insert cannot skip the Free client limit (PLAN-1).

revoke all on table
  public.coachings,
  public.coaching_trainer_meta,
  public.data_shares,
  public.managed_client_claims,
  public.coaching_notes,
  public.intakes,
  public.contact_requests
from anon, authenticated;

-- coachings

-- Both sides read the pair in any status: an ended pair keeps its history (sessions, payments, ledger).
-- No admin branch: admins see pairs only as aggregates through admin functions.
create policy "coachings: members read"
  on public.coachings for select
  to authenticated
  using (client_id = (select auth.uid()) or private.is_coaching_trainer(id));

-- Each side edits its own settings; which columns belong to which side is checked by coachings_guard_columns.
-- Ending a pair (status, ended_at, ended_by, end_reason) goes through the end_coaching RPC.
create policy "coachings: members update own settings"
  on public.coachings for update
  to authenticated
  using (trainer_id = (select auth.uid()) or client_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()) or client_id = (select auth.uid()));

grant select on table public.coachings to authenticated;
grant update (self_book_on_debt, debt_limit_sessions, client_reminder_offsets) on table public.coachings to authenticated;

-- Guard for direct API updates (contract §3.5): the UPDATE grant is the union of both sides' columns, so the
-- trigger works out the actor. The trainer sets debt booking; the client sets reminders. Definer RPCs run as
-- postgres and skip it. trainer_id <> client_id is a table check, so the actor is never both.
create function private.coachings_guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if v_uid = old.trainer_id then
    if new.client_reminder_offsets is distinct from old.client_reminder_offsets then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the trainer may change only self_book_on_debt and debt_limit_sessions';
    end if;
  elsif v_uid = old.client_id then
    if new.self_book_on_debt is distinct from old.self_book_on_debt
       or new.debt_limit_sessions is distinct from old.debt_limit_sessions then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the client may change only client_reminder_offsets';
    end if;
  else
    raise exception 'forbidden' using errcode = '42501', detail = 'only a member of the pair may change it';
  end if;
  return new;
end $$;

comment on function private.coachings_guard_columns() is
  'Guard trigger for signed-in callers: the trainer changes only debt booking settings, the client only reminder offsets.';
revoke all on function private.coachings_guard_columns() from public;

create trigger coachings_guard_columns
  before update on public.coachings
  for each row execute function private.coachings_guard_columns();

-- coaching_trainer_meta

-- Trainer-only row (R9): the client never sees how the trainer labels or archives them. The row is created
-- with the pair by a trigger and goes with it, so there is no INSERT or DELETE.
create policy "coaching_trainer_meta: trainer reads"
  on public.coaching_trainer_meta for select
  to authenticated
  using (private.is_coaching_trainer(coaching_id));

create policy "coaching_trainer_meta: trainer updates"
  on public.coaching_trainer_meta for update
  to authenticated
  using (private.is_coaching_trainer(coaching_id))
  with check (private.is_coaching_trainer(coaching_id));

grant select on table public.coaching_trainer_meta to authenticated;
grant update (client_alias, contact, archived_at, intake_seen_at) on table public.coaching_trainer_meta to authenticated;

-- data_shares

-- Both sides see what is shared; only the client changes it (§4.3). A card cannot sign in, so nobody can
-- change a card pair's flags (all true). The flags open data only while the pair is live (private.can_view).
create policy "data_shares: members read"
  on public.data_shares for select
  to authenticated
  using (private.is_coaching_member(coaching_id));

create policy "data_shares: client updates"
  on public.data_shares for update
  to authenticated
  using (private.is_coaching_client(coaching_id))
  with check (private.is_coaching_client(coaching_id));

grant select on table public.data_shares to authenticated;
grant update (nutrition, measurements, photos, steps, intake, workouts, intake_decided_at)
  on table public.data_shares to authenticated;

-- The intake consent step is answered once and stays answered (decisions Q38: an explicit step, not a silent
-- default). The client cannot backdate or postdate the answer: any change of intake stamps the time.
create function private.data_shares_guard_intake()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.intake_decided_at is not null and new.intake_decided_at is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'the intake consent step cannot be reset';
  end if;
  if new.intake is distinct from old.intake or new.intake_decided_at is distinct from old.intake_decided_at then
    new.intake_decided_at := now();
  end if;
  return new;
end $$;

comment on function private.data_shares_guard_intake() is
  'Guard trigger for signed-in callers: intake_decided_at is set to now() on every intake decision and never cleared.';
revoke all on function private.data_shares_guard_intake() from public;

create trigger data_shares_guard_intake
  before update on public.data_shares
  for each row execute function private.data_shares_guard_intake();

-- managed_client_claims

-- The trainer answers "Is this <card>?" through resolve_managed_client_claim. The claimant does not see the
-- claim: it names the trainer's card, which is the trainer's data until the merge.
create policy "managed_client_claims: trainer reads"
  on public.managed_client_claims for select
  to authenticated
  using (trainer_id = (select auth.uid()));

grant select on table public.managed_client_claims to authenticated;

-- coaching_notes

-- Notes are hidden from the client unless the trainer shows them (decisions Q38, §4.3). The owner trainer keeps
-- them after the pair ends (R12), so there is no status filter. No admin branch: notes are personal data and
-- are not a break-glass category.
create policy "coaching_notes: trainer, or client when visible, reads"
  on public.coaching_notes for select
  to authenticated
  using (
    private.is_coaching_trainer(coaching_id, 'notes')
    or (visible_to_client and private.is_coaching_client(coaching_id))
  );

-- author_id must be the caller, so a note can never be attributed to someone else.
create policy "coaching_notes: author trainer inserts"
  on public.coaching_notes for insert
  to authenticated
  with check (author_id = (select auth.uid()) and private.is_coaching_trainer(coaching_id, 'notes'));

create policy "coaching_notes: author trainer updates"
  on public.coaching_notes for update
  to authenticated
  using (author_id = (select auth.uid()) and private.is_coaching_trainer(coaching_id, 'notes'))
  with check (author_id = (select auth.uid()) and private.is_coaching_trainer(coaching_id, 'notes'));

create policy "coaching_notes: author trainer deletes"
  on public.coaching_notes for delete
  to authenticated
  using (author_id = (select auth.uid()) and private.is_coaching_trainer(coaching_id, 'notes'));

grant select, delete on table public.coaching_notes to authenticated;
grant insert (coaching_id, author_id, session_id, body, visible_to_client) on table public.coaching_notes to authenticated;
grant update (body, visible_to_client, session_id) on table public.coaching_notes to authenticated;

-- intakes

-- Health data (decisions Q38): the client; the trainer of a live pair only with share:intake; an admin only
-- through a live break-glass grant that lists intake. All of it is private.can_view. A new answer is a new
-- version, so there is no UPDATE; the client may delete versions.
create policy "intakes: owner, sharing trainer or break-glass admin reads"
  on public.intakes for select
  to authenticated
  using (private.can_view(user_id, 'intake'));

create policy "intakes: owner inserts"
  on public.intakes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "intakes: owner deletes"
  on public.intakes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- parq_flagged is generated and submitted_at defaults to now(), so neither is granted.
grant select, delete on table public.intakes to authenticated;
grant insert (user_id, form_version, answers, parq_answers) on table public.intakes to authenticated;

-- contact_requests

-- Both sides of a request see it; request_contact and the answer RPC write it.
create policy "contact_requests: requester and recipient read"
  on public.contact_requests for select
  to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

grant select on table public.contact_requests to authenticated;

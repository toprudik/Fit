-- Money policies (data-model §4.2, §4.3, contract §1.4 file 18): packages, passes, pass_freezes, payments,
-- payment_links. Tables: 20261015120500_money_tables.sql.
-- Every table starts from no privileges; the grants below are the whole API surface for signed-in users.
-- Passes are created only by the create_pass RPC (it also writes the grant ledger row), so they get no INSERT
-- grant. Accounting rows stay visible to both sides after a pair ends (§4.3): no policy here filters on the
-- pair status. Admins get no branch: money is personal data of the pair.

revoke all on table
  public.packages,
  public.passes,
  public.pass_freezes,
  public.payments,
  public.payment_links,
  public.money_events
from anon, authenticated;

-- packages

-- The trainer sees every own package, archived ones too. Clients of any pair status see the trainer's live
-- packages (R81), is_public = false included: is_public only hides a package from the public showcase.
create policy "packages: trainer and their clients read"
  on public.packages for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or (archived_at is null and trainer_id in (select private.trainer_ids_visible()))
  );

-- trainer_id must be a trainer_profiles row (foreign key), so only trainers can add packages.
create policy "packages: trainer inserts"
  on public.packages for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

-- Archiving is an update of archived_at; there is no DELETE, because passes keep package_id for history.
create policy "packages: trainer updates"
  on public.packages for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

grant select on table public.packages to authenticated;
grant insert (trainer_id, title, sessions_count, price_minor, currency, validity_days, applies_to, is_public,
  sort_order) on table public.packages to authenticated;
grant update (title, sessions_count, price_minor, currency, validity_days, applies_to, is_public, sort_order,
  archived_at) on table public.packages to authenticated;

-- passes

-- The client sees own passes in every pair; a trainer sees only passes of own pairs (PAIR-1, MONEY-12).
create policy "passes: client and trainer read"
  on public.passes for select
  to authenticated
  using (client_id = (select auth.uid()) or coaching_id = any ((select private.trainer_coaching_ids('{passes}'))::uuid[]));

-- The trainer edits title and note of an active pass. A cancelled pass is history. Cancelling goes through the
-- cancel_pass RPC, which also writes the refund row. The expiry is not granted: extending a pass (PRD 2.8-8)
-- goes through an RPC that takes a reason, because money_events_record refuses an expiry change without one.
create policy "passes: trainer updates active"
  on public.passes for update
  to authenticated
  using (private.is_coaching_trainer(coaching_id, 'passes') and status = 'active')
  with check (private.is_coaching_trainer(coaching_id, 'passes'));

-- R27: the passes_delete_guard trigger refuses the delete once anything but the grant row or any payment
-- points at the pass (pass_in_use); the grant row then leaves through the ledger foreign key cascade.
create policy "passes: trainer deletes"
  on public.passes for delete
  to authenticated
  using (private.is_coaching_trainer(coaching_id, 'passes'));

grant select, delete on table public.passes to authenticated;
grant update (title, note) on table public.passes to authenticated;

-- pass_freezes

-- Whoever sees the pass sees its freezes (the subquery runs under the passes policy).
create policy "pass_freezes: pass readers read"
  on public.pass_freezes for select
  to authenticated
  using (exists (select 1 from public.passes p where p.id = pass_freezes.pass_id));

-- Only the trainer freezes (PRD 2.8-14), and only an active pass.
create policy "pass_freezes: trainer inserts"
  on public.pass_freezes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.passes p
      where p.id = pass_freezes.pass_id and p.status = 'active'
        and private.is_coaching_trainer(p.coaching_id, 'passes'))
  );

-- pass_freezes_guard_started below keeps the days of a started freeze that are already past.
create policy "pass_freezes: trainer updates"
  on public.pass_freezes for update
  to authenticated
  using (
    exists (
      select 1 from public.passes p
      where p.id = pass_freezes.pass_id and p.status = 'active'
        and private.is_coaching_trainer(p.coaching_id, 'passes'))
  )
  with check (
    exists (
      select 1 from public.passes p
      where p.id = pass_freezes.pass_id and p.status = 'active'
        and private.is_coaching_trainer(p.coaching_id, 'passes'))
  );

-- Only a freeze that has not started yet can be removed: a started one already moved the expiry and kept the
-- pass out of bookings, so it is ended early instead (update of the upper bound). "Today" is the local date in
-- the trainer time zone; the trainer reads own profile row.
create policy "pass_freezes: trainer deletes future"
  on public.pass_freezes for delete
  to authenticated
  using (
    exists (
      select 1
      from public.passes p
      join public.profiles pr on pr.id = p.trainer_id
      where p.id = pass_freezes.pass_id and p.status = 'active'
        and private.is_coaching_trainer(p.coaching_id, 'passes')
        and lower(pass_freezes.period) > (pg_catalog.now() at time zone pr.time_zone)::date)
  );

grant select, delete on table public.pass_freezes to authenticated;
grant insert (pass_id, period, reason) on table public.pass_freezes to authenticated;
grant update (period, reason) on table public.pass_freezes to authenticated;

-- A started freeze (first day <= today in the trainer zone) keeps its first day; ending it early moves only the
-- upper bound (contract §1.4). The upper bound also cannot drop below today (or below its old value when the
-- freeze is already over), so frozen days in the past are never undone: that would rewrite which days the pass
-- could be used, the same reason a started freeze cannot be deleted. Signed-in callers only; RPCs are trusted.
create function private.pass_freezes_guard_started()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select (pg_catalog.now() at time zone pr.time_zone)::date into v_today
  from public.passes p
  join public.profiles pr on pr.id = p.trainer_id
  where p.id = old.pass_id;
  if v_today is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'the pass of this freeze is not visible';
  end if;
  if lower(old.period) <= v_today
     and (lower(new.period) is distinct from lower(old.period)
          or upper(new.period) < least(upper(old.period), v_today)) then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'a started freeze keeps its first day and its past days; only its end may move';
  end if;
  return new;
end $$;

comment on function private.pass_freezes_guard_started() is
  'Guard trigger for signed-in callers: a started freeze keeps its first day and the frozen days already past.';
revoke all on function private.pass_freezes_guard_started() from public;

create trigger pass_freezes_guard_started
  before update on public.pass_freezes
  for each row execute function private.pass_freezes_guard_started();

-- payments

-- Both sides of the pair see its payments in any pair status; another trainer of the client sees none.
create policy "payments: client and trainer read"
  on public.payments for select
  to authenticated
  using (client_id = (select auth.uid()) or coaching_id = any ((select private.trainer_coaching_ids('{payments}'))::uuid[]));

-- The trainer enters a payment as confirmed. The client only reports an incoming payment ("I paid"); refunds
-- are the trainer's. payments_fill_pair fills trainer_id and client_id from the pair before this check runs,
-- and the pair foreign key refuses ids that do not belong to the pair.
create policy "payments: trainer or reporting client inserts"
  on public.payments for insert
  to authenticated
  with check (
    (client_id = (select auth.uid()) and status = 'reported' and direction = 'in')
    or (private.is_coaching_trainer(coaching_id, 'payments') and status = 'confirmed')
  );

-- The trainer confirms or voids any payment of the pair; the client edits or withdraws (voids) own report
-- until the trainer confirms it. payments_guard_columns splits the columns between the two; the
-- payments_lifecycle trigger allows only reported -> confirmed | voided and confirmed -> voided. No DELETE: a
-- mistake is voided and entered again (R26).
create policy "payments: trainer or reporting client updates"
  on public.payments for update
  to authenticated
  using (
    (client_id = (select auth.uid()) and status = 'reported')
    or private.is_coaching_trainer(coaching_id, 'payments')
  )
  with check (
    (client_id = (select auth.uid()) and status in ('reported', 'voided'))
    or private.is_coaching_trainer(coaching_id, 'payments')
  );

grant select on table public.payments to authenticated;
grant insert (coaching_id, client_id, trainer_id, pass_id, direction, amount_minor, currency, method, paid_at, status,
  note) on table public.payments to authenticated;
grant update (amount_minor, currency, method, paid_at, note, pass_id, status, void_reason)
  on table public.payments to authenticated;

-- Guard for direct API updates (contract §3.5): the UPDATE grant is the union of both sides' columns.
-- The trainer changes only status and void_reason: the amounts are what the client reported or what the
-- trainer entered, and a wrong one is voided and entered again. The trainer gives a void reason only in the
-- update that voids. The client changes the details of own report and may withdraw it (status voided, with a
-- reason, which the voided check requires). A voided payment is history: nobody rewrites its void details.
-- The trainer is checked first; trainer_id <> client_id on the pair, so the actor is never both. Definer RPCs
-- run as postgres.
--
-- A client may still change the amount of a reported payment while the trainer looks at it. The confirm must
-- therefore be conditional on what the trainer saw: the app (or the later confirm RPC) sends
-- "where id = ... and updated_at = <seen>" and shows "the client changed the report" when 0 rows come back.
create function private.payments_guard_columns()
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
  if old.status = 'voided'
     and (new.void_reason is distinct from old.void_reason or new.voided_at is distinct from old.voided_at
          or new.voided_by is distinct from old.voided_by) then
    raise exception 'forbidden' using errcode = '42501', detail = 'a voided payment keeps its void details';
  end if;
  if v_uid = old.trainer_id then
    if new.amount_minor is distinct from old.amount_minor
       or new.currency is distinct from old.currency
       or new.method is distinct from old.method
       or new.paid_at is distinct from old.paid_at
       or new.note is distinct from old.note
       or new.pass_id is distinct from old.pass_id then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the trainer may change only status and void_reason of a payment';
    end if;
    if new.void_reason is distinct from old.void_reason
       and not (old.status <> 'voided' and new.status = 'voided') then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the trainer may give a void reason only when voiding';
    end if;
  elsif v_uid = old.client_id then
    if new.status is distinct from old.status and new.status <> 'voided' then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the client may only withdraw (void) own report';
    end if;
    if new.void_reason is distinct from old.void_reason and new.status <> 'voided' then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'the client may give a void reason only when withdrawing the report';
    end if;
  else
    raise exception 'forbidden' using errcode = '42501', detail = 'only a member of the pair may change a payment';
  end if;
  return new;
end $$;

comment on function private.payments_guard_columns() is
  'Guard trigger for signed-in callers: the trainer changes only status and void_reason (the reason only when '
  'voiding), the client only own report; a voided payment keeps its void details.';
revoke all on function private.payments_guard_columns() from public;

create trigger payments_guard_columns
  before update on public.payments
  for each row execute function private.payments_guard_columns();

-- payment_links

-- Clients of the trainer in any pair status see where to pay (R81, MONEY-11), but only live links: an
-- archived link is history for the trainer, not a place to send money (as with packages).
create policy "payment_links: trainer and their clients read"
  on public.payment_links for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or (archived_at is null and trainer_id in (select private.trainer_ids_visible()))
  );

create policy "payment_links: trainer inserts"
  on public.payment_links for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

-- Archiving is an update of archived_at; there is no DELETE.
create policy "payment_links: trainer updates"
  on public.payment_links for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

grant select on table public.payment_links to authenticated;
grant insert (trainer_id, title, url, kind, sort_order) on table public.payment_links to authenticated;
grant update (title, url, kind, sort_order, archived_at) on table public.payment_links to authenticated;

-- money_events

-- The history of a pass, freeze or payment is read by whoever reads the pair's money: the client and the pair
-- trainer, in any pair status (wave 3 delegates with the passes or payments scope). Written only by triggers.
create policy "money_events: client and pair trainer read"
  on public.money_events for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (payment_id is null and coaching_id = any ((select private.trainer_coaching_ids('{passes}'))::uuid[]))
    or (payment_id is not null and coaching_id = any ((select private.trainer_coaching_ids('{payments}'))::uuid[]))
  );

comment on policy "money_events: client and pair trainer read" on public.money_events is
  'The client and the pair trainer read the history of the pair''s passes, freezes and payments; nobody writes it.';

grant select on table public.money_events to authenticated;

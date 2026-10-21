-- One «Я оплатил» at a time (QA B1): while the client's report on a pass waits for the trainer, a second report on
-- the same pass is refused, so the trainer does not get two messages and twice the sum to confirm. Moving a report to
-- a pass that already has one is refused the same way. The client can withdraw the waiting report and send a new one.
-- A pass-level advisory lock keeps two concurrent reports from both getting through. Rows the trainer adds are
-- confirmed, so they never meet this check.

create function private.payments_one_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'reported' or new.direction <> 'in' or new.pass_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.pass_id is not distinct from old.pass_id and old.status = 'reported' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment_report:' || new.pass_id::text, 0));
  if exists (
    select 1 from public.payments p
    where p.pass_id = new.pass_id and p.status = 'reported' and p.direction = 'in' and p.id <> new.id
  ) then
    raise exception 'payment_already_reported' using errcode = 'P0001',
      detail = 'a report on this pass is already waiting for the trainer';
  end if;
  return new;
end $$;

comment on function private.payments_one_report() is
  'Refuses a second waiting «Я оплатил» report on the same pass (QA B1); the client withdraws the first one to send another.';
revoke all on function private.payments_one_report() from public;

create trigger payments_one_report
  before insert or update of pass_id, status on public.payments
  for each row execute function private.payments_one_report();

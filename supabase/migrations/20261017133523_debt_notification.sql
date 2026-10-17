-- "Возник долг" (PRD wave-1 §2.8 MONEY-7, К11): an attended session charged without a pass goes into debt, and
-- the client hears about it with the pair's total debt and a way to pay. A no-show or a late cancellation already
-- says so in its own message (К8), so it gets no second one. A trigger on the charge row covers every path that
-- charges a visit: the session end (complete_sessions), a QR or location check-in, and the trainer's marks.

create function private.notify_debt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.client_id and p.telegram_id is not null) then
    return null;
  end if;
  perform private.enqueue_notification(
    'debt', 'debt:' || new.id,
    pg_catalog.jsonb_build_object(
      'coaching_id', new.coaching_id,
      'charge_id', new.id,
      'starts_at', new.occurred_at,
      'amount_minor', new.amount_minor,
      'currency', new.currency,
      'debt_sessions', (select cb.debt_sessions from public.coaching_balances cb where cb.coaching_id = new.coaching_id),
      'debt_amounts', (select cb.debt_amounts from public.coaching_balances cb where cb.coaching_id = new.coaching_id),
      'username', (select p.username from public.profiles p where p.id = new.trainer_id),
      'payment_url', (select l.url from public.payment_links l
                      where l.trainer_id = new.trainer_id and l.archived_at is null
                      order by l.sort_order, l.created_at limit 1))
      || private.person_name(new.trainer_id),
    new.client_id,
    p_booking_id => new.booking_id);
  return null;
end $$;

comment on function private.notify_debt() is
  'Trigger: queues К11 (debt) to the client when an attended session is charged without a pass.';
revoke all on function private.notify_debt() from public;

create trigger ledger_entries_notify_debt
  after insert on public.ledger_entries
  for each row
  when (new.entry_type = 'charge' and new.pass_id is null and new.charge_reason = 'attended')
  execute function private.notify_debt();

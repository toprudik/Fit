-- What a late cancellation would take (screens.md §4.3, PRD 2.6.5-3): the confirm sheet names the pass and the
-- sessions left after the charge, or the debt at the drop-in price, before the client agrees.

-- Client: whether cancelling this booking now is late and, if so, what the charge would be. It runs the real
-- cancellation and rolls it back, so the answer follows post_charge exactly (reserved pass, the choice rule, a
-- paid or free trial, debt). charged = false for a free trial. Raises booking_not_found.
create function public.cancel_preview(p_booking_id uuid)
returns table (late boolean, charged boolean, pass_title text, sessions_left integer, debt_minor bigint, currency text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_late boolean;
  v_charged boolean := false;
  v_title text;
  v_left integer;
  v_debt bigint;
  v_currency text;
begin
  v_booking := private.own_client_booking(p_booking_id);
  v_late := pg_catalog.now() > private.cancel_deadline(v_booking.id);
  if v_late then
    begin
      perform public.cancel_my_booking(v_booking.id, null, true);
      select true, p.title, pb.available, case when e.pass_id is null then e.amount_minor end, e.currency
      into v_charged, v_title, v_left, v_debt, v_currency
      from public.ledger_entries e
      left join public.passes p on p.id = e.pass_id
      left join public.pass_balances pb on pb.pass_id = e.pass_id
      where e.booking_id = v_booking.id and e.entry_type = 'charge';
      v_charged := coalesce(v_charged, false);
      raise exception 'preview_rollback';
    exception when raise_exception then
      if sqlerrm <> 'preview_rollback' then
        raise;
      end if;
    end;
  end if;
  return query select v_late, v_charged, v_title, v_left, v_debt, v_currency;
end $$;

comment on function public.cancel_preview(uuid) is
  'Client: whether cancelling a confirmed booking now is late, and the pass and sessions left (or the debt) the '
  'late cancellation would charge. Changes nothing.';
revoke all on function public.cancel_preview(uuid) from public, anon;
grant execute on function public.cancel_preview(uuid) to authenticated;

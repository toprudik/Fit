-- "Исправить оплату" (PRD wave-1 §2.8 rule 13): a confirmed payment with a wrong amount, method or day is voided
-- with a reason and entered again, as R26 has it, but in one step, so the pass never shows the payment missing
-- or counted twice. Security invoker: the trainer's own policies and guards apply to both writes, and
-- money_events records both, so the history shows what was corrected.

create function public.correct_payment(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_paid_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.payments;
  v_new uuid;
begin
  select * into v_old from public.payments p
  -- RLS shows the pair's payments to its trainer, a delegate with the payments scope and the client; the
  -- client's own insert policy would refuse a confirmed payment anyway, this only gives the same answer.
  where p.id = p_payment_id and p.status = 'confirmed' and p.client_id is distinct from (select auth.uid())
  for update;
  if v_old.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002',
      detail = 'only a confirmed payment of the trainer''s pair can be corrected';
  end if;

  insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status, note)
  values (v_old.coaching_id, v_old.pass_id, v_old.direction, p_amount_minor, v_old.currency, p_method, p_paid_at,
          'confirmed', v_old.note)
  returning id into v_new;

  update public.payments set status = 'voided', void_reason = p_reason where id = v_old.id;
  return v_new;
end $$;

comment on function public.correct_payment(uuid, bigint, public.payment_method, timestamptz, text) is
  'The trainer corrects a confirmed payment: voids it with the reason and enters the new amount, method and day '
  'in its place, in one transaction. Returns the new payment.';
revoke all on function public.correct_payment(uuid, bigint, public.payment_method, timestamptz, text) from public, anon;
grant execute on function public.correct_payment(uuid, bigint, public.payment_method, timestamptz, text) to authenticated;

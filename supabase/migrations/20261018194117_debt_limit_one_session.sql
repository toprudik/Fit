-- Debt limit for self-booking (decision of 18.10.2026, docs/decisions.md Q22): a client the trainer allowed to book
-- in debt may hold one unpaid session at a time by default. The limit now also counts future booked sessions with
-- no pass behind them; before, it counted only sessions already charged, so a client with no debt could confirm any
-- number of future sessions. Bookings the trainer makes or confirms are not limited (Q20).

alter table public.coachings alter column debt_limit_sessions set default 1;
update public.coachings set debt_limit_sessions = 1 where debt_limit_sessions is null;
comment on column public.coachings.debt_limit_sessions is
  'How many unpaid sessions the client may hold when booking on their own with self_book_on_debt: charged debt plus '
  'booked sessions no pass covers. Default 1; null means no limit. The trainer''s own bookings are not limited.';

-- booking_auto_confirm (20261018135317_qa_money_booking_fixes.sql).
create or replace function private.booking_auto_confirm(p_coaching uuid, p_kind public.session_kind, p_starts_at timestamptz)
returns table (confirmed boolean, pass_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair public.coachings;
  v_day date;
  v_pass uuid;
  v_debt integer;
begin
  -- One decision per pair at a time: a concurrent booking of the same pair waits here until this transaction
  -- ends, and its queries below then see the session this one reserved.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('booking_auto_confirm:' || p_coaching::text, 0));
  select c.* into v_pair from public.coachings c where c.id = p_coaching;
  if v_pair.id is null then
    return query select false, null::uuid;
    return;
  end if;
  v_day := (p_starts_at at time zone private.trainer_zone(v_pair.trainer_id))::date;

  select pb.pass_id into v_pass
  from public.pass_balances pb
  join public.passes p on p.id = pb.pass_id
  where pb.coaching_id = p_coaching
    and p.status = 'active'
    and pb.available >= 1
    and p.applies_to in ('any', case when p_kind = 'group' then 'group' else 'personal' end::public.package_applies_to)
    and p.starts_on <= v_day
    and (pb.effective_expires_at is null or pb.effective_expires_at > p_starts_at)
    and not exists (select 1 from public.pass_freezes f where f.pass_id = p.id and f.period @> v_day)
  order by pb.effective_expires_at nulls last, p.starts_on, p.created_at
  limit 1;
  if v_pass is not null then
    return query select true, v_pass;
    return;
  end if;

  if v_pair.self_book_on_debt then
    -- The limit counts sessions already charged to debt plus booked ones that no pass covers and that are not
    -- charged yet: otherwise a client with no debt could confirm any number of future sessions.
    select coalesce((select cb.debt_sessions from public.coaching_balances cb where cb.coaching_id = p_coaching), 0)
         + (select count(*)::integer
            from public.bookings b
            where b.coaching_id = p_coaching
              and b.status in ('confirmed', 'attended')
              and b.reserved_pass_id is null
              and b.source <> 'trial'
              and not exists (select 1 from public.ledger_entries e where e.booking_id = b.id and e.entry_type = 'charge'))
      into v_debt;
    if v_debt < coalesce(v_pair.debt_limit_sessions, 2147483647) then
      return query select true, null::uuid;
      return;
    end if;
  end if;
  return query select false, null::uuid;
end $$;

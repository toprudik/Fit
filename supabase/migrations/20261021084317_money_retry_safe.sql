-- Money actions that a double tap or a retry after a lost answer must not repeat (docs/qa/production-readiness.md §3).
-- create_pass takes a request key from the form: the same key in the same pair returns the pass already sold, with
-- no second grant or payment; the same key with other terms raises request_reused. record_past_session returns the
-- personal session (not cancelled) the pair already has at that start instead of a second session and a second
-- charge. settle_debt rechecks each charge after locking it, so a sale that meets a waiver of the same debt in flight
-- skips that charge instead of failing with ledger_invalid.

alter table public.passes add column request_id uuid;
comment on column public.passes.request_id is
  'The key of the "Оформить абонемент" form that sold the pass; a repeated call with it returns this pass.';
create unique index passes_request_id_uniq on public.passes (coaching_id, request_id) where request_id is not null;

-- create_pass (body from 20261016214300_passes_payments.sql) --------------------------------------------------

drop function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz);
create function public.create_pass(
  p_coaching_id    uuid,
  p_package_id     uuid default null,
  p_title          text default null,
  p_sessions       integer default null,
  p_price_minor    bigint default null,
  p_currency       text default null,
  p_validity_days  integer default null,
  p_applies_to     public.package_applies_to default null,
  p_starts_on      date default null,
  p_note           text default null,
  p_payment_minor  bigint default null,
  p_payment_method public.payment_method default null,
  p_paid_at        timestamptz default null,
  p_request_id     uuid default null
)
returns table (pass_id uuid, settled integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_pair     public.coachings;
  v_package  public.packages;
  v_tz       text;
  v_title    text;
  v_sessions integer;
  v_price    bigint;
  v_currency public.currency_code;
  v_days     integer;
  v_applies  public.package_applies_to;
  v_starts   date;
  v_note     text := nullif(pg_catalog.btrim(p_note), '');
  v_pass     uuid;
  v_settled  integer;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for share;
  if not found or not private.is_coaching_trainer(v_pair.id, 'passes') then
    raise exception 'coaching_not_found' using errcode = 'P0001';
  end if;
  if v_pair.status = 'ended' then
    raise exception 'coaching_ended' using errcode = 'P0001';
  end if;
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_pair.trainer_id;

  if p_package_id is not null then
    select pk.* into v_package
    from public.packages pk
    where pk.id = p_package_id and pk.trainer_id = v_pair.trainer_id and pk.archived_at is null;
    if not found then
      raise exception 'package_not_found' using errcode = 'P0001';
    end if;
    v_title := v_package.title;
    v_sessions := v_package.sessions_count;
    v_price := v_package.price_minor;
    v_currency := v_package.currency;
    v_days := v_package.validity_days;
    v_applies := v_package.applies_to;
  else
    v_title := nullif(pg_catalog.btrim(p_title), '');
    v_sessions := p_sessions;
    v_price := p_price_minor;
    v_days := p_validity_days;
    v_applies := coalesce(p_applies_to, 'any');
    if v_title is null or pg_catalog.char_length(v_title) > 120
       or v_sessions is null or v_sessions not between 1 and 200
       or v_price is null or v_price < 0
       or p_currency is null
       or (v_days is not null and v_days not between 1 and 730) then
      raise exception 'pass_invalid' using errcode = '22023';
    end if;
    v_currency := p_currency::public.currency_code;
  end if;

  if pg_catalog.char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if p_payment_minor is not null and (p_payment_minor <= 0 or p_payment_method is null) then
    raise exception 'payment_invalid' using errcode = '22023';
  end if;

  v_starts := coalesce(p_starts_on, (pg_catalog.now() at time zone v_tz)::date);
  insert into public.passes (coaching_id, package_id, title, sessions_total, price_minor, currency, applies_to,
                             is_drop_in, starts_on, expires_at, note, request_id)
  values (v_pair.id, v_package.id, v_title, v_sessions, v_price, v_currency, v_applies, v_sessions = 1, v_starts,
          case when v_days is not null then private.pass_end_instant(v_starts + v_days - 1, v_tz) end, v_note,
          p_request_id)
  on conflict (coaching_id, request_id) where request_id is not null do nothing
  returning id into v_pass;
  -- The key sold a pass already (a double tap, or a retry after a lost answer): answer with that pass. The same
  -- key with other terms is a mistake, not a retry.
  if v_pass is null then
    select p.id into v_pass
    from public.passes p
    where p.coaching_id = v_pair.id and p.request_id = p_request_id
      and p.package_id is not distinct from v_package.id and p.title = v_title and p.sessions_total = v_sessions
      and p.price_minor = v_price and p.currency = v_currency and p.applies_to = v_applies and p.starts_on = v_starts
      and p.note is not distinct from v_note
      and case when p_payment_minor is null
            then not exists (select 1 from public.payments y where y.pass_id = p.id)
            else exists (select 1 from public.payments y where y.pass_id = p.id and y.amount_minor = p_payment_minor
                         and y.method = p_payment_method)
          end;
    if v_pass is null then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
    return query select v_pass, 0;
    return;
  end if;

  insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at)
  values (v_pair.id, 'grant', v_pass, v_sessions, 0, pg_catalog.now());

  v_settled := private.settle_debt(v_pass);

  if p_payment_minor is not null then
    insert into public.payments (coaching_id, pass_id, direction, amount_minor, currency, method, paid_at, status)
    values (v_pair.id, v_pass, 'in', p_payment_minor, v_currency, p_payment_method,
            coalesce(p_paid_at, pg_catalog.now()), 'confirmed');
  end if;

  return query select v_pass, v_settled;
end $$;

comment on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz, uuid) is
  'The trainer sells a pass to the client of a live pair, from a package or custom: the pass, its grant, the '
  'settlement of the debt it fits and an optional confirmed payment, in one transaction. Returns the pass id '
  'and the settled debt sessions; a repeated request key returns the pass sold with it and 0. Raises '
  'coaching_not_found, coaching_ended, package_not_found, pass_invalid, note_too_long, payment_invalid or '
  'request_reused (the key sold a pass on other terms).';
revoke all on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz, uuid) from public, anon;
grant execute on function public.create_pass(uuid, uuid, text, integer, bigint, text, integer, public.package_applies_to,
  date, text, bigint, public.payment_method, timestamptz, uuid) to authenticated;

-- settle_debt (body from 20261016214300_passes_payments.sql) --------------------------------------------------

create or replace function private.settle_debt(p_pass_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass    public.passes;
  v_left    integer;
  v_charge  record;
  v_settled integer := 0;
begin
  select * into v_pass from public.passes p where p.id = p_pass_id for no key update;
  if not found or v_pass.status <> 'active' then
    return 0;
  end if;
  select coalesce(sum(e.sessions_delta), 0)::integer into v_left from public.ledger_entries e where e.pass_id = v_pass.id;

  for v_charge in
    select ch.id, s.kind
    from public.ledger_entries ch
    left join public.bookings b on b.id = ch.booking_id
    left join public.sessions s on s.id = b.session_id
    where ch.coaching_id = v_pass.coaching_id and ch.entry_type = 'charge' and ch.pass_id is null
      and not exists (
        select 1 from public.ledger_entries w where w.related_entry_id = ch.id and w.entry_type in ('waiver', 'settlement'))
    order by ch.occurred_at, ch.created_at, ch.id
    for update of ch
  loop
    exit when v_left <= 0;
    continue when not private.pass_fits_kind(v_pass.applies_to, v_charge.kind);
    -- The lock may have waited for a waiver of this charge; a new statement sees it once committed.
    continue when exists (
      select 1 from public.ledger_entries w where w.related_entry_id = v_charge.id and w.entry_type in ('waiver', 'settlement'));
    insert into public.ledger_entries (coaching_id, entry_type, pass_id, related_entry_id, sessions_delta,
                                       amount_minor, currency, occurred_at)
    values (v_pass.coaching_id, 'settlement', v_pass.id, v_charge.id, -1,
            private.pass_next_share(v_pass.id), v_pass.currency, pg_catalog.now());
    v_left := v_left - 1;
    v_settled := v_settled + 1;
  end loop;
  return v_settled;
end $$;

-- record_past_session (body from 20261017113217_delegate_schedule.sql) ----------------------------------------

create or replace function public.record_past_session(
  p_coaching_id uuid,
  p_starts_at timestamptz,
  p_duration_min smallint,
  p_mode public.session_mode,
  p_location_id uuid default null,
  p_status public.booking_status default 'attended',
  p_title text default null)
returns table (session_id uuid, booking_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trainer uuid;
  v_pair public.coachings;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_ends_at timestamptz;
  v_session uuid;
  v_booking uuid;
  v_charge uuid;
begin
  if v_actor is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_actor) then
    raise exception 'not_a_trainer' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id for no key update;
  if v_pair.id is null or v_pair.status not in ('trial', 'active')
     or not (v_pair.trainer_id = v_actor or private.delegate_covers(v_pair.id, 'schedule')) then
    raise exception 'not_your_client' using errcode = '42501';
  end if;
  v_trainer := v_pair.trainer_id;
  if p_duration_min is null or p_duration_min not between 15 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  v_ends_at := p_starts_at + pg_catalog.make_interval(mins => p_duration_min);
  if p_starts_at is null or v_ends_at > pg_catalog.now() then
    raise exception 'not_past' using errcode = '22023';
  end if;
  if p_starts_at < pg_catalog.now() - interval '366 days' then
    raise exception 'too_old' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  perform private.check_session_place(v_trainer, p_mode, p_location_id, null);
  -- A repeated call (a double tap, a retry after a lost answer) gets the session already recorded at that start.
  select s.id, b.id into v_session, v_booking
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.coaching_id = v_pair.id and s.kind = 'personal' and s.status <> 'cancelled' and s.starts_at = p_starts_at
    and b.status in ('requested', 'confirmed', 'attended', 'no_show')
  order by b.created_at
  limit 1;
  if v_session is not null then
    return query select v_session, v_booking;
    return;
  end if;

  insert into public.sessions (trainer_id, kind, title, starts_at, ends_at, location_id, mode, capacity, status,
                               completed_at, created_by)
  values (v_trainer, 'personal', v_title, p_starts_at, v_ends_at, p_location_id, p_mode, 1, 'completed',
          pg_catalog.now(), v_actor)
  returning id into v_session;
  insert into public.bookings (session_id, coaching_id, client_id, trainer_id, status, source, confirmed_at, decided_by,
                               attendance_marked_at, attendance_marked_by)
  values (v_session, v_pair.id, v_pair.client_id, v_trainer, 'attended', 'trainer', pg_catalog.now(), v_actor,
          pg_catalog.now(), v_actor)
  returning id into v_booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
  values (v_booking, null, 'attended', v_actor, 'trainer', '{"recorded_after": true}');
  if p_status = 'no_show' then
    update public.bookings set status = 'no_show' where id = v_booking;
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, payload)
    values (v_booking, 'attended', 'no_show', v_actor, 'trainer', '{"recorded_after": true}');
  end if;
  v_charge := private.post_charge(v_booking, p_status::text::public.charge_reason);
  if p_status = 'no_show' then
    perform private.notify_charge(v_charge, 'charge_posted');
  end if;
  return query select v_session, v_booking;
end $$;

comment on function public.record_past_session(uuid, timestamptz, smallint, public.session_mode, uuid, public.booking_status, text) is
  'Trainer: records a personal session that already ended (attended or no_show), charged by the usual rules. '
  'Returns the session and the booking; when the pair already has a personal session at that start, returns it '
  'and records nothing.';

-- Bookings and ledger policies (data-model §4.2, §3, contract §1.4 file 19): bookings, booking_events,
-- ledger_entries. Tables: 20261015120600_bookings_ledger_tables.sql.
-- All three are written only by definer RPCs and jobs (book, confirm, cancel, mark attendance, charge, waive),
-- which run as the table owner. Signed-in users get SELECT and nothing else, so there are no INSERT, UPDATE
-- or DELETE policies: a missing grant answers 42501 before RLS is even asked. The status machine, seat
-- capacity, append-only rules and ledger validation are invariant triggers that also bind those RPCs.
-- Both sides keep reading these rows after the pair ends: they are accounting, not personal data (§4.3).
-- No admin branch: admins see bookings and money only as aggregates through admin functions.

revoke all on table public.bookings, public.booking_events, public.ledger_entries from anon, authenticated;
revoke all on sequence public.booking_events_id_seq from anon, authenticated;

-- bookings ------------------------------------------------------------------------------------------------

-- The client reads own bookings only, so in a group session nobody learns who else is booked (seat counts come
-- from public.session_occupancy()). The owner trainer reads every booking of own pairs; wave 3 adds delegates
-- with the schedule or attendance scope through the same helper.
create policy "bookings: client and pair trainer read"
  on public.bookings for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or private.is_coaching_trainer(coaching_id, 'schedule')
    or private.is_coaching_trainer(coaching_id, 'attendance')
  );

comment on policy "bookings: client and pair trainer read" on public.bookings is
  'The client reads own bookings and the pair trainer reads the pair''s, in any pair status. Writes go through RPCs.';

grant select on table public.bookings to authenticated;

-- booking_events ------------------------------------------------------------------------------------------

-- An event is visible exactly when its booking is: the subquery runs under the bookings policy.
create policy "booking_events: readers of the booking read"
  on public.booking_events for select
  to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

comment on policy "booking_events: readers of the booking read" on public.booking_events is
  'Whoever reads the booking reads its history. Append-only; written by RPCs and jobs.';

grant select on table public.booking_events to authenticated;

-- ledger_entries ------------------------------------------------------------------------------------------

-- The client reads the ledger of own pairs (balance, debt, history). The owner trainer reads the pair's;
-- wave 3 adds delegates with the passes or attendance scope.
create policy "ledger_entries: client and pair trainer read"
  on public.ledger_entries for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or private.is_coaching_trainer(coaching_id, 'passes')
    or private.is_coaching_trainer(coaching_id, 'attendance')
  );

comment on policy "ledger_entries: client and pair trainer read" on public.ledger_entries is
  'The client and the pair trainer read the pair''s ledger, in any pair status. Rows come only from RPCs and triggers.';

grant select on table public.ledger_entries to authenticated;

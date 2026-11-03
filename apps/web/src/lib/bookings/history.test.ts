import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadBookingHistory } = await import("./history");

const OLD = "00000000-0000-4000-8000-000000000001";
const NEW = "00000000-0000-4000-8000-000000000002";

type Row = Record<string, unknown>;

/** A Supabase client that answers bookings by rescheduled_to_id and booking_events by booking_id. */
function owner(bookings: Row[], events: Row[]) {
  const from = (table: string) => ({
    select: () => ({
      in: (column: string, values: string[]) => {
        if (table === "bookings") return Promise.resolve({ data: bookings.filter((b) => values.includes(b[column] as string)), error: null });
        if (table === "profiles") return Promise.resolve({ data: [], error: null });
        return { order: () => Promise.resolve({ data: events.filter((e) => values.includes(e[column] as string)), error: null }) };
      },
    }),
  });
  return { supabase: { from }, timeZone: "Europe/Moscow" } as unknown as Parameters<typeof loadBookingHistory>[0];
}

const event = (id: number, booking: string, from: string | null, to: string): Row => ({
  id,
  booking_id: booking,
  from_status: from,
  to_status: to,
  actor_id: null,
  actor_role: "client",
  reason: null,
  created_at: "2026-11-03T08:00:00Z",
  payload: {},
});

describe("loadBookingHistory", () => {
  it("starts a moved booking with the earlier one and says «Запись создана» once", async () => {
    const history = await loadBookingHistory(
      owner([{ id: OLD, rescheduled_to_id: NEW }], [event(1, OLD, null, "confirmed"), event(2, OLD, "confirmed", "rescheduled"), event(3, NEW, null, "confirmed")]),
      [NEW],
    );
    expect(history.map((item) => [item.bookingId, item.change])).toEqual([
      [OLD, "booked"],
      [OLD, "rescheduled"],
    ]);
  });

  it("keeps the request of a move that waits for the trainer", async () => {
    const history = await loadBookingHistory(
      owner([{ id: OLD, rescheduled_to_id: NEW }], [event(1, OLD, null, "confirmed"), event(2, OLD, "confirmed", "rescheduled"), event(3, NEW, null, "requested")]),
      [NEW],
    );
    expect(history.map((item) => item.change)).toEqual(["booked", "rescheduled", "requested"]);
  });

  it("keeps «Запись создана» of a booking nobody moved", async () => {
    const history = await loadBookingHistory(owner([], [event(1, OLD, null, "confirmed")]), [OLD]);
    expect(history.map((item) => item.change)).toEqual(["booked"]);
  });
});

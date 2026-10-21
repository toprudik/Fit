import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const { freeCancelUntil, loadClientBookings } = await import("./load");

const CLIENT = "00000000-0000-4000-8000-000000000001";
const TRAINER = "00000000-0000-4000-8000-000000000002";

type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
let bookings: Record<string, unknown>[] = [];

// A query builder that records its calls and answers like PostgREST: `range` cuts the ordered rows, `in` filters ids.
function query(table: string) {
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  let ids: string[] | null = null;
  const rows = (): Record<string, unknown>[] => {
    if (table === "bookings") return bookings.slice(from, to + 1);
    if (table === "sessions")
      return (ids ?? []).map((id) => ({
        id,
        status: "completed",
        kind: "personal",
        starts_at: `2024-01-01T10:00:00.000Z`,
        ends_at: `2024-01-01T11:00:00.000Z`,
        mode: "offline",
        title: null,
        location_id: null,
        cancel_reason: null,
      }));
    if (table === "profiles") return [{ id: TRAINER, first_name: "Анна", last_name: null, display_name: null, username: null }];
    return [];
  };
  const builder = {
    then(resolve: (value: unknown) => void) {
      resolve({ data: rows(), error: null });
    },
  } as Record<string, unknown>;
  for (const method of ["select", "eq", "in", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      if (method === "range") [from, to] = args as [number, number];
      if (method === "in") ids = args[1] as string[];
      return builder;
    };
  }
  return builder;
}

const supabase = {
  from: (table: string) => query(table),
  rpc: async () => ({ data: [], error: null }),
};
const owner = { supabase, userId: CLIENT, timeZone: "Europe/Moscow" } as unknown as Parameters<typeof loadClientBookings>[0];

function booking(index: number) {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return { id, status: "attended", source: "client_slot", session_id: id, trainer_id: TRAINER, cancel_reason: null };
}

beforeEach(() => {
  calls.length = 0;
  bookings = [];
});

describe("loadClientBookings", () => {
  it("reads every page, so a client of several years keeps the old sessions", async () => {
    bookings = Array.from({ length: 1200 }, (_, index) => booking(index + 1));
    const result = await loadClientBookings(owner);
    expect(result).toHaveLength(1200);
    const pages = calls.filter((call) => call.table === "bookings" && call.method === "range").map((call) => call.args);
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    const orders = calls.filter((call) => call.table === "bookings" && call.method === "order").map((call) => call.args[0]);
    expect(orders).toEqual(["created_at", "id", "created_at", "id"]);
  });

  it("asks for sessions 100 ids at a time, so the request URL stays short", async () => {
    bookings = Array.from({ length: 250 }, (_, index) => booking(index + 1));
    await loadClientBookings(owner);
    const chunks = calls.filter((call) => call.table === "sessions" && call.method === "in").map((call) => (call.args[1] as string[]).length);
    expect(chunks).toEqual([100, 100, 50]);
  });
});

describe("freeCancelUntil", () => {
  const startsAt = "2026-10-22T15:00:00.000Z";

  it("ends the trainer's deadline before the start", () => {
    expect(freeCancelUntil({ status: "confirmed", startsAt, substitute: null }, 24)).toBe("2026-10-21T15:00:00.000Z");
  });

  it("lasts until the start when a substitute runs the session (QA B5)", () => {
    expect(freeCancelUntil({ status: "confirmed", startsAt, substitute: "Сергей" }, 24)).toBe(startsAt);
    expect(freeCancelUntil({ status: "confirmed", startsAt, substitute: "" }, 24)).toBe(startsAt);
  });

  it("is none for a booking that is not confirmed", () => {
    expect(freeCancelUntil({ status: "cancelled", startsAt, substitute: null }, 24)).toBeNull();
  });
});

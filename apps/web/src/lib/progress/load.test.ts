import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sharing/load", () => ({ loadTrainerShares: vi.fn() }));

const ME = "00000000-0000-4000-8000-000000000001";

type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
let measurements: Record<string, unknown>[] = [];

// A query builder that records its calls and answers like PostgREST: `range` cuts the ordered rows.
function query(table: string) {
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  const rows = () => (table === "measurements" ? measurements : []);
  const builder = {
    then(resolve: (value: unknown) => void) {
      resolve({ data: rows().slice(from, to + 1), error: null });
    },
    maybeSingle: async () => ({ data: table === "user_settings" ? { time_zone: "Europe/Moscow" } : null, error: null }),
  } as Record<string, unknown>;
  for (const method of ["select", "eq", "in", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      if (method === "range") [from, to] = args as [number, number];
      return builder;
    };
  }
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: ME } } }) },
    from: (table: string) => query(table),
  }),
}));

const { loadMyMeasurements } = await import("./load");

function entry(index: number) {
  const day = new Date(Date.UTC(2020, 0, 1) + index * 3_600_000).toISOString();
  return { id: `id-${index}`, kind: "weight", value: "70.5", measured_at: day, local_date: day.slice(0, 10), entered_by: ME };
}

beforeEach(() => {
  calls.length = 0;
  measurements = [];
});

describe("loadMyMeasurements", () => {
  it("reads every page, so a client with more than 1000 entries keeps the oldest ones", async () => {
    measurements = Array.from({ length: 1500 }, (_, index) => entry(1500 - index));
    const result = await loadMyMeasurements();
    expect(result?.entries).toHaveLength(1500);
    expect(result?.entries.at(-1)).toMatchObject({ id: "id-1", value: 70.5, author: { kind: "me" }, mine: true });
    const pages = calls.filter((call) => call.table === "measurements" && call.method === "range").map((call) => call.args);
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("orders pages by time and then by id, so rows with one timestamp do not repeat or vanish between pages", async () => {
    await loadMyMeasurements();
    const orders = calls.filter((call) => call.table === "measurements" && call.method === "order").map((call) => call.args);
    expect(orders).toEqual([
      ["measured_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });
});

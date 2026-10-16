import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

/** Writes made as the signed-in user, and what reads and writes answer. */
const db = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  currency: "RUB" as string | null,
  writes: [] as { table: string; kind: string; values: Record<string, unknown>; filters: unknown[] }[],
  error: null as { code: string } | null,
  rows: 1,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.currency ? { default_currency: db.currency } : null, error: null }),
        }),
      }),
      insert: async (values: Record<string, unknown>) => {
        db.writes.push({ table, kind: "insert", values, filters: [] });
        return { error: db.error };
      },
      update: (values: Record<string, unknown>) => {
        const write = { table, kind: "update", values, filters: [] as unknown[] };
        const chain = {
          eq: (column: string, value: unknown) => {
            write.filters.push([column, value]);
            return chain;
          },
          is: (column: string, value: unknown) => {
            write.filters.push([column, value]);
            return chain;
          },
          select: async () => {
            db.writes.push(write);
            return { data: db.error ? null : Array.from({ length: db.rows }, () => ({ id: "x" })), error: db.error };
          },
        };
        return chain;
      },
    }),
  }),
}));

const { archiveTrialLink, createTrialLink, setTrialLinkEnabled } = await import("./actions");

const IDLE = { status: "idle" } as const;
const ID = "4f9c2a8e-1b6d-4c3e-9a7f-2d5e8b1c0a93";
const VALID = { title: "Пробная силовая", description: "", duration: "45", price: "1 500,5", mode: "offline", location: ID };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user = "trainer-1";
  db.currency = "RUB";
  db.writes = [];
  db.error = null;
  db.rows = 1;
});

describe("createTrialLink", () => {
  it("makes a link in the trainer's currency with the price in minor units", async () => {
    expect(await createTrialLink(IDLE, form(VALID))).toEqual({ status: "created" });
    expect(db.writes).toEqual([
      {
        table: "trial_links",
        kind: "insert",
        filters: [],
        values: {
          trainer_id: "trainer-1",
          title: "Пробная силовая",
          description: null,
          duration_min: 45,
          price_minor: 150050,
          currency: "RUB",
          location_id: ID,
          mode: "offline",
        },
      },
    ]);
    expect(next.refresh).toHaveBeenCalled();
  });

  it("drops the place of an online trial and takes an empty price as free", async () => {
    await createTrialLink(IDLE, form({ ...VALID, mode: "online", price: "" }));
    expect(db.writes[0].values).toMatchObject({ location_id: null, mode: "online", price_minor: 0 });
  });

  it("names the fields to fix and keeps what was typed", async () => {
    const values = { ...VALID, title: " ", price: "-1", duration: "50" };
    expect(await createTrialLink(IDLE, form(values))).toEqual({ status: "invalid", fields: ["title", "duration", "price"], values });
    expect(db.writes).toEqual([]);
  });

  it("fails for a signed-out caller, a non-trainer and a refused insert", async () => {
    db.user = null;
    expect((await createTrialLink(IDLE, form(VALID))).status).toBe("failed");
    db.user = "trainer-1";
    db.currency = null;
    expect((await createTrialLink(IDLE, form(VALID))).status).toBe("failed");
    db.currency = "RUB";
    db.error = { code: "23503" };
    expect(await createTrialLink(IDLE, form(VALID))).toEqual({ status: "failed", values: VALID });
  });
});

describe("switching and deleting", () => {
  it("switches a link off and on", async () => {
    expect(await setTrialLinkEnabled(ID, false)).toEqual({ failed: false });
    expect(db.writes[0]).toMatchObject({ values: { is_enabled: false }, filters: [["id", ID]] });
  });

  it("archives a live link once", async () => {
    expect(await archiveTrialLink(ID)).toEqual({ failed: false });
    expect(db.writes[0].filters).toEqual([
      ["id", ID],
      ["archived_at", null],
    ]);
    db.rows = 0;
    expect(await archiveTrialLink(ID)).toEqual({ failed: true });
  });

  it("refuses a malformed id without asking the database", async () => {
    expect(await setTrialLinkEnabled("nope", true)).toEqual({ failed: true });
    expect(await archiveTrialLink("nope")).toEqual({ failed: true });
    expect(db.writes).toEqual([]);
  });
});

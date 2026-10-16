import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Write = { table: string; kind: string; values: unknown; filters: unknown[] };

/** Writes made as the signed-in user, and what reads and writes answer. */
const db = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  currency: "RUB" as string | null,
  writes: [] as Write[],
  error: null as { code: string } | null,
  rows: 1,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.currency ? { default_currency: db.currency } : null, error: null }) }),
      }),
      insert: (values: unknown) => {
        db.writes.push({ table, kind: "insert", values, filters: [] });
        const answer = { error: db.error, data: db.error ? null : Array.from({ length: db.rows }, () => ({ id: "new" })) };
        return Object.assign(Promise.resolve(answer), { select: async () => answer });
      },
      update: (values: unknown) => {
        const write: Write = { table, kind: "update", values, filters: [] };
        db.writes.push(write);
        const chain = {
          eq: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
          is: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
          select: async () => ({ error: db.error, data: db.error ? null : Array.from({ length: db.rows }, () => ({ id: "p" })) }),
        };
        return chain;
      },
    }),
  }),
}));

const { archivePackage, createGridFromTemplate, savePackage } = await import("./actions");

const IDLE = { status: "idle" } as const;
const ID = "00000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { user: "trainer-1", currency: "RUB", writes: [], error: null, rows: 1 });
});

describe("createGridFromTemplate", () => {
  it("creates the drop-in and the filled-in packs in the trainer's currency (MONEY-1)", async () => {
    const state = await createGridFromTemplate(IDLE, form({ dropIn: "2000", p5: "9000", p10: "16000", p20: "30000", validity: "" }));
    expect(state).toEqual({ status: "saved" });
    expect(next.refresh).toHaveBeenCalledOnce();
    expect(db.writes[0]?.values).toEqual([
      { trainer_id: "trainer-1", title: "Разовое занятие", sessions_count: 1, price_minor: 200000, currency: "RUB", sort_order: 0 },
      { trainer_id: "trainer-1", title: "5 занятий", sessions_count: 5, price_minor: 900000, currency: "RUB", validity_days: null, sort_order: 1 },
      { trainer_id: "trainer-1", title: "10 занятий", sessions_count: 10, price_minor: 1600000, currency: "RUB", validity_days: null, sort_order: 2 },
      { trainer_id: "trainer-1", title: "20 занятий", sessions_count: 20, price_minor: 3000000, currency: "RUB", validity_days: null, sort_order: 3 },
    ]);
  });

  it("needs a drop-in price and keeps what was typed", async () => {
    const values = { dropIn: "0", p5: "", p10: "", p20: "", validity: "" };
    expect(await createGridFromTemplate(IDLE, form(values))).toEqual({ status: "invalid", fields: ["dropIn"], values });
    expect(db.writes).toEqual([]);
  });

  it("tells a second drop-in apart from other failures", async () => {
    db.error = { code: "23505" };
    expect(await createGridFromTemplate(IDLE, form({ dropIn: "2000", p5: "", p10: "", p20: "", validity: "" }))).toMatchObject({ status: "taken" });
    db.error = { code: "42501" };
    expect(await createGridFromTemplate(IDLE, form({ dropIn: "2000", p5: "", p10: "", p20: "", validity: "" }))).toMatchObject({ status: "failed" });
  });

  it("writes nothing for someone who is not a trainer", async () => {
    db.currency = null;
    expect(await createGridFromTemplate(IDLE, form({ dropIn: "2000", p5: "", p10: "", p20: "", validity: "" }))).toMatchObject({ status: "failed" });
    expect(db.writes).toEqual([]);
  });
});

describe("savePackage", () => {
  const fields = { id: "", title: "", sessions: "8", price: "12 000", validity: "60", appliesTo: "personal" };

  it("adds a package named by its sessions in the trainer's currency", async () => {
    expect(await savePackage(IDLE, form({ ...fields, isPublic: "on" }))).toEqual({ status: "saved" });
    expect(db.writes[0]).toMatchObject({
      kind: "insert",
      values: {
        trainer_id: "trainer-1",
        currency: "RUB",
        title: "8 занятий",
        sessions_count: 8,
        price_minor: 1200000,
        validity_days: 60,
        applies_to: "personal",
        is_public: true,
      },
    });
  });

  it("names it in the language of the page that sent it", async () => {
    await savePackage(IDLE, form({ ...fields, locale: "en" }));
    expect(db.writes[0]?.values).toMatchObject({ title: "8 sessions" });
  });

  it("edits only a live package and never its currency", async () => {
    expect(await savePackage(IDLE, form({ ...fields, id: ID, title: "Утро", isPublic: "" }))).toEqual({ status: "saved" });
    expect(db.writes[0]).toEqual({
      table: "packages",
      kind: "update",
      values: { title: "Утро", sessions_count: 8, price_minor: 1200000, validity_days: 60, applies_to: "personal", is_public: false },
      filters: [
        ["id", ID],
        ["archived_at", null],
      ],
    });
  });

  it("checks sessions, price, validity and type", async () => {
    expect(await savePackage(IDLE, form({ ...fields, sessions: "0", price: "x", validity: "7", appliesTo: "all" }))).toMatchObject({
      status: "invalid",
      fields: ["sessions", "price", "validity", "appliesTo"],
    });
    expect(db.writes).toEqual([]);
  });

  it("reports a package that is gone", async () => {
    db.rows = 0;
    expect(await savePackage(IDLE, form({ ...fields, id: ID }))).toMatchObject({ status: "failed" });
  });
});

describe("archivePackage", () => {
  it("archives a live package", async () => {
    expect(await archivePackage(ID)).toEqual({ failed: false });
    expect(db.writes[0]?.filters).toEqual([
      ["id", ID],
      ["archived_at", null],
    ]);
  });

  it("refuses a malformed id", async () => {
    expect(await archivePackage("1; drop table")).toEqual({ failed: true });
    expect(db.writes).toEqual([]);
  });
});

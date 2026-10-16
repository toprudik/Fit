import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const db = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  writes: [] as { kind: string; values: unknown; filters: unknown[] }[],
  error: null as { code: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: () => ({
      insert: async (values: unknown) => {
        db.writes.push({ kind: "insert", values, filters: [] });
        return { error: db.error };
      },
      update: (values: unknown) => {
        const write = { kind: "update", values, filters: [] as unknown[] };
        db.writes.push(write);
        const chain = {
          eq: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
          is: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
          select: async () => ({ error: db.error, data: db.error ? null : [{ id: "l" }] }),
        };
        return chain;
      },
    }),
  }),
}));

const { addPaymentLink, archivePaymentLink } = await import("./actions");

const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { user: "trainer-1", writes: [], error: null });
});

describe("payment links", () => {
  it("adds an https link for the trainer", async () => {
    expect(await addPaymentLink(IDLE, form({ title: "СБП", url: " https://pay.example/anna ", kind: "sbp" }))).toEqual({ status: "added" });
    expect(db.writes).toEqual([{ kind: "insert", values: { trainer_id: "trainer-1", title: "СБП", url: "https://pay.example/anna", kind: "sbp" }, filters: [] }]);
  });

  it("keeps only https links (MONEY-11)", async () => {
    for (const url of ["http://pay.example", "javascript:alert(1)", "pay.example"]) {
      expect(await addPaymentLink(IDLE, form({ title: "СБП", url, kind: "sbp" }))).toMatchObject({ status: "invalid", fields: ["url"] });
    }
    expect(db.writes).toEqual([]);
  });

  it("archives a link instead of deleting it", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    expect(await archivePaymentLink(id)).toEqual({ failed: false });
    expect(db.writes[0]?.filters).toEqual([
      ["id", id],
      ["archived_at", null],
    ]);
    expect(await archivePaymentLink("nope")).toEqual({ failed: true });
  });
});

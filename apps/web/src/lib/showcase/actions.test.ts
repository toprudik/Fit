import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

/** Updates made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  updates: [] as { table: string; values: Record<string, unknown>; id: unknown }[],
  answer: { data: [{ user_id: "trainer-1" }] as unknown[], error: null as { code: string } | null },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: (_column: string, id: unknown) => ({
          select: async () => {
            db.updates.push({ table, values, id });
            return db.answer;
          },
        }),
      }),
    }),
  }),
}));

const { saveShowcaseAddress, setShowcaseVisible } = await import("./actions");

const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user = "trainer-1";
  db.updates = [];
  db.answer = { data: [{ user_id: "trainer-1" }], error: null };
});

describe("saveShowcaseAddress", () => {
  it("saves the address in lower case for the signed-in trainer", async () => {
    expect(await saveShowcaseAddress(IDLE, form({ slug: " Anna-Fit " }))).toEqual({ status: "saved", slug: "anna-fit" });
    expect(db.updates).toEqual([{ table: "trainer_profiles", values: { slug: "anna-fit" }, id: "trainer-1" }]);
    expect(next.refresh).toHaveBeenCalled();
  });

  it("refuses a malformed address without asking the database", async () => {
    expect(await saveShowcaseAddress(IDLE, form({ slug: "a b" }))).toEqual({ status: "error", reason: "invalid", value: "a b" });
    expect(db.updates).toEqual([]);
  });

  it("says when another trainer has the address", async () => {
    db.answer = { data: [], error: { code: "23505" } };
    expect(await saveShowcaseAddress(IDLE, form({ slug: "boris" }))).toEqual({ status: "error", reason: "taken", value: "boris" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails when the caller is signed out or not a trainer", async () => {
    db.answer = { data: [], error: null };
    expect(await saveShowcaseAddress(IDLE, form({ slug: "anna" }))).toEqual({ status: "error", reason: "failed", value: "anna" });
    db.user = null;
    db.updates = [];
    expect(await saveShowcaseAddress(IDLE, form({ slug: "anna" }))).toEqual({ status: "error", reason: "failed", value: "anna" });
    expect(db.updates).toEqual([]);
  });
});

describe("setShowcaseVisible", () => {
  it("switches the showcase off and on", async () => {
    expect(await setShowcaseVisible({ failed: false }, form({ visible: "false" }))).toEqual({ failed: false });
    expect(await setShowcaseVisible({ failed: false }, form({ visible: "true" }))).toEqual({ failed: false });
    expect(db.updates.map((update) => update.values)).toEqual([{ is_public: false }, { is_public: true }]);
  });

  it("reports a refused update", async () => {
    db.answer = { data: [], error: { code: "42501" } };
    expect(await setShowcaseVisible({ failed: false }, form({ visible: "false" }))).toEqual({ failed: true });
  });
});

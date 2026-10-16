import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = { then: (resolve: (value: Answer) => unknown) => resolve(db.answer) } as Record<string, unknown>;
      for (const step of ["update", "select", "eq"]) {
        chain[step] = (...args: unknown[]) => {
          steps.push(step, ...args);
          return chain;
        };
      }
      return chain;
    },
  }),
}));

const { setShare } = await import("./actions");

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: [{ coaching_id: PAIR }], error: null };
});

describe("setShare", () => {
  it("writes one category of the pair and refreshes the screen", async () => {
    expect(await setShare({ coachingId: PAIR, category: "photos", shared: true })).toEqual({ ok: true });
    expect(db.calls).toEqual([["data_shares", "update", { photos: true }, "eq", "coaching_id", PAIR, "select", "coaching_id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("fails when RLS hid the row, so nothing was written", async () => {
    db.answer = { data: [], error: null };
    expect(await setShare({ coachingId: PAIR, category: "measurements", shared: false })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "denied", code: "42501" } };
    expect(await setShare({ coachingId: PAIR, category: "intake", shared: true })).toEqual({ ok: false });
  });

  it("rejects a bad pair id or a category outside wave 1 before touching the database", async () => {
    expect(await setShare({ coachingId: "nope", category: "photos", shared: true })).toEqual({ ok: false });
    // @ts-expect-error nutrition has no switch until wave 2.
    expect(await setShare({ coachingId: PAIR, category: "nutrition", shared: false })).toEqual({ ok: false });
    // @ts-expect-error not a boolean.
    expect(await setShare({ coachingId: PAIR, category: "photos", shared: "yes" })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });
});

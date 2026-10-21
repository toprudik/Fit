import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  data: "11111111-1111-4111-8111-111111111111" as string | null,
  error: null as { message: string; code: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: db.data, error: db.error };
    },
  }),
}));

const { createTrainerStoryCard } = await import("./actions");

beforeEach(() => {
  db.calls = [];
  db.data = "11111111-1111-4111-8111-111111111111";
  db.error = null;
});

describe("createTrainerStoryCard", () => {
  it("sends the month card's month and nothing for the showcase", async () => {
    expect(await createTrainerStoryCard({ kind: "trainer_month", month: "2026-09" })).toEqual({ status: "created", id: db.data });
    expect(await createTrainerStoryCard({ kind: "trainer_showcase", month: "2026-09" })).toEqual({ status: "created", id: db.data });
    expect(db.calls).toEqual([
      { fn: "create_trainer_story_card", args: { p_kind: "trainer_month", p_month: "2026-09-01" } },
      { fn: "create_trainer_story_card", args: { p_kind: "trainer_showcase", p_month: undefined } },
    ]);
  });

  it("refuses client kinds and a bad month before calling the database", async () => {
    expect(await createTrainerStoryCard({ kind: "sessions" })).toEqual({ status: "failed" });
    expect(await createTrainerStoryCard({ kind: "trainer_month", month: "September" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("tells an empty month apart from a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.error = { message: "nothing_to_show", code: "P0001" };
    expect(await createTrainerStoryCard({ kind: "trainer_month", month: "2026-09" })).toEqual({ status: "empty" });
    db.error = { message: "consent_required", code: "P0001" };
    expect(await createTrainerStoryCard({ kind: "trainer_showcase" })).toEqual({ status: "consent" });
    db.error = { message: "month_not_finished", code: "P0001" };
    expect(await createTrainerStoryCard({ kind: "trainer_month", month: "2026-10" })).toEqual({ status: "failed" });
  });
});

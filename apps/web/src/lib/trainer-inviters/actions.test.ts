import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { joinInvitedTrainer } = await import("./actions");

const TRAINER = "7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const PAIR = "0d9c8b7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a";
const IDLE = { status: "idle" } as const;

function form(trainer: string) {
  const data = new FormData();
  data.set("trainer", trainer);
  return data;
}

beforeEach(() => {
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("joinInvitedTrainer", () => {
  it("starts the pair and returns it", async () => {
    db.answer = { data: PAIR, error: null };
    await expect(joinInvitedTrainer(IDLE, form(TRAINER))).resolves.toEqual({ status: "joined", coachingId: PAIR });
    expect(db.calls).toEqual([["join_invited_trainer", { p_trainer_id: TRAINER }]]);
  });

  it("refuses a malformed trainer id without calling the database", async () => {
    await expect(joinInvitedTrainer(IDLE, form("x"))).resolves.toEqual({ status: "error", reason: "notInvited" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["not_invited", "notInvited"],
    ["trainer_unavailable", "unavailable"],
    ["plan_limit_reached", "limit"],
    ["account_deleting", "deleting"],
  ])("words %s as %s", async (message, reason) => {
    db.answer = { data: null, error: { message, code: "P0001" } };
    await expect(joinInvitedTrainer(IDLE, form(TRAINER))).resolves.toEqual({ status: "error", reason });
  });

  it("logs only the code of an unexpected error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    await expect(joinInvitedTrainer(IDLE, form(TRAINER))).resolves.toEqual({ status: "error", reason: "failed" });
    expect(logged).toHaveBeenCalledWith("joining an invited trainer failed", "XX000");
  });
});

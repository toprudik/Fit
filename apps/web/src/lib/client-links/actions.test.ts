import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args?: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as { message: string; code: string } | null },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args?: Record<string, unknown>) => {
      db.calls.push(args ? { fn, args } : { fn });
      return Promise.resolve(db.answer);
    },
  }),
}));

const { joinTrainer, reissueClientLink } = await import("./actions");

const TOKEN = "Ab3_-Ab3_-Ab3_-Ab3_-Ab";
const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("joinTrainer", () => {
  it("joins by the link token and returns the pair", async () => {
    db.answer = { data: "pair-1", error: null };
    expect(await joinTrainer(IDLE, form({ token: TOKEN }))).toEqual({ status: "joined", coachingId: "pair-1" });
    expect(db.calls).toEqual([{ fn: "join_by_invite", args: { p_token: TOKEN } }]);
  });

  it("joins by the normalized code when there is no token", async () => {
    db.answer = { data: "pair-2", error: null };
    expect(await joinTrainer(IDLE, form({ code: "abc-def" }))).toEqual({ status: "joined", coachingId: "pair-2" });
    expect(db.calls).toEqual([{ fn: "join_by_code", args: { p_code: "ABCDEF" } }]);
  });

  it("joins through a trial link", async () => {
    db.answer = { data: "pair-4", error: null };
    expect(await joinTrainer(IDLE, form({ trial: TOKEN }))).toEqual({ status: "joined", coachingId: "pair-4" });
    expect(db.calls).toEqual([{ fn: "join_by_trial_link", args: { p_token: TOKEN } }]);
  });

  it("joins through the showcase by its address", async () => {
    db.answer = { data: "pair-3", error: null };
    expect(await joinTrainer(IDLE, form({ slug: "anna-fit" }))).toEqual({ status: "joined", coachingId: "pair-3" });
    expect(db.calls).toEqual([{ fn: "join_by_showcase", args: { p_slug: "anna-fit" } }]);
  });

  it("treats a malformed token and an empty code as invalid without asking the database", async () => {
    expect(await joinTrainer(IDLE, form({ token: "short", code: "" }))).toEqual({ status: "error", reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["invite_invalid", "invalid"],
    ["trainer_unavailable", "unavailable"],
    ["own_invite", "own"],
    ["plan_limit_reached", "limit"],
    ["something_else", "failed"],
  ])("maps %s to %s", async (message, reason) => {
    db.answer = { data: null, error: { message, code: "P0001" } };
    expect(await joinTrainer(IDLE, form({ token: TOKEN }))).toEqual({ status: "error", reason });
  });
});

describe("reissueClientLink", () => {
  it("reissues the link and reloads the screen", async () => {
    expect(await reissueClientLink()).toEqual({ failed: false });
    expect(db.calls).toEqual([{ fn: "reissue_client_invite" }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports a failure and keeps the screen", async () => {
    db.answer = { data: null, error: { message: "not_a_trainer", code: "P0001" } };
    expect(await reissueClientLink()).toEqual({ failed: true });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

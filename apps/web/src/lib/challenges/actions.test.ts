import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { cancelChallenge, createChallenge, joinChallenge, leaveChallenge, setChallengeLeaderboard } = await import("./actions");

const GROUP = "00000000-0000-4000-8000-000000000001";
const CHALLENGE = "00000000-0000-4000-8000-000000000002";
const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createChallenge", () => {
  const valid = { groupId: GROUP, title: "  Шаги октября ", metric: "steps", weeks: 4, startsOn: "2026-11-02", goal: 200000, leaderboard: true };

  it("creates the challenge with the trimmed title and returns its id", async () => {
    db.answer = { data: CHALLENGE, error: null };
    expect(await createChallenge(valid)).toEqual({ ok: true, value: CHALLENGE });
    expect(db.calls).toEqual([
      [
        "rpc",
        "create_challenge",
        { p_group_id: GROUP, p_title: "Шаги октября", p_metric: "steps", p_weeks: 4, p_starts_on: "2026-11-02", p_goal: 200000, p_leaderboard: true },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no goal when there is none", async () => {
    await createChallenge({ ...valid, goal: null, leaderboard: false });
    expect(db.calls[0]?.[2]).toMatchObject({ p_goal: undefined, p_leaderboard: false });
  });

  it("takes the bounds: 1 and 12 weeks, goal 1 and 10 000 000, an 80-character title", async () => {
    for (const input of [
      { ...valid, weeks: 1, goal: 1 },
      { ...valid, weeks: 12, goal: 10_000_000 },
      { ...valid, title: "x".repeat(80) },
    ]) {
      expect(await createChallenge(input)).toMatchObject({ ok: true });
    }
  });

  it("refuses each bad field without a call", async () => {
    const bad = [
      { groupId: "nope" },
      { title: "   " },
      { title: "x".repeat(81) },
      { title: 5 as unknown as string },
      { metric: "weight" },
      { metric: "photos" },
      { weeks: 0 },
      { weeks: 13 },
      { weeks: 2.5 },
      { startsOn: "02.11.2026" },
      { startsOn: "" },
      { goal: 0 },
      { goal: 10_000_001 },
      { goal: 1.5 },
      { leaderboard: "yes" as unknown as boolean },
    ];
    for (const change of bad) expect(await createChallenge({ ...valid, ...change })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads a missing plan, a refused input and anything else apart", async () => {
    db.answer = fail("plan_required", "42501");
    expect(await createChallenge(valid)).toEqual({ ok: false, reason: "plan" });
    db.answer = fail("bad_start", "22023");
    expect(await createChallenge(valid)).toEqual({ ok: false, reason: "invalid" });
    // A 42501 that is not the plan check is someone else's group, not a plan to buy.
    db.answer = fail("not_owner", "42501");
    expect(await createChallenge(valid)).toEqual({ ok: false, reason: "failed" });
    db.answer = fail("boom", "XX000");
    expect(await createChallenge(valid)).toEqual({ ok: false, reason: "failed" });
    expect(logged).toHaveBeenCalledWith("creating a challenge failed", "XX000");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("cancelChallenge", () => {
  it("cancels the challenge and refreshes", async () => {
    expect(await cancelChallenge(CHALLENGE)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "cancel_challenge", { p_challenge_id: CHALLENGE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad id without a call", async () => {
    for (const id of ["nope", "", null, 42]) expect(await cancelChallenge(id)).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("fails on an error without a refresh", async () => {
    db.answer = fail("not_owner", "42501");
    expect(await cancelChallenge(CHALLENGE)).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("joinChallenge", () => {
  it("joins on the leaderboard with the trimmed alias", async () => {
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: true, alias: "  Ракета " })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "join_challenge", { p_challenge_id: CHALLENGE, p_show_on_leaderboard: true, p_alias: "Ракета" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no alias when it is blank or missing", async () => {
    await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: false, alias: "   " });
    await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: false, alias: null });
    for (const call of db.calls) expect(call[2]).toEqual({ p_challenge_id: CHALLENGE, p_show_on_leaderboard: false, p_alias: undefined });
  });

  it("takes a 30-character alias and refuses a longer one, a bad id or flag without a call", async () => {
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: true, alias: "x".repeat(30) })).toEqual({ ok: true });
    db.calls = [];
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: true, alias: "x".repeat(31) })).toEqual({ ok: false, reason: "failed" });
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: true, alias: 7 as unknown as string })).toEqual({ ok: false, reason: "failed" });
    expect(await joinChallenge({ challengeId: "nope", showOnLeaderboard: true, alias: null })).toEqual({ ok: false, reason: "failed" });
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: "yes" as unknown as boolean, alias: null })).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("reads a share to switch on, a closed challenge and anything else apart", async () => {
    db.answer = fail("share_needed");
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: false, alias: null })).toEqual({ ok: false, reason: "share_needed" });
    db.answer = fail("challenge_closed");
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: false, alias: null })).toEqual({ ok: false, reason: "closed" });
    expect(logged).not.toHaveBeenCalled();
    db.answer = fail("boom", "XX000");
    expect(await joinChallenge({ challengeId: CHALLENGE, showOnLeaderboard: false, alias: null })).toEqual({ ok: false, reason: "failed" });
    expect(logged).toHaveBeenCalledWith("joining a challenge failed", "XX000");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("setChallengeLeaderboard", () => {
  it("shows the participant under the trimmed alias and refreshes", async () => {
    expect(await setChallengeLeaderboard({ challengeId: CHALLENGE, show: true, alias: " Ёж " })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_challenge_leaderboard", { p_challenge_id: CHALLENGE, p_show: true, p_alias: "Ёж" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("hides the participant without an alias", async () => {
    await setChallengeLeaderboard({ challengeId: CHALLENGE, show: false, alias: null });
    expect(db.calls[0]?.[2]).toEqual({ p_challenge_id: CHALLENGE, p_show: false, p_alias: undefined });
  });

  it("refuses a too long alias, a bad id or flag without a call", async () => {
    expect(await setChallengeLeaderboard({ challengeId: CHALLENGE, show: true, alias: "x".repeat(31) })).toEqual({ ok: false });
    expect(await setChallengeLeaderboard({ challengeId: "nope", show: true, alias: null })).toEqual({ ok: false });
    expect(await setChallengeLeaderboard({ challengeId: CHALLENGE, show: 1 as unknown as boolean, alias: null })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("fails on an error without a refresh", async () => {
    db.answer = fail("not_participant");
    expect(await setChallengeLeaderboard({ challengeId: CHALLENGE, show: true, alias: null })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("leaveChallenge", () => {
  it("leaves the challenge and refreshes", async () => {
    expect(await leaveChallenge(CHALLENGE)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "leave_challenge", { p_challenge_id: CHALLENGE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad id without a call", async () => {
    expect(await leaveChallenge("nope")).toEqual({ ok: false });
    expect(await leaveChallenge(undefined)).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("fails on an error without a refresh", async () => {
    db.answer = fail("boom", "XX000");
    expect(await leaveChallenge(CHALLENGE)).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

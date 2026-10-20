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
    rpc: (fn: string, args?: unknown) => {
      db.calls.push(args === undefined ? ["rpc", fn] : ["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { addWater, issueShortcutToken, revokeShortcutToken, setSleep, setSteps, undoWater } = await import("./actions");

const DAY = "2026-10-18";
const BAD_DAYS = ["", "18.10.2026", "2026-10-1", "2026/10/18", "2026-10-18T00:00", " 2026-10-18"];
const FAILED = { ok: false, reason: "failed" };
const BAD_DAY = { ok: false, reason: "bad_day" };

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setSteps", () => {
  it("saves the steps of a day and refreshes", async () => {
    expect(await setSteps({ day: DAY, steps: 8500 })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_activity", { p_day: DAY, p_metric: "steps", p_value: 8500 }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("clears the steps with null", async () => {
    expect(await setSteps({ day: DAY, steps: null })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_activity", { p_day: DAY, p_metric: "steps", p_value: null }]]);
  });

  it("takes 0 and 100 000, the bounds", async () => {
    expect(await setSteps({ day: DAY, steps: 0 })).toEqual({ ok: true });
    expect(await setSteps({ day: DAY, steps: 100_000 })).toEqual({ ok: true });
  });

  it("refuses negative, fractional, too many steps and a malformed day without a call", async () => {
    for (const steps of [-1, 1.5, 100_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await setSteps({ day: DAY, steps })).toEqual(FAILED);
    }
    for (const day of BAD_DAYS) expect(await setSteps({ day, steps: 100 })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("tells a day out of range apart from other errors", async () => {
    db.answer = { data: null, error: { message: "bad_day", code: "22023" } };
    expect(await setSteps({ day: DAY, steps: 10 })).toEqual(BAD_DAY);
    db.answer = { data: null, error: { message: "relation secret does not exist", code: "42P01" } };
    expect(await setSteps({ day: DAY, steps: 10 })).toEqual(FAILED);
    expect(logged).toHaveBeenCalledWith("saving steps failed", "42P01");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("setSleep", () => {
  it("saves minutes and quality and refreshes", async () => {
    expect(await setSleep({ day: DAY, minutes: 450, quality: 4 })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_activity", { p_day: DAY, p_metric: "sleep", p_value: 450, p_quality: 4 }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no quality when there is none and clears with null minutes", async () => {
    await setSleep({ day: DAY, minutes: 420, quality: null });
    await setSleep({ day: DAY, minutes: null, quality: null });
    expect(db.calls).toEqual([
      ["rpc", "set_activity", { p_day: DAY, p_metric: "sleep", p_value: 420, p_quality: undefined }],
      ["rpc", "set_activity", { p_day: DAY, p_metric: "sleep", p_value: null, p_quality: undefined }],
    ]);
  });

  it("takes the bounds: 1 and 1440 minutes, quality 1 and 5", async () => {
    expect(await setSleep({ day: DAY, minutes: 1, quality: 1 })).toEqual({ ok: true });
    expect(await setSleep({ day: DAY, minutes: 1440, quality: 5 })).toEqual({ ok: true });
  });

  it("refuses minutes or quality out of range, fractions and a bad day without a call", async () => {
    for (const minutes of [0, 1441, 30.5, -10]) expect(await setSleep({ day: DAY, minutes, quality: null })).toEqual(FAILED);
    for (const quality of [0, 6, 2.5]) expect(await setSleep({ day: DAY, minutes: 400, quality })).toEqual(FAILED);
    for (const day of BAD_DAYS) expect(await setSleep({ day, minutes: 400, quality: 3 })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("maps bad_day and hides other errors", async () => {
    db.answer = { data: null, error: { message: "bad_day", code: "22023" } };
    expect(await setSleep({ day: DAY, minutes: 400, quality: 3 })).toEqual(BAD_DAY);
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await setSleep({ day: DAY, minutes: 400, quality: 3 })).toEqual(FAILED);
  });
});

describe("addWater", () => {
  it("adds water to the day and refreshes", async () => {
    expect(await addWater({ day: DAY, ml: 250 })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "add_water", { p_day: DAY, p_ml: 250 }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes 1 and 5000 ml, the bounds", async () => {
    expect(await addWater({ day: DAY, ml: 1 })).toEqual({ ok: true });
    expect(await addWater({ day: DAY, ml: 5000 })).toEqual({ ok: true });
  });

  it("refuses 0, too much, fractions and a bad day without a call", async () => {
    for (const ml of [0, -250, 5001, 250.5]) expect(await addWater({ day: DAY, ml })).toEqual(FAILED);
    for (const day of BAD_DAYS) expect(await addWater({ day, ml: 250 })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("maps bad_day and hides other errors", async () => {
    db.answer = { data: null, error: { message: "bad_day", code: "22023" } };
    expect(await addWater({ day: DAY, ml: 250 })).toEqual(BAD_DAY);
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await addWater({ day: DAY, ml: 250 })).toEqual(FAILED);
    expect(logged).toHaveBeenCalledWith("adding water failed", "XX000");
  });
});

describe("undoWater", () => {
  it("takes back the latest water and refreshes", async () => {
    expect(await undoWater(DAY)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "undo_water", { p_day: DAY }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad day without a call", async () => {
    for (const day of BAD_DAYS) expect(await undoWater(day)).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("maps bad_day and hides other errors", async () => {
    db.answer = { data: null, error: { message: "bad_day", code: "22023" } };
    expect(await undoWater(DAY)).toEqual(BAD_DAY);
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await undoWater(DAY)).toEqual(FAILED);
  });
});

describe("issueShortcutToken", () => {
  it("returns the new token once, without a refresh", async () => {
    db.answer = { data: "tok_abcdefghijklmnop", error: null };
    expect(await issueShortcutToken()).toEqual({ ok: true, token: "tok_abcdefghijklmnop" });
    expect(db.calls).toEqual([["rpc", "issue_ingest_token"]]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails on an error or an empty answer", async () => {
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await issueShortcutToken()).toEqual({ ok: false });
    db.answer = { data: null, error: null };
    expect(await issueShortcutToken()).toEqual({ ok: false });
    db.answer = { data: "", error: null };
    expect(await issueShortcutToken()).toEqual({ ok: false });
  });
});

describe("revokeShortcutToken", () => {
  it("revokes the token and refreshes", async () => {
    expect(await revokeShortcutToken()).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "revoke_ingest_token"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("fails on an error without a refresh", async () => {
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await revokeShortcutToken()).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

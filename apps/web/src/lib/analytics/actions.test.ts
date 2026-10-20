import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
  user: "user-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { recordAppOpen } = await import("./actions");

beforeEach(() => {
  db.calls = [];
  db.answer = { data: null, error: null };
  db.user = "user-1";
});

describe("recordAppOpen", () => {
  it("records an open with the bot message type", async () => {
    await recordAppOpen("session_reminder");
    expect(db.calls).toEqual([["rpc", "record_app_open", { p_source: "session_reminder" }]]);
  });

  it("records an open without a source", async () => {
    await recordAppOpen(null);
    expect(db.calls).toEqual([["rpc", "record_app_open", { p_source: undefined }]]);
  });

  it("drops a malformed source but still records the open", async () => {
    for (const raw of ["", "Reminder", "a-b", "x".repeat(41), "drop table;", "напоминание"]) {
      await recordAppOpen(raw);
    }
    expect(db.calls).toHaveLength(6);
    for (const call of db.calls) expect(call).toEqual(["rpc", "record_app_open", { p_source: undefined }]);
  });

  it("takes a source of 40 characters", async () => {
    await recordAppOpen("a".repeat(40));
    expect(db.calls).toEqual([["rpc", "record_app_open", { p_source: "a".repeat(40) }]]);
  });

  it("records nothing for a signed-out visitor", async () => {
    db.user = null;
    await recordAppOpen("session_reminder");
    expect(db.calls).toEqual([]);
  });

  it("swallows a database error, logging only its code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    await expect(recordAppOpen(null)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith("recording an app open failed", "XX000");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// The basic paths are in actions.test.ts; this file covers the edges of the form and of the answers.

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_USERNAME: "dafit_test_bot" }) }));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** RPCs called as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: {} as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      const result = Promise.resolve({ data: null, error: null, ...db.answer });
      return Object.assign(result, { single: () => result });
    },
  }),
}));

const { createTrainerInvite, revokeTrainerInvite } = await import("./admin-actions");

const IDLE = { status: "idle" } as const;
const INVITE = "00000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("createTrainerInvite", () => {
  it("takes 1 and 90 days, and a note of 200 characters", async () => {
    db.answer = { data: { code: "abcdefghjklm", expires_at: "2026-10-19T12:00:00Z" } };
    expect(await createTrainerInvite(IDLE, form({ note: "x".repeat(200), days: "1" }))).toMatchObject({ status: "created" });
    expect(await createTrainerInvite(IDLE, form({ note: "", days: "90" }))).toMatchObject({ status: "created" });
    expect(db.calls).toEqual([
      ["admin_create_trainer_invite", { p_note: "x".repeat(200), p_valid_days: 1 }],
      ["admin_create_trainer_invite", { p_note: "", p_valid_days: 90 }],
    ]);
  });

  it("sends an empty note when the field is missing and links the normalized code", async () => {
    db.answer = { data: { code: "abcd-efgh-jklm", expires_at: "2026-10-19T12:00:00Z" } };
    const state = await createTrainerInvite(IDLE, form({ days: "7" }));
    expect(db.calls).toEqual([["admin_create_trainer_invite", { p_note: "", p_valid_days: 7 }]]);
    expect(state).toMatchObject({ status: "created", link: "https://t.me/dafit_test_bot?startapp=ti_ABCDEFGHJKLM" });
  });

  it.each<Record<string, string>>([{ days: "0" }, { days: "-3" }, { days: "abc" }, { days: "" }, {}])("refuses days %j without a call", async (values) => {
    expect(await createTrainerInvite(IDLE, form({ note: "", ...values }))).toEqual({ status: "invalid-days" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a note over 200 characters without a call", async () => {
    expect(await createTrainerInvite(IDLE, form({ note: "x".repeat(201), days: "7" }))).toEqual({ status: "invalid-days" });
    expect(db.calls).toEqual([]);
  });

  it("reports an empty answer as failed and does not refresh", async () => {
    db.answer = { data: null, error: null };
    expect(await createTrainerInvite(IDLE, form({ note: "", days: "7" }))).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("never returns the database's words", async () => {
    db.answer = { error: { message: "duplicate key value violates unique constraint", code: "23505" } };
    expect(await createTrainerInvite(IDLE, form({ note: "", days: "7" }))).toEqual({ status: "failed" });
  });
});

describe("revokeTrainerInvite", () => {
  it("reports other errors without refreshing", async () => {
    db.answer = { error: { message: "forbidden", code: "42501" } };
    expect(await revokeTrainerInvite(INVITE)).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses an id in braces or an empty one", async () => {
    expect(await revokeTrainerInvite(`{${INVITE}}`)).toEqual({ ok: false });
    expect(await revokeTrainerInvite("")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });
});

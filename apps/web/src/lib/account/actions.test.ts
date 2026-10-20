import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** RPCs and session refreshes made as the signed-in user, and what the next RPC answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
  refreshError: null as { status: number } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      refreshSession: async () => {
        db.calls.push(["refreshSession"]);
        return { error: db.refreshError };
      },
    },
    rpc: (fn: string, args?: unknown) => {
      db.calls.push(args === undefined ? ["rpc", fn] : ["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { cancelAccountDeletion, requestAccountDeletion, requestDataExport } = await import("./actions");

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { calls: [], answer: { data: null, error: null }, refreshError: null });
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestAccountDeletion", () => {
  it("marks the account, renews the session and refreshes the screen", async () => {
    expect(await requestAccountDeletion("УДАЛИТЬ")).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "request_account_deletion"], ["refreshSession"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes the word in either language, any case, with spaces around it", async () => {
    expect(await requestAccountDeletion("  удалить ")).toEqual({ ok: true });
    expect(await requestAccountDeletion("delete")).toEqual({ ok: true });
    expect(await requestAccountDeletion("DELETE")).toEqual({ ok: true });
  });

  it("refuses a wrong, partial or empty word without a call", async () => {
    for (const word of ["", "   ", "УДАЛИ", "УДАЛИТЬ!", "DELET", "yes", "УДАЛИТЬ УДАЛИТЬ"]) {
      expect(await requestAccountDeletion(word)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await requestAccountDeletion(42 as unknown as string)).toEqual({ ok: false, reason: "invalid" });
    expect(await requestAccountDeletion(null as unknown as string)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reports a database error as failed, logs only its code and does not touch the session", async () => {
    db.answer = { data: null, error: { message: "permission denied for secret_table", code: "42501" } };
    expect(await requestAccountDeletion("УДАЛИТЬ")).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([["rpc", "request_account_deletion"]]);
    expect(next.refresh).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("request_account_deletion failed", "42501");
  });

  it("logs an error without a code as unknown", async () => {
    db.answer = { data: null, error: { message: "network" } };
    expect(await requestAccountDeletion("DELETE")).toEqual({ ok: false, reason: "failed" });
    expect(logged).toHaveBeenCalledWith("request_account_deletion failed", "unknown");
  });

  it("still succeeds when the session refresh fails, since the mark is saved", async () => {
    db.refreshError = { status: 400 };
    expect(await requestAccountDeletion("УДАЛИТЬ")).toEqual({ ok: true });
    expect(next.refresh).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("refreshing the session failed", 400);
  });
});

describe("cancelAccountDeletion", () => {
  it("keeps the account, renews the session and refreshes", async () => {
    expect(await cancelAccountDeletion()).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "cancel_account_deletion"], ["refreshSession"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports a database error as failed", async () => {
    db.answer = { data: null, error: { message: "no_deletion_pending", code: "P0001" } };
    expect(await cancelAccountDeletion()).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([["rpc", "cancel_account_deletion"]]);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("requestDataExport", () => {
  it("queues the archive and refreshes without renewing the session", async () => {
    expect(await requestDataExport()).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "request_data_export"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports a database error as failed", async () => {
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await requestDataExport()).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("request_data_export failed", "XX000");
  });
});

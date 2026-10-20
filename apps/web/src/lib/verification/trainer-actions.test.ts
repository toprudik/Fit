import { beforeEach, describe, expect, it, vi } from "vitest";

// The basic paths of upload and submit are in actions.test.ts; this file covers the edges and deleteDocument.

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message?: string; code?: string; name?: string } | null; count?: number | null };

/**
 * Every query, RPC and Storage call made as the signed-in user, step by step, and what they answer: keyed by
 * table, "rpc:<name>" or "storage:<method>"; an array answers one call per item, in order.
 */
const db = vi.hoisted(() => ({
  userId: "trainer-1" as string | null,
  calls: [] as unknown[][],
  answers: {} as Record<string, Answer | Answer[]>,
}));

vi.mock("@/lib/supabase/server", () => {
  const answer = (key: string): Answer => {
    const queued = db.answers[key];
    return { data: null, error: null, ...(Array.isArray(queued) ? queued.shift() : queued) };
  };
  const query = (key: string, steps: unknown[]) => {
    db.calls.push(steps);
    let result: Answer | undefined;
    const chain: Record<string, unknown> = {
      then: (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve((result ??= answer(key))).then(resolve, reject),
    };
    for (const step of ["select", "insert", "delete", "eq", "maybeSingle"]) {
      chain[step] = (...args: unknown[]) => {
        steps.push(step, ...args);
        return chain;
      };
    }
    return chain;
  };
  const bucket = (name: string) => {
    const call =
      (method: string) =>
      async (...args: unknown[]) => {
        db.calls.push(["storage", name, method, ...args]);
        return answer(`storage:${method}`);
      };
    return { createSignedUploadUrl: call("createSignedUploadUrl"), remove: call("remove"), exists: call("exists") };
  };
  return {
    createSupabaseServerClient: async () => ({
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: (table: string) => query(table, [table]),
      rpc: (fn: string) => query(`rpc:${fn}`, ["rpc", fn]),
      storage: { from: bucket },
    }),
  };
});

const { deleteDocument, prepareDocumentUpload, saveDocument, submitVerification } = await import("./trainer-actions");

const DOC = "00000000-0000-4000-8000-000000000001";
const PATH = `trainer-1/${DOC}.pdf`;
const MB = 1024 * 1024;

const storage = () => db.calls.filter((call) => call[0] === "storage");
const editable = (status = "not_submitted") => ({ data: { verification_status: status } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(crypto, "randomUUID").mockReturnValue(DOC);
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
});

describe("prepareDocumentUpload", () => {
  it("signs an upload after a rejection too, counting only the trainer's documents", async () => {
    db.answers.trainer_profiles = editable("rejected");
    db.answers.trainer_certificates = { count: 4 };
    db.answers["storage:createSignedUploadUrl"] = { data: { token: "token-1" } };
    expect(await prepareDocumentUpload({ title: " Диплом ", type: "application/pdf", size: 10 * MB })).toEqual({
      status: "ready",
      id: DOC,
      path: PATH,
      token: "token-1",
    });
    expect(db.calls).toEqual([
      ["trainer_profiles", "select", "verification_status", "eq", "user_id", "trainer-1", "maybeSingle"],
      ["trainer_certificates", "select", "id", { count: "exact", head: true }, "eq", "trainer_id", "trainer-1"],
      ["storage", "certificates", "createSignedUploadUrl", PATH],
    ]);
  });

  it.each([
    ["an empty title", { title: "   " }],
    ["a title over 200 characters", { title: "x".repeat(201) }],
    ["an empty file", { size: 0 }],
    ["a file over 10 MB", { size: 10 * MB + 1 }],
    ["a fractional size", { size: 1.5 }],
    ["a type not accepted", { type: "image/gif" }],
    ["a prototype name as type", { type: "toString" }],
  ])("refuses %s without a call", async (_, change) => {
    expect(await prepareDocumentUpload({ title: "Диплом", type: "image/png", size: MB, ...change })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("answers failed without a session and when Storage refuses", async () => {
    db.userId = null;
    expect(await prepareDocumentUpload({ title: "Диплом", type: "image/jpeg", size: MB })).toEqual({ status: "failed" });
    db.userId = "trainer-1";
    db.answers.trainer_profiles = editable();
    db.answers["storage:createSignedUploadUrl"] = { error: { name: "StorageApiError" } };
    expect(await prepareDocumentUpload({ title: "Диплом", type: "image/jpeg", size: MB })).toEqual({ status: "failed" });
  });

  it("reads a missing count as none", async () => {
    db.answers.trainer_profiles = editable();
    db.answers.trainer_certificates = { count: null };
    db.answers["storage:createSignedUploadUrl"] = { data: { token: "t" } };
    expect(await prepareDocumentUpload({ title: "x".repeat(200), type: "image/png", size: 1 })).toMatchObject({ status: "ready" });
  });
});

describe("saveDocument", () => {
  it("refuses a malformed id or an empty title without a call", async () => {
    expect(await saveDocument({ id: "doc-1", path: PATH, title: "Диплом" })).toEqual({ status: "invalid" });
    expect(await saveDocument({ id: DOC, path: PATH, title: " " })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("keeps a locked trainer's documents and removes the new file", async () => {
    db.answers.trainer_profiles = editable("pending");
    expect(await saveDocument({ id: DOC, path: PATH, title: "Диплом" })).toEqual({ status: "locked" });
    expect(db.calls.some((call) => call.includes("insert"))).toBe(false);
    expect(storage()).toEqual([["storage", "certificates", "remove", [PATH]]]);
  });

  it("refuses a path with a known extension in another folder, touching nothing", async () => {
    db.answers.trainer_profiles = editable();
    expect(await saveDocument({ id: DOC, path: `trainer-2/${DOC}.pdf`, title: "Диплом" })).toEqual({ status: "invalid" });
    expect(await saveDocument({ id: DOC, path: `trainer-1/${DOC}.exe`, title: "Диплом" })).toEqual({ status: "invalid" });
    expect(storage()).toEqual([]);
  });

  it("maps the database's limit and other errors, removing the file each time", async () => {
    db.answers.trainer_profiles = [editable(), editable()];
    db.answers["storage:exists"] = { data: true };
    db.answers.trainer_certificates = [{ error: { message: "certificate_limit", code: "P0001" } }, { error: { message: "boom", code: "XX000" } }];
    expect(await saveDocument({ id: DOC, path: PATH, title: "Диплом" })).toEqual({ status: "limit" });
    db.answers["storage:exists"] = { data: true };
    expect(await saveDocument({ id: DOC, path: PATH, title: "Диплом" })).toEqual({ status: "failed" });
    expect(storage().filter((call) => call[2] === "remove")).toEqual([
      ["storage", "certificates", "remove", [PATH]],
      ["storage", "certificates", "remove", [PATH]],
    ]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("answers failed without a trainer profile", async () => {
    expect(await saveDocument({ id: DOC, path: PATH, title: "Диплом" })).toEqual({ status: "failed" });
    expect(storage()).toEqual([]);
  });
});

describe("deleteDocument", () => {
  it("deletes the trainer's row, then the file", async () => {
    db.answers.trainer_profiles = editable();
    db.answers.trainer_certificates = { data: { storage_path: PATH } };
    expect(await deleteDocument(DOC)).toEqual({ ok: true });
    expect(db.calls.slice(1)).toEqual([
      ["trainer_certificates", "delete", "eq", "id", DOC, "eq", "trainer_id", "trainer-1", "select", "storage_path", "maybeSingle"],
      ["storage", "certificates", "remove", [PATH]],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("still answers ok when only the file removal fails", async () => {
    db.answers.trainer_profiles = editable("rejected");
    db.answers.trainer_certificates = { data: { storage_path: PATH } };
    db.answers["storage:remove"] = { error: { name: "StorageApiError" } };
    expect(await deleteDocument(DOC)).toEqual({ ok: true });
  });

  it.each(["pending", "verified"])("keeps documents while %s", async (status) => {
    db.answers.trainer_profiles = editable(status);
    expect(await deleteDocument(DOC)).toEqual({ ok: false });
    expect(db.calls.some((call) => call.includes("delete"))).toBe(false);
  });

  it("refuses a malformed id, no session or no trainer profile", async () => {
    expect(await deleteDocument("doc-1")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.userId = null;
    expect(await deleteDocument(DOC)).toEqual({ ok: false });
    db.userId = "client-1";
    expect(await deleteDocument(DOC)).toEqual({ ok: false });
    expect(db.calls.some((call) => call.includes("delete"))).toBe(false);
  });

  it("removes no file for someone else's document or an error", async () => {
    db.answers.trainer_profiles = [editable(), editable()];
    db.answers.trainer_certificates = [{ data: null }, { error: { message: "boom", code: "XX000" } }];
    expect(await deleteDocument(DOC)).toEqual({ ok: false });
    expect(await deleteDocument(DOC)).toEqual({ ok: false });
    expect(storage()).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("submitVerification", () => {
  it("calls the RPC without arguments", async () => {
    expect(await submitVerification()).toEqual({ status: "submitted" });
    expect(db.calls).toEqual([["rpc", "submit_trainer_verification"]]);
  });

  it("reports an unknown error as failed without a refresh", async () => {
    db.answers["rpc:submit_trainer_verification"] = { error: { message: "boom", code: "XX000" } };
    expect(await submitVerification()).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refreshes when it was already verified", async () => {
    db.answers["rpc:submit_trainer_verification"] = { error: { message: "already_verified", code: "P0001" } };
    expect(await submitVerification()).toEqual({ status: "failed" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });
});

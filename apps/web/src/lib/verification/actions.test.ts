import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const TRAINER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";

/** What the signed-in user's client answers, and what it was asked. */
const db = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args?: Record<string, unknown> }[],
  rpcError: null as { message: string; code: string } | null,
  status: "not_submitted" as string | null,
  count: 0,
  inserted: [] as Record<string, unknown>[],
  insertError: null as { message: string; code: string } | null,
  removed: [] as string[][],
  exists: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: TRAINER } } }) },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args });
      return { data: null, error: db.rpcError };
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === "trainer_profiles" && db.status ? { verification_status: db.status } : null }),
        then: (resolve: (value: unknown) => void) => resolve({ count: db.count }),
        insert: async (row: Record<string, unknown>) => {
          db.inserted.push(row);
          return { error: db.insertError };
        },
      };
      return chain;
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { token: `token-for-${path}` }, error: null }),
        exists: async () => ({ data: db.exists }),
        remove: async (paths: string[]) => {
          db.removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

const { prepareDocumentUpload, saveDocument, submitVerification } = await import("./trainer-actions");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { rpcCalls: [], rpcError: null, status: "not_submitted", count: 0, inserted: [], insertError: null, removed: [], exists: true });
});

describe("prepareDocumentUpload", () => {
  it("gives a one-time upload URL into the trainer's folder", async () => {
    const result = await prepareDocumentUpload({ title: "Diploma", type: "application/pdf", size: 1000 });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.path).toBe(`${TRAINER}/${result.id}.pdf`);
    expect(result.token).toBe(`token-for-${result.path}`);
  });

  it("refuses a wrong file before asking Storage", async () => {
    expect(await prepareDocumentUpload({ title: "Photo", type: "image/heic", size: 10 })).toEqual({ status: "invalid" });
    expect(await prepareDocumentUpload({ title: " ", type: "image/png", size: 10 })).toEqual({ status: "invalid" });
  });

  it("keeps the documents as they are under review and once verified", async () => {
    db.status = "pending";
    expect(await prepareDocumentUpload({ title: "Diploma", type: "image/png", size: 10 })).toEqual({ status: "locked" });
    db.status = "verified";
    expect(await prepareDocumentUpload({ title: "Diploma", type: "image/png", size: 10 })).toEqual({ status: "locked" });
  });

  it("stops at five documents", async () => {
    db.count = 5;
    expect(await prepareDocumentUpload({ title: "Sixth", type: "image/png", size: 10 })).toEqual({ status: "limit" });
  });

  it("answers failed to someone without a trainer profile", async () => {
    db.status = null;
    expect(await prepareDocumentUpload({ title: "Diploma", type: "image/png", size: 10 })).toEqual({ status: "failed" });
  });
});

describe("saveDocument", () => {
  it("saves the row for the uploaded file", async () => {
    expect(await saveDocument({ id: DOC, path: `${TRAINER}/${DOC}.png`, title: " Diploma " })).toEqual({ status: "saved" });
    expect(db.inserted).toEqual([{ id: DOC, trainer_id: TRAINER, title: "Diploma", storage_path: `${TRAINER}/${DOC}.png` }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("accepts only the name it gave out", async () => {
    expect(await saveDocument({ id: DOC, path: `someone-else/${DOC}.png`, title: "Diploma" })).toEqual({ status: "invalid" });
    expect(await saveDocument({ id: DOC, path: `${TRAINER}/${DOC}.exe`, title: "Diploma" })).toEqual({ status: "invalid" });
    expect(db.inserted).toEqual([]);
  });

  it("removes the file when the row cannot be saved", async () => {
    db.insertError = { message: "certificate_limit", code: "P0001" };
    expect(await saveDocument({ id: DOC, path: `${TRAINER}/${DOC}.pdf`, title: "Diploma" })).toEqual({ status: "limit" });
    expect(db.removed).toEqual([[`${TRAINER}/${DOC}.pdf`]]);
  });

  it("saves nothing when the upload never arrived", async () => {
    db.exists = false;
    expect(await saveDocument({ id: DOC, path: `${TRAINER}/${DOC}.pdf`, title: "Diploma" })).toEqual({ status: "failed" });
    expect(db.inserted).toEqual([]);
  });
});

describe("submitVerification", () => {
  it("sends the documents for review", async () => {
    expect(await submitVerification()).toEqual({ status: "submitted" });
    expect(db.rpcCalls).toEqual([{ fn: "submit_trainer_verification", args: undefined }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("asks for a document first", async () => {
    db.rpcError = { message: "no_documents", code: "P0001" };
    expect(await submitVerification()).toEqual({ status: "no-documents" });
  });

  it("reloads the screen when another device already sent them", async () => {
    db.rpcError = { message: "verification_pending", code: "P0001" };
    expect(await submitVerification()).toEqual({ status: "failed" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message?: string; code?: string; name?: string } | null };

/**
 * Every query, RPC and Storage call made as the signed-in user, step by step, and what they answer: keyed by
 * table, "rpc:<name>" or "storage:<method>"; an array answers one call per item, in order.
 */
const db = vi.hoisted(() => ({
  userId: "client-1" as string | null,
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
    return { createSignedUploadUrl: call("createSignedUploadUrl"), remove: call("remove") };
  };
  return {
    createSupabaseServerClient: async () => ({
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: (table: string) => query(table, [table]),
      rpc: (fn: string, args: unknown) => query(`rpc:${fn}`, ["rpc", fn, args]),
      storage: { from: bucket },
    }),
  };
});

const { deleteProgressPhoto, prepareProgressPhoto, saveProgressPhoto } = await import("./photo-actions");

const PHOTO = "00000000-0000-4000-8000-000000000001";
const OLD = "00000000-0000-4000-8000-000000000002";
const PATH = `client-1/${PHOTO}.webp`;
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const storage = () => db.calls.filter((call) => call[0] === "storage");
const writes = () => db.calls.filter((call) => call[0] === "rpc" || call.includes("insert") || call.includes("delete"));

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-10-18T09:00:00Z"), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(crypto, "randomUUID").mockReturnValue(PHOTO);
  Object.assign(db, { userId: "client-1", calls: [], answers: {} });
});

describe("prepareProgressPhoto", () => {
  it("signs an upload into the client's folder and names no photo to replace", async () => {
    db.answers["storage:createSignedUploadUrl"] = { data: { token: "token-1" } };
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "image/webp" })).toEqual({
      status: "ready",
      id: PHOTO,
      path: PATH,
      token: "token-1",
      replaceId: null,
    });
    expect(db.calls).toEqual([
      ["user_settings", "select", "time_zone", "eq", "user_id", "client-1", "maybeSingle"],
      ["progress_photos", "select", "id", "eq", "client_id", "client-1", "eq", "taken_on", "2026-10-18", "eq", "angle", "front", "maybeSingle"],
      ["storage", "progress-photos", "createSignedUploadUrl", PATH],
    ]);
  });

  it("names the photo of the same date and angle as the one to replace, as .jpg for a JPEG", async () => {
    db.answers.progress_photos = { data: { id: OLD } };
    db.answers["storage:createSignedUploadUrl"] = { data: { token: "token-1" } };
    expect(await prepareProgressPhoto({ angle: "back", date: "2026-10-01", type: "image/jpeg" })).toMatchObject({
      path: `client-1/${PHOTO}.jpg`,
      replaceId: OLD,
    });
  });

  it("refuses a bad angle, date or file type without a call", async () => {
    expect(await prepareProgressPhoto({ angle: "top" as never, date: "2026-10-18", type: "image/webp" })).toEqual({ status: "invalid" });
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-02-30", type: "image/webp" })).toEqual({ status: "invalid" });
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "image/png" as never })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a name that only the object prototype knows", async () => {
    // Before the fix `"toString" in PHOTO_TYPES` was true and the path became "<id>.function toString() ...".
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "toString" as never })).toEqual({ status: "invalid" });
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "constructor" as never })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a future day in the client's zone, a day before 1900, and no session", async () => {
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-19", type: "image/webp" })).toEqual({ status: "invalid" });
    expect(await prepareProgressPhoto({ angle: "front", date: "1899-12-31", type: "image/webp" })).toEqual({ status: "invalid" });
    db.userId = null;
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "image/webp" })).toEqual({ status: "invalid" });
    expect(storage()).toEqual([]);
  });

  it("reports a failed lookup or upload URL as failed", async () => {
    db.answers.progress_photos = [{ error: UNKNOWN }, {}];
    db.answers["storage:createSignedUploadUrl"] = { error: { name: "StorageApiError" } };
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "image/webp" })).toEqual({ status: "failed" });
    expect(storage()).toEqual([]);
    expect(await prepareProgressPhoto({ angle: "front", date: "2026-10-18", type: "image/webp" })).toEqual({ status: "failed" });
  });
});

describe("saveProgressPhoto", () => {
  const input = { id: PHOTO, path: PATH, angle: "side" as const, date: "2026-10-18", blurMethod: "auto" as const, width: 900, height: 1600, replaceId: null };

  it("adds the row for a new photo, marked blurred, and refreshes", async () => {
    expect(await saveProgressPhoto(input)).toEqual({ status: "saved" });
    expect(writes()).toEqual([
      [
        "progress_photos",
        "insert",
        { id: PHOTO, client_id: "client-1", angle: "side", taken_on: "2026-10-18", storage_path: PATH, face_blurred: true, blur_method: "auto", width: 900, height: 1600 },
      ],
    ]);
    expect(storage()).toEqual([]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("swaps a retake in one RPC and removes the old object only after", async () => {
    db.answers.progress_photos = { data: { storage_path: `client-1/${OLD}.jpg` } };
    expect(await saveProgressPhoto({ ...input, replaceId: OLD, blurMethod: "none_no_face" })).toEqual({ status: "saved" });
    expect(db.calls.slice(1)).toEqual([
      ["progress_photos", "select", "storage_path", "eq", "id", OLD, "eq", "client_id", "client-1", "maybeSingle"],
      [
        "rpc",
        "replace_progress_photo",
        { p_photo_id: OLD, p_new_id: PHOTO, p_storage_path: PATH, p_face_blurred: true, p_blur_method: "none_no_face", p_width: 900, p_height: 1600 },
      ],
      ["storage", "progress-photos", "remove", [`client-1/${OLD}.jpg`]],
    ]);
  });

  it("removes the upload and reads a refused row as the Free limit", async () => {
    db.answers.progress_photos = { error: { message: "new row violates row-level security policy", code: "42501" } };
    expect(await saveProgressPhoto(input)).toEqual({ status: "limit" });
    expect(storage()).toEqual([["storage", "progress-photos", "remove", [PATH]]]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("removes the upload, keeps the old photo and reports a failed swap", async () => {
    db.answers.progress_photos = { data: { storage_path: `client-1/${OLD}.jpg` } };
    db.answers["rpc:replace_progress_photo"] = { error: UNKNOWN };
    expect(await saveProgressPhoto({ ...input, replaceId: OLD })).toEqual({ status: "failed" });
    expect(storage()).toEqual([["storage", "progress-photos", "remove", [PATH]]]);
  });

  it("accepts only the name step 1 gave out", async () => {
    for (const path of [`client-2/${PHOTO}.webp`, `client-1/${OLD}.webp`, `client-1/${PHOTO}.png`, `client-1/../client-2/${PHOTO}.webp`]) {
      expect(await saveProgressPhoto({ ...input, path })).toEqual({ status: "invalid" });
    }
    expect(writes()).toEqual([]);
    expect(storage()).toEqual([]);
  });

  it.each([
    ["a width of 0", { width: 0 }],
    ["a height over 1600", { height: 1601 }],
    ["a fractional width", { width: 900.5 }],
    ["an unknown blur", { blurMethod: "blur" }],
    ["an unknown angle", { angle: "top" }],
    ["an impossible date", { date: "2026-02-30" }],
    ["a malformed id", { id: "photo-1" }],
    ["a malformed photo to replace", { replaceId: "old" }],
    ["a path over 200 characters", { path: "x".repeat(201) }],
  ])("refuses %s without a call", async (_, change) => {
    expect(await saveProgressPhoto({ ...input, ...change } as never)).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("takes sides of 1 and 1600", async () => {
    expect(await saveProgressPhoto({ ...input, width: 1, height: 1600 })).toEqual({ status: "saved" });
  });

  it("needs a session", async () => {
    db.userId = null;
    expect(await saveProgressPhoto(input)).toEqual({ status: "invalid" });
    expect(writes()).toEqual([]);
  });
});

describe("deleteProgressPhoto", () => {
  it("deletes the row first, then its object", async () => {
    db.answers.progress_photos = { data: [{ storage_path: PATH }] };
    expect(await deleteProgressPhoto(PHOTO)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["progress_photos", "delete", "eq", "id", PHOTO, "select", "storage_path"],
      ["storage", "progress-photos", "remove", [PATH]],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("removes nothing for someone else's photo, an error or a bad id", async () => {
    expect(await deleteProgressPhoto("photo-1")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.answers.progress_photos = [{ data: [] }, { error: UNKNOWN }];
    expect(await deleteProgressPhoto(PHOTO)).toEqual({ ok: false });
    expect(await deleteProgressPhoto(PHOTO)).toEqual({ ok: false });
    expect(storage()).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

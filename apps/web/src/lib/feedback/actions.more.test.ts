import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackInput } from "./input";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => ({ after: next.after }));

const env = vi.hoisted(() => ({ sha: "0123456789abcdef0123" as string | undefined }));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ VERCEL_GIT_COMMIT_SHA: env.sha }) }));

const github = vi.hoisted(() => ({ fileFeedbackIssue: vi.fn(async () => "filed") }));
vi.mock("./github", () => ({ fileFeedbackIssue: github.fileFeedbackIssue }));

type Answer = { data: unknown; error: { message?: string; code?: string; name?: string } | null };

/** Storage and table calls made as the signed-in user, and what they answer. */
const db = vi.hoisted(() => ({
  userId: "00000000-0000-4000-8000-0000000000aa" as string | null,
  uploads: [] as { bucket: string; path: string }[],
  upload: { data: { token: "token-1" }, error: null } as Answer,
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  insert: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => {
          db.uploads.push({ bucket, path });
          return db.upload;
        },
      }),
    },
    from: (table: string) => ({
      insert: async (values: Record<string, unknown>) => {
        db.inserts.push({ table, values });
        return db.insert;
      },
    }),
  }),
}));

const { prepareFeedback, sendFeedback } = await import("./actions");

const USER = "00000000-0000-4000-8000-0000000000aa";
const ID = "00000000-0000-4000-8000-000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MB = 1024 * 1024;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  env.sha = "0123456789abcdef0123";
  Object.assign(db, {
    userId: USER,
    uploads: [],
    upload: { data: { token: "token-1" }, error: null },
    inserts: [],
    insert: { data: null, error: null },
  });
});

describe("prepareFeedback", () => {
  it("names one upload per screenshot in the author's own folder of a new message", async () => {
    const result = await prepareFeedback([
      { type: "image/png", size: 100 },
      { type: "image/jpeg", size: 5 * MB },
      { type: "image/webp", size: 1 },
    ]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.id).toMatch(UUID);
    expect(result.uploads).toEqual([
      { path: `${USER}/${result.id}/1.png`, token: "token-1" },
      { path: `${USER}/${result.id}/2.jpg`, token: "token-1" },
      { path: `${USER}/${result.id}/3.webp`, token: "token-1" },
    ]);
    expect(db.uploads.map((u) => u.bucket)).toEqual(["feedback", "feedback", "feedback"]);
  });

  it("gives a message id without screenshots", async () => {
    const result = await prepareFeedback([]);
    expect(result).toMatchObject({ status: "ready", uploads: [] });
    expect(db.uploads).toEqual([]);
  });

  it.each([
    ["a fourth screenshot", Array.from({ length: 4 }, () => ({ type: "image/png", size: 10 }))],
    ["a gif", [{ type: "image/gif", size: 10 }]],
    ["an svg", [{ type: "image/svg+xml", size: 10 }]],
    ["an empty file", [{ type: "image/png", size: 0 }]],
    ["a file over 5 MB", [{ type: "image/png", size: 5 * MB + 1 }]],
    ["a fractional size", [{ type: "image/png", size: 1.5 }]],
    ["not a list", "image/png" as unknown as { type: string; size: number }[]],
    ["a file without a size", [{ type: "image/png" }] as unknown as { type: string; size: number }[]],
  ])("refuses %s without asking Storage", async (_label, screenshots) => {
    expect(await prepareFeedback(screenshots)).toEqual({ status: "invalid" });
    expect(db.uploads).toEqual([]);
  });

  it("asks a signed-out visitor to sign in", async () => {
    db.userId = null;
    expect(await prepareFeedback([{ type: "image/png", size: 10 }])).toEqual({ status: "signed-out" });
    expect(db.uploads).toEqual([]);
  });

  it("fails when Storage gives no upload URL", async () => {
    db.upload = { data: null, error: { name: "StorageApiError", message: "bucket missing" } };
    expect(await prepareFeedback([{ type: "image/png", size: 10 }])).toEqual({ status: "failed" });
  });
});

describe("sendFeedback", () => {
  const input = (over: Partial<FeedbackInput> = {}): FeedbackInput => ({
    id: ID,
    kind: "bug",
    body: "  Кнопка не нажимается  ",
    route: "/trainer/schedule",
    zone: "trainer",
    platform: "tma-mobile",
    locale: "ru",
    theme: "dark",
    screenshots: [`${USER}/${ID}/1.png`, `${USER}/${ID}/2.jpg`],
    ...over,
  });

  it("saves the message as the author and files the issue after the response", async () => {
    expect(await sendFeedback(input())).toEqual({ status: "sent" });
    expect(db.inserts).toEqual([
      {
        table: "feedback",
        values: {
          id: ID,
          user_id: USER,
          kind: "bug",
          body: "Кнопка не нажимается",
          route: "/trainer/schedule",
          zone: "trainer",
          platform: "tma-mobile",
          app_version: "0123456789ab",
          locale: "ru",
          theme: "dark",
          attachment_paths: [`${USER}/${ID}/1.png`, `${USER}/${ID}/2.jpg`],
        },
      },
    ]);
    expect(next.after).toHaveBeenCalledOnce();
    expect(github.fileFeedbackIssue).not.toHaveBeenCalled();
    await next.after.mock.calls[0][0]();
    expect(github.fileFeedbackIssue).toHaveBeenCalledWith(ID);
  });

  it("keeps the version empty without a commit sha and takes nullable fields as null", async () => {
    env.sha = undefined;
    await sendFeedback(input({ route: null, zone: null, platform: null, theme: null, screenshots: [] }));
    expect(db.inserts[0].values).toMatchObject({ app_version: null, route: null, zone: null, platform: null, theme: null, attachment_paths: [] });
  });

  it("takes a body of exactly 5000 characters", async () => {
    expect(await sendFeedback(input({ body: "a".repeat(5000) }))).toEqual({ status: "sent" });
  });

  it.each<[string, Partial<FeedbackInput>]>([
    ["a malformed id", { id: "42" }],
    ["an unknown kind", { kind: "praise" as FeedbackInput["kind"] }],
    ["a blank body", { body: "   " }],
    ["a body over 5000 characters", { body: "a".repeat(5001) }],
    ["a route over 200 characters", { route: `/${"a".repeat(200)}` }],
    ["an unknown zone", { zone: "admin" as FeedbackInput["zone"] }],
    ["a platform over 32 characters", { platform: "x".repeat(33) }],
    ["an unknown locale", { locale: "de" as FeedbackInput["locale"] }],
    ["an unknown theme", { theme: "sepia" as FeedbackInput["theme"] }],
    ["four screenshots", { screenshots: [1, 2, 3, 1].map((n) => `${USER}/${ID}/${n}.png`) }],
  ])("refuses %s without writing", async (_label, over) => {
    expect(await sendFeedback(input(over))).toEqual({ status: "invalid" });
    expect(db.inserts).toEqual([]);
    expect(next.after).not.toHaveBeenCalled();
  });

  it.each([
    ["someone else's folder", `00000000-0000-4000-8000-0000000000bb/${ID}/1.png`],
    ["another message", `${USER}/00000000-0000-4000-8000-000000000002/1.png`],
    ["a fourth slot", `${USER}/${ID}/4.png`],
    ["slot zero", `${USER}/${ID}/0.png`],
    ["a gif", `${USER}/${ID}/1.gif`],
    ["a path that climbs out", `${USER}/${ID}/../1.png`],
    ["a path with a suffix", `${USER}/${ID}/1.png.exe`],
  ])("refuses a screenshot in %s", async (_label, path) => {
    expect(await sendFeedback(input({ screenshots: [path] }))).toEqual({ status: "invalid" });
    expect(db.inserts).toEqual([]);
  });

  it("asks a signed-out visitor to sign in", async () => {
    db.userId = null;
    expect(await sendFeedback(input())).toEqual({ status: "signed-out" });
    expect(db.inserts).toEqual([]);
  });

  it("fails on a database error without filing an issue", async () => {
    db.insert = { data: null, error: { code: "23514", message: "feedback_body_check" } };
    expect(await sendFeedback(input())).toEqual({ status: "failed" });
    expect(next.after).not.toHaveBeenCalled();
  });
});

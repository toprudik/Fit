import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ VERCEL_GIT_COMMIT_SHA: "abc123" }) }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./github", () => ({ fileFeedbackIssue: async () => "disabled" }));

const AUTHOR = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const ID = "77777777-7777-4777-8777-777777777777";

/** The session and what the insert as the user does: the database's answer and the rows it got. */
const db = vi.hoisted(() => ({
  userId: null as string | null,
  insertError: null as null | { code: string; message: string },
  rows: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    from: (table: string) => {
      expect(table).toBe("feedback");
      return {
        insert: async (row: Record<string, unknown>) => {
          if (!db.insertError) db.rows.push(row);
          return { error: db.insertError };
        },
      };
    },
  }),
}));

const { sendFeedback } = await import("./actions");

const input = (screenshots: string[] = []) => ({
  id: ID,
  kind: "bug" as const,
  requestType: null,
  consentKind: null,
  body: "The button is grey",
  route: "/client",
  zone: "client" as const,
  platform: "web",
  locale: "en" as const,
  theme: "dark" as const,
  screenshots,
});

beforeEach(() => {
  db.userId = AUTHOR;
  db.insertError = null;
  db.rows = [];
});

describe("sendFeedback", () => {
  it("writes as the signed-in user, whatever the input says", async () => {
    const result = await sendFeedback({ ...input(), user_id: OTHER } as never);
    expect(result).toEqual({ status: "sent" });
    expect(db.rows[0]?.user_id).toBe(AUTHOR);
  });

  it("refuses without a session", async () => {
    db.userId = null;
    expect(await sendFeedback(input())).toEqual({ status: "signed-out" });
    expect(db.rows).toEqual([]);
  });

  it.each([
    `${OTHER}/${ID}/1.png`,
    `${AUTHOR}/${OTHER}/1.png`,
    `${AUTHOR}/${ID}/4.png`,
    `${AUTHOR}/${ID}/1.svg`,
    `${AUTHOR}/${ID}/../../${OTHER}/x/1.png`,
  ])("refuses the screenshot path %s that is not the author's own", async (path) => {
    expect(await sendFeedback(input([path]))).toEqual({ status: "invalid" });
    expect(db.rows).toEqual([]);
  });

  it("tells the author to wait when the database's rate limit refuses the message", async () => {
    db.insertError = { code: "P0001", message: "rate_limited" };
    expect(await sendFeedback(input())).toEqual({ status: "rate-limited" });
  });

  it("reports other failures as failed", async () => {
    db.insertError = { code: "42501", message: "new row violates row-level security policy" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendFeedback(input())).toEqual({ status: "failed" });
  });
});

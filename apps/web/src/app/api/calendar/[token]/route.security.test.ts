import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

/**
 * public.calendar_feed as the database runs it: only the sha256 of an active (not revoked) token finds a feed.
 * Tokens here are invented.
 */
const TOKEN = "Abc_def-1234567890ghijklmnopqrstuvwxyzABCDE";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const db = vi.hoisted(() => ({
  feeds: new Map<string, { revoked: boolean }>(),
  calls: [] as unknown[],
  error: null as null | { code: string },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: { p_token: string }) => {
      expect(fn).toBe("calendar_feed");
      db.calls.push(args);
      if (db.error) return { data: null, error: db.error };
      const feed = db.feeds.get(createHash("sha256").update(args.p_token).digest("hex"));
      return { data: feed && !feed.revoked ? { zone: "client", locale: "en", events: [] } : null, error: null };
    },
  }),
}));

const { GET } = await import("./route");

const call = (token: string) =>
  GET(new Request(`https://fit.example/api/calendar/${token}`), { params: Promise.resolve({ token }) } as never);

beforeEach(() => {
  db.feeds = new Map([[sha(TOKEN), { revoked: false }]]);
  db.calls = [];
  db.error = null;
});

describe("GET /api/calendar/[token]", () => {
  it("serves the feed of an active token, private and not indexed", async () => {
    const response = await call(`${TOKEN}.ics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(db.calls).toEqual([{ p_token: TOKEN }]);
  });

  it("stops serving a token once it is revoked or reissued", async () => {
    db.feeds.get(sha(TOKEN))!.revoked = true;
    expect((await call(`${TOKEN}.ics`)).status).toBe(404);
  });

  it("answers the same 404 to a guessed token as to a revoked one, so a guess learns nothing", async () => {
    const guessed = await call("A".repeat(43));
    db.feeds.get(sha(TOKEN))!.revoked = true;
    const revoked = await call(TOKEN);
    expect([guessed.status, revoked.status]).toEqual([404, 404]);
    expect(await guessed.text()).toBe(await revoked.text());
  });

  it.each(["", "short", "a".repeat(19), "a".repeat(101), "../../etc/passwd", "abc%27%20or%201=1--aaaaaaaaaaa", "a b c d e f g h i j k l m"])(
    "refuses the malformed token %j before reaching the database",
    async (token) => {
      expect((await call(token)).status).toBe(404);
      expect(db.calls).toEqual([]);
    },
  );

  it("says unavailable, without details, when the database fails", async () => {
    db.error = { code: "XX000" };
    const response = await call(TOKEN);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Unavailable");
  });
});

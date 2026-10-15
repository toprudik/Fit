import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(40);
const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));
vi.mock("@/env/server", () => ({ serverEnv: () => env.value }));

/** The secret-key client: claim_outbox hands out the queued rows once, every call is recorded. */
const db = vi.hoisted(() => ({ queue: [] as unknown[], calls: [] as { fn: string; args: Record<string, unknown> }[], claimError: null as null | { code: string } }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      if (fn === "claim_outbox") {
        if (db.claimError) return { data: null, error: db.claimError };
        const rows = db.queue;
        db.queue = [];
        return { data: rows, error: null };
      }
      return { data: "sent", error: null };
    },
  }),
}));

const { POST } = await import("./route");

const call = (authorization?: string) =>
  POST(new Request("https://fit.example/api/cron/notifications", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  env.value = { CRON_SECRET: SECRET, TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_ADMIN_CHAT_ID: undefined };
  db.queue = [];
  db.calls = [];
  db.claimError = null;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }))));
});

describe("POST /api/cron/notifications", () => {
  it("answers 503 until CRON_SECRET is set", async () => {
    env.value = { ...env.value, CRON_SECRET: undefined };
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    expect(db.calls).toEqual([]);
  });

  it.each([undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`])("refuses authorization %j", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it("sends due rows and records the Telegram message id", async () => {
    db.queue = [{ outbox_id: 5, kind: "bot_test", payload: {}, chat_id: 42, chat_target: null, locale: "en", time_zone: "UTC", silent: false, attempt: 1 }];
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, blocked: 0, retried: 0, failed: 0, released: 0 });
    expect(db.calls).toEqual([
      { fn: "claim_outbox", args: { p_limit: 50 } },
      { fn: "record_outbox_result", args: { p_id: 5, p_outcome: "sent", p_telegram_message_id: 99 } },
    ]);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: 42, text: expect.stringMatching(/^Done/) });
  });

  it("answers 500 without details when the claim fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.claimError = { code: "42501" };
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "dispatch_failed" });
  });
});

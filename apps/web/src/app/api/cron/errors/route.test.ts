import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "p".repeat(40);
const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const run = vi.hoisted(() => ({ calls: 0, fail: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => env.value }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/monitoring/alerts", () => ({
  fetchNewSentryIssues: async () => [],
  postErrorAlerts: async () => {
    run.calls += 1;
    if (run.fail) throw new Error("sentry issues: HTTP 401");
    return { issues: 2, posted: 1, failed: 0 };
  },
}));

const { POST } = await import("./route");

const call = (authorization?: string) =>
  POST(new Request("https://fit.example/api/cron/errors", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  env.value = {
    CRON_SECRET: SECRET,
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_ADMIN_CHAT_ID: -100,
    SENTRY_API_TOKEN: "sntryu_" + "a".repeat(64),
    SENTRY_ORG: "dafit",
  };
  run.calls = 0;
  run.fail = false;
});

describe("POST /api/cron/errors", () => {
  it("answers 503 until CRON_SECRET is set", async () => {
    env.value = { ...env.value, CRON_SECRET: undefined };
    expect((await call("Bearer ")).status).toBe(503);
    expect(run.calls).toBe(0);
  });

  it.each([undefined, "", "Bearer wrong", SECRET, `Basic ${SECRET}`])("refuses authorization %j", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(run.calls).toBe(0);
  });

  it.each(["SENTRY_API_TOKEN", "SENTRY_ORG", "TELEGRAM_ADMIN_CHAT_ID"])("does nothing without %s", async (name) => {
    env.value = { ...env.value, [name]: undefined };
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: "not_configured" });
    expect(run.calls).toBe(0);
  });

  it("posts new issues and answers counts only", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ issues: 2, posted: 1, failed: 0 });
  });

  it("answers 500 with a code when Sentry or the database fails", async () => {
    run.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "alerts_failed" });
    errors.mockRestore();
  });
});

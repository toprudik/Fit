import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "p".repeat(40);
const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => env.value }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
const job = vi.hoisted(() => ({ runs: 0, fail: false }));
vi.mock("@/lib/account/job", () => ({
  runPrivacyJob: async () => {
    job.runs += 1;
    if (job.fail) throw new Error("storage said no for user 42");
    return { exports: 1, deletions: 0 };
  },
}));

const { POST } = await import("./route");

const call = (authorization?: string) =>
  POST(new Request("https://fit.example/api/cron/privacy", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  env.value = { CRON_SECRET: SECRET, TELEGRAM_BOT_TOKEN: "123:abc" };
  job.runs = 0;
  job.fail = false;
});

describe("POST /api/cron/privacy", () => {
  it("answers 503 until CRON_SECRET is set, even to an empty Bearer", async () => {
    env.value = { ...env.value, CRON_SECRET: undefined };
    expect((await call("Bearer ")).status).toBe(503);
    expect((await call("Bearer undefined")).status).toBe(503);
    expect(job.runs).toBe(0);
  });

  it.each([undefined, "", "Bearer wrong", SECRET, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, `Basic ${SECRET}`])(
    "refuses authorization %j",
    async (header) => {
      expect((await call(header)).status).toBe(401);
      expect(job.runs).toBe(0);
    },
  );

  it("runs the job for pg_cron and answers counts only", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exports: 1, deletions: 0 });
    expect(job.runs).toBe(1);
  });

  it("answers 500 without the error's text", async () => {
    job.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("42");
    errors.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(40);
const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => env.value }));

/** The secret-key client is only handed through; the job itself is tested in lib/account. */
const admin = vi.hoisted(() => ({ marker: "admin-client" }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => admin }));
const runPrivacyJob = vi.hoisted(() =>
  vi.fn<(admin: unknown, budget: number, send: (message: unknown) => Promise<unknown>) => Promise<Record<string, number>>>(async () => ({
    expired: 1,
    built: 2,
    failed: 0,
    purged: 3,
    retained: 4,
  })),
);
vi.mock("@/lib/account/job", () => ({ runPrivacyJob }));
const sendTelegramMessage = vi.hoisted(() => vi.fn<(token: string, message: unknown) => Promise<unknown>>(async () => ({ ok: true, messageId: 7 })));
vi.mock("@/lib/notifications/telegram", () => ({ sendTelegramMessage }));

const { POST, maxDuration } = await import("./route");

const call = (authorization?: string) =>
  POST(new Request("https://fit.example/api/cron/privacy", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  env.value = { CRON_SECRET: SECRET, TELEGRAM_BOT_TOKEN: "123:abc" };
});

describe("POST /api/cron/privacy", () => {
  it("answers 503 until CRON_SECRET is set", async () => {
    env.value = { ...env.value, CRON_SECRET: undefined };
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
    expect(runPrivacyJob).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`, `bearer ${SECRET}`, `Bearer  ${SECRET}`])("refuses authorization %j", async (header) => {
    const response = await call(header);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(runPrivacyJob).not.toHaveBeenCalled();
  });

  it("runs the job within its budget and answers the counts", async () => {
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 1, built: 2, failed: 0, purged: 3, retained: 4 });
    const [client, budget] = runPrivacyJob.mock.calls[0];
    expect(client).toBe(admin);
    // The job stops taking work well before Vercel stops the function.
    expect(budget).toBeLessThan(maxDuration * 1000);
  });

  it("sends the job's Telegram messages with the bot token", async () => {
    await call(`Bearer ${SECRET}`);
    const send = runPrivacyJob.mock.calls[0][2];
    const message = { chatId: 42, text: "Your archive is ready" };

    expect(await send(message)).toEqual({ ok: true, messageId: 7 });
    expect(sendTelegramMessage).toHaveBeenCalledWith("123:abc", message);
  });

  it("answers 500 without details when the job fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runPrivacyJob.mockRejectedValueOnce(new Error("claim_data_exports failed: 42501"));
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "privacy_failed" });
    expect(error).toHaveBeenCalledWith("privacy job failed", "claim_data_exports failed: 42501");
  });
});

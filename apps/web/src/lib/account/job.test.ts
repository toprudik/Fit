import { describe, expect, it, vi } from "vitest";
import type { OutgoingMessage } from "@/lib/notifications/telegram";

vi.mock("server-only", () => ({}));

const { runPrivacyJob } = await import("./job");

const USER = "0b6f0d4e-1c2a-4b3d-8e9f-0a1b2c3d4e5f";
const CHAT = 424242;

type Admin = Parameters<typeof runPrivacyJob>[0];

/**
 * An admin client with one due deletion: each table answers with `tables[name]` whatever the filters, so the test
 * pins what the job does with the answers, not the query text.
 */
function fakeAdmin(options: { purged: string[] | null; telegramId?: number | null; botBlocked?: boolean; locale?: string }) {
  const tables: Record<string, unknown> = {
    account_deletions: [{ user_id: USER }],
    data_exports: [],
    profiles: [],
  };
  const single: Record<string, unknown> = {
    profiles:
      options.telegramId === null
        ? null
        : { telegram_id: options.telegramId ?? CHAT, bot_blocked_at: options.botBlocked ? "2026-10-01T00:00:00Z" : null },
    user_settings: { locale: options.locale ?? "ru" },
  };
  const query = (table: string) => {
    const builder: Record<string, unknown> = {
      maybeSingle: async () => ({ data: single[table] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
    };
    for (const method of ["select", "eq", "is", "lte", "order", "limit", "update"]) builder[method] = () => builder;
    return builder;
  };
  const deleted: string[] = [];
  const admin = {
    from: query,
    rpc: async (fn: string) =>
      fn === "purge_account" ? { data: options.purged, error: null } : { data: [], error: null },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleted.push(id);
          return { error: null };
        },
      },
    },
  };
  return { admin: admin as unknown as Admin, deleted };
}

describe("runPrivacyJob, due deletions (С5)", () => {
  it("tells the user in their language once the account is deleted", async () => {
    const { admin, deleted } = fakeAdmin({ purged: [USER], locale: "en" });
    const sent: OutgoingMessage[] = [];
    const summary = await runPrivacyJob(admin, 10_000, async (message) => {
      sent.push(message);
      return { ok: true, messageId: 1 };
    });
    expect(deleted).toEqual([USER]);
    expect(summary.purged).toBe(1);
    expect(sent).toEqual([
      { chatId: CHAT, text: "Your DaFit account is deleted. If you want to come back, just open DaFit again.", silent: false, buttons: [] },
    ]);
  });

  it("says nothing when nothing was due, there is no chat or the bot is blocked", async () => {
    const send = vi.fn();
    await runPrivacyJob(fakeAdmin({ purged: null }).admin, 10_000, send);
    await runPrivacyJob(fakeAdmin({ purged: [USER], telegramId: null }).admin, 10_000, send);
    await runPrivacyJob(fakeAdmin({ purged: [USER], botBlocked: true }).admin, 10_000, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("finishes the run when Telegram refuses or throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refused = await runPrivacyJob(fakeAdmin({ purged: [USER] }).admin, 10_000, async () => ({
      ok: false,
      kind: "chat_unavailable",
      error: "telegram_403",
    }));
    const thrown = await runPrivacyJob(fakeAdmin({ purged: [USER] }).admin, 10_000, async () => {
      throw new TypeError("fetch failed");
    });
    expect([refused.purged, thrown.purged]).toEqual([1, 1]);
    expect(error.mock.calls.flat().join(" ")).not.toContain(String(CHAT));
    error.mockRestore();
  });
});

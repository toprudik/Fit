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
type DueFile = { kind: string; id: string; bucket: string; paths: string[] };

function fakeAdmin(options: {
  purged?: string[] | null;
  telegramId?: number | null;
  botBlocked?: boolean;
  locale?: string;
  erasures?: string[];
  erased?: boolean;
  due?: DueFile[];
  removeFails?: boolean;
  staleCsv?: string[];
}) {
  const tables: Record<string, unknown> = {
    account_deletions: options.purged === undefined ? [] : [{ user_id: USER }],
    health_erasures: (options.erasures ?? []).map((user_id) => ({ user_id })),
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
  const calls: string[] = [];
  const listed: string[] = [];
  const removed: string[] = [];
  const forgotten: string[] = [];
  const admin = {
    from: query,
    rpc: async (fn: string, args?: { p_user?: string; p_kind?: string; p_id?: string }) => {
      calls.push(`${fn}(${args?.p_user ?? ""})`);
      if (fn === "purge_account") return { data: options.purged, error: null };
      if (fn === "purge_health_data") return { data: options.erased ?? true, error: null };
      if (fn === "retention_due_files") return { data: options.due ?? [], error: null };
      if (fn === "stale_csv_downloads") return { data: options.staleCsv ?? [], error: null };
      if (fn === "retention_forget") {
        forgotten.push(`${args?.p_kind}:${args?.p_id}`);
        return { data: true, error: null };
      }
      return { data: [], error: null };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string) => {
          listed.push(`${bucket}/${folder}`);
          return { data: [], error: null };
        },
        remove: async (paths: string[]) => {
          if (options.removeFails) return { error: { name: "StorageApiError" } };
          removed.push(...paths.map((path) => `${bucket}/${path}`));
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleted.push(id);
          return { error: null };
        },
      },
    },
  };
  return { admin: admin as unknown as Admin, deleted, calls, listed, removed, forgotten };
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

describe("runPrivacyJob, health data erasures (право 5)", () => {
  it("removes the progress photo files, then erases the rows of each due erasure", async () => {
    const { admin, calls, listed } = fakeAdmin({ erasures: [USER] });
    const summary = await runPrivacyJob(admin, 10_000);
    expect(listed).toContain(`progress-photos/${USER}`);
    expect(calls).toContain(`purge_health_data(${USER})`);
    expect(summary.healthErased).toBe(1);
  });

  it("does not count an erasure the database found not due", async () => {
    const { admin } = fakeAdmin({ erasures: [USER], erased: false });
    expect((await runPrivacyJob(admin, 10_000)).healthErased).toBe(0);
  });
});

describe("runPrivacyJob, files past their retention", () => {
  const due: DueFile[] = [
    { kind: "feedback", id: "f1", bucket: "feedback", paths: ["u/f1/1.png", "u/f1/2.png"] },
    { kind: "certificate", id: "c1", bucket: "certificates", paths: ["t/c1.pdf"] },
  ];

  it("removes the files, then forgets the rows", async () => {
    const { admin, removed, forgotten } = fakeAdmin({ purged: null, due });
    const summary = await runPrivacyJob(admin, 10_000);
    expect(removed).toEqual(["feedback/u/f1/1.png", "feedback/u/f1/2.png", "certificates/t/c1.pdf"]);
    expect(forgotten).toEqual(["feedback:f1", "certificate:c1"]);
    expect(summary.retained).toBe(2);
  });

  it("keeps the row when its files could not be removed", async () => {
    const { admin, forgotten } = fakeAdmin({ purged: null, due, removeFails: true });
    await expect(runPrivacyJob(admin, 10_000)).rejects.toThrow("removing from feedback failed");
    expect(forgotten).toEqual([]);
  });
});

describe("runPrivacyJob, CSV copies for Telegram's download dialog", () => {
  it("removes the stale copies from the exports bucket", async () => {
    const { admin, removed } = fakeAdmin({ staleCsv: [`${USER}/csv/a.csv`, `${USER}/csv/b.csv`] });
    const summary = await runPrivacyJob(admin, 10_000);
    expect(removed).toEqual([`exports/${USER}/csv/a.csv`, `exports/${USER}/csv/b.csv`]);
    expect(summary.csvRemoved).toBe(2);
  });

  it("calls nothing in Storage while no copy is stale", async () => {
    const { admin, removed } = fakeAdmin({});
    expect((await runPrivacyJob(admin, 10_000)).csvRemoved).toBe(0);
    expect(removed).toEqual([]);
  });
});

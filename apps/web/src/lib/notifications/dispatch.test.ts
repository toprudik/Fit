import { describe, expect, it } from "vitest";
import { BATCH_SIZE, dispatchOutbox, type ClaimedRow, type DispatchDeps, type RecordedResult } from "./dispatch";
import type { OutgoingMessage, SendResult } from "./telegram";

let nextId = 1;
const row = (overrides: Partial<ClaimedRow> = {}): ClaimedRow => ({
  outbox_id: nextId++,
  kind: "bot_test",
  payload: {},
  chat_id: 100,
  chat_target: null as unknown as string,
  locale: "ru",
  time_zone: "UTC",
  silent: false,
  attempt: 1,
  ...overrides,
});

/** A dispatcher run against a fake outbox, Bot API and clock. Sends take 10 ms of fake time. */
function harness(batches: ClaimedRow[][], answers: (message: OutgoingMessage) => SendResult = () => ({ ok: true, messageId: 1 })) {
  let clock = 0;
  const sent: { at: number; message: OutgoingMessage }[] = [];
  const recorded: { id: number; result: RecordedResult }[] = [];
  const claims: number[] = [];
  const deps: DispatchDeps = {
    claim: async (limit) => {
      claims.push(limit);
      return batches.shift() ?? [];
    },
    record: async (id, result) => {
      recorded.push({ id, result });
    },
    send: async (message) => {
      sent.push({ at: clock, message });
      clock += 10;
      return answers(message);
    },
    render: (claimed, { group }) => (claimed.kind === "bot_test" ? { text: `text ${claimed.outbox_id}`, buttons: group ? [{ text: "Open", url: "https://x" }] : [] } : null),
    adminChatId: undefined,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    budgetMs: 40_000,
  };
  return { deps, sent, recorded, claims, advance: (ms: number) => (clock += ms) };
}

describe("dispatchOutbox", () => {
  it("sends every claimed row and records each one", async () => {
    const rows = [row({ chat_id: 1 }), row({ chat_id: 2, silent: true })];
    const h = harness([rows]);
    const summary = await dispatchOutbox(h.deps);

    expect(summary).toEqual({ claimed: 2, sent: 2, blocked: 0, retried: 0, failed: 0, released: 0 });
    expect(h.sent.map((s) => s.message)).toEqual([
      { chatId: 1, text: `text ${rows[0].outbox_id}`, silent: false, buttons: [] },
      { chatId: 2, text: `text ${rows[1].outbox_id}`, silent: true, buttons: [] },
    ]);
    expect(h.recorded).toEqual(rows.map((r) => ({ id: r.outbox_id, result: { outcome: "sent", messageId: 1 } })));
    expect(h.claims).toEqual([BATCH_SIZE]);
  });

  it("keeps a second apart between messages to one chat and 40 ms between any two", async () => {
    const h = harness([[row({ chat_id: 1 }), row({ chat_id: 2 }), row({ chat_id: 1 })]]);
    await dispatchOutbox(h.deps);
    const times = h.sent.map((s) => s.at);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(40);
    expect(times[2] - times[0]).toBeGreaterThanOrEqual(1100);
  });

  it("claims the next batch while batches come back full", async () => {
    const full = Array.from({ length: BATCH_SIZE }, (_, i) => row({ chat_id: 1000 + i }));
    const h = harness([full, [row()]]);
    const summary = await dispatchOutbox(h.deps);
    expect(h.claims).toHaveLength(2);
    expect(summary.sent).toBe(BATCH_SIZE + 1);
  });

  it("sorts failures into blocked, retry and failed", async () => {
    const rows = [row({ chat_id: 1 }), row({ chat_id: 2 }), row({ chat_id: 3 })];
    const answers: Record<number, SendResult> = {
      1: { ok: false, kind: "chat_unavailable", error: "telegram_403" },
      2: { ok: false, kind: "retry", error: "telegram_502" },
      3: { ok: false, kind: "rejected", error: "telegram_400: bad" },
    };
    const h = harness([rows], (message) => answers[message.chatId]);
    await dispatchOutbox(h.deps);
    expect(h.recorded.map((r) => r.result)).toEqual([
      { outcome: "blocked", error: "telegram_403" },
      { outcome: "retry", error: "telegram_502" },
      { outcome: "failed", error: "telegram_400: bad" },
    ]);
  });

  it("stops at a rate limit and hands the rest back without using their attempts", async () => {
    const rows = [row({ chat_id: 1 }), row({ chat_id: 2 }), row({ chat_id: 3 })];
    const h = harness([rows], (message) =>
      message.chatId === 2 ? { ok: false, kind: "rate_limited", error: "telegram_429", retryAfter: 9 } : { ok: true, messageId: 5 },
    );
    const summary = await dispatchOutbox(h.deps);
    expect(h.sent).toHaveLength(2);
    expect(h.recorded.map((r) => [r.id, r.result.outcome])).toEqual([
      [rows[0].outbox_id, "sent"],
      [rows[1].outbox_id, "release"],
      [rows[2].outbox_id, "release"],
    ]);
    expect(h.recorded[2].result).toEqual({ outcome: "release", error: "telegram_429", retryAfter: 9 });
    expect(summary.released).toBe(2);
  });

  it("hands everything back when the token is rejected", async () => {
    const h = harness([[row(), row()]], () => ({ ok: false, kind: "unauthorized", error: "telegram_401" }));
    const summary = await dispatchOutbox(h.deps);
    expect(summary).toMatchObject({ sent: 0, released: 2, failed: 0 });
  });

  it("sends team chat rows to the configured group, and fails them while there is none", async () => {
    const group = row({ chat_id: null as unknown as number, chat_target: "admin_group" });
    const unconfigured = harness([[group]]);
    await dispatchOutbox(unconfigured.deps);
    expect(unconfigured.recorded[0].result).toEqual({ outcome: "failed", error: "admin_chat_not_configured" });

    const configured = harness([[{ ...group }]]);
    configured.deps.adminChatId = -100123;
    await dispatchOutbox(configured.deps);
    expect(configured.sent[0].message).toMatchObject({ chatId: -100123, buttons: [{ text: "Open", url: "https://x" }] });
  });

  it("fails a team group the bot cannot write to instead of marking a user", async () => {
    const h = harness([[row({ chat_id: null as unknown as number, chat_target: "admin_group" })]], () => ({ ok: false, kind: "chat_unavailable", error: "telegram_403" }));
    h.deps.adminChatId = -1;
    await dispatchOutbox(h.deps);
    expect(h.recorded[0].result).toEqual({ outcome: "failed", error: "telegram_403" });
  });

  it("fails a type without a template", async () => {
    const h = harness([[row({ kind: "booking_assigned" })]]);
    await dispatchOutbox(h.deps);
    expect(h.sent).toHaveLength(0);
    expect(h.recorded[0].result).toEqual({ outcome: "failed", error: "no_template" });
  });

  it("fails a row its template can't render and sends the rows after it", async () => {
    const rows = [row({ chat_id: 1 }), row({ chat_id: 2 })];
    const h = harness([rows]);
    const render = h.deps.render;
    h.deps.render = (claimed, options) => {
      if (claimed.outbox_id === rows[0].outbox_id) throw new RangeError("Invalid time value");
      return render(claimed, options);
    };
    const summary = await dispatchOutbox(h.deps);
    expect(h.recorded.map((r) => r.result)).toEqual([
      { outcome: "failed", error: "render_failed" },
      { outcome: "sent", messageId: 1 },
    ]);
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
  });

  it("fails a malformed date in a real template instead of stopping the run", async () => {
    const { renderMessage } = await import("./messages");
    const rows = [row({ kind: "session_reminder", payload: { starts_at: "not a date" } }), row({ chat_id: 2 })];
    const h = harness([rows]);
    h.deps.render = (claimed, { group }) =>
      claimed.kind === "bot_test" ? { text: "ok", buttons: [] } : renderMessage(claimed, { appUrl: "https://fit.example", group });
    await dispatchOutbox(h.deps);
    expect(h.recorded.map((r) => r.result.outcome)).toEqual(["failed", "sent"]);
  });

  it("hands back what it could not send in time", async () => {
    const rows = [row({ chat_id: 1 }), row({ chat_id: 2 })];
    const h = harness([rows], () => {
      h.advance(40_000);
      return { ok: true, messageId: 1 };
    });
    await dispatchOutbox(h.deps);
    expect(h.recorded.map((r) => r.result.outcome)).toEqual(["sent", "release"]);
  });

  it("keeps going when recording one result fails", async () => {
    const h = harness([[row({ chat_id: 1 }), row({ chat_id: 2 })]]);
    const record = h.deps.record;
    let calls = 0;
    h.deps.record = async (id, result) => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      await record(id, result);
    };
    const summary = await dispatchOutbox(h.deps);
    expect(h.sent).toHaveLength(2);
    expect(summary.sent).toBe(2);
  });
});

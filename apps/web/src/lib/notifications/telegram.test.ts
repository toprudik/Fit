import { describe, expect, it, vi } from "vitest";
import { classifyFailure, sendTelegramMessage, type OutgoingMessage } from "./telegram";

const TOKEN = "123456:TEST-token_for-unit-tests";
const message: OutgoingMessage = { chatId: 42, text: "Hi", silent: true, buttons: [{ text: "Open", web_app: { url: "https://fit.example/?source=bot_test" } }] };

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("sendTelegramMessage", () => {
  it("posts one sendMessage with HTML, silence and one button per row", async () => {
    const fetchImpl = answer(200, { ok: true, result: { message_id: 7 } });
    await expect(sendTelegramMessage(TOKEN, message, fetchImpl)).resolves.toEqual({ ok: true, messageId: 7 });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: 42,
      text: "Hi",
      parse_mode: "HTML",
      disable_notification: true,
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "Open", web_app: { url: "https://fit.example/?source=bot_test" } }]] },
    });
  });

  it("sends no keyboard when there are no buttons", async () => {
    const fetchImpl = answer(200, { ok: true, result: { message_id: 1 } });
    await sendTelegramMessage(TOKEN, { ...message, buttons: [] }, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("reply_markup");
  });

  it("never lets a network error, which may hold the URL with the token, into the result", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`fetch failed: https://api.telegram.org/bot${TOKEN}/sendMessage`);
    });
    const result = await sendTelegramMessage(TOKEN, message, fetchImpl);
    expect(result).toEqual({ ok: false, kind: "retry", error: "network_error" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("treats an unreadable answer as a temporary fault", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(sendTelegramMessage(TOKEN, message, fetchImpl)).resolves.toEqual({ ok: false, kind: "retry", error: "telegram_502" });
  });
});

describe("classifyFailure", () => {
  it.each([
    [403, { error_code: 403, description: "Forbidden: bot was blocked by the user" }, { kind: "chat_unavailable", error: "telegram_403" }],
    [400, { error_code: 400, description: "Bad Request: chat not found" }, { kind: "chat_unavailable", error: "telegram_400_chat_not_found" }],
    [400, { error_code: 400, description: "Bad Request: can't parse entities" }, { kind: "rejected", error: "telegram_400: Bad Request: can't parse entities" }],
    [429, { error_code: 429, description: "Too Many Requests", parameters: { retry_after: 12 } }, { kind: "rate_limited", error: "telegram_429", retryAfter: 12 }],
    [401, { error_code: 401, description: "Unauthorized" }, { kind: "unauthorized", error: "telegram_401" }],
    [500, { error_code: 500, description: "Internal Server Error" }, { kind: "retry", error: "telegram_500" }],
  ])("sorts %i %j", (status, body, expected) => {
    expect(classifyFailure(status, body)).toEqual({ ok: false, ...expected });
  });

  it("waits 5 seconds when a rate limit names no time", () => {
    expect(classifyFailure(429, null)).toMatchObject({ kind: "rate_limited", retryAfter: 5 });
  });
});

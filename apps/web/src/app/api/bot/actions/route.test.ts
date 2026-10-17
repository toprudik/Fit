import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "123:abc";
const SECRET = createHmac("sha256", TOKEN).update("dafit/bot-actions/v1").digest("hex");
const BOOKING = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_TOKEN: TOKEN }) }));

/** The tapping user's session: whether the account exists, their DaFit language and what decide_booking answers. */
const user = vi.hoisted(() => ({
  exists: true,
  locale: "ru" as string | null,
  error: null as null | { message: string; code: string },
  calls: [] as { telegramId: number; fn: string; args: unknown }[],
}));
vi.mock("@/lib/bot-actions/act-as", () => ({
  asTelegramUser: async (telegramId: number, work: (supabase: unknown, userId: string) => Promise<unknown>) => {
    if (!user.exists) return null;
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: user.locale ? { locale: user.locale } : null }) }) }) }),
      rpc: async (fn: string, args: unknown) => {
        user.calls.push({ telegramId, fn, args });
        return { data: user.error ? null : "confirmed", error: user.error };
      },
    };
    return work(supabase, "user-1");
  },
}));

const { POST } = await import("./route");

const call = (body: unknown, authorization: string | null = `Bearer ${SECRET}`) =>
  POST(
    new Request("https://fit.example/api/bot/actions", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  user.exists = true;
  user.locale = "ru";
  user.error = null;
  user.calls = [];
});

describe("POST /api/bot/actions", () => {
  it.each([null, "Bearer wrong", SECRET, `Bearer ${SECRET}x`])("refuses authorization %j", async (header) => {
    expect((await call({ telegram_id: 7, data: `bky:${BOOKING}` }, header)).status).toBe(401);
    expect(user.calls).toEqual([]);
  });

  it.each(["{", { data: `bky:${BOOKING}` }, { telegram_id: -1, data: "bky" }, { telegram_id: 7, data: "x".repeat(65) }])(
    "refuses body %j",
    async (body) => {
      expect((await call(body)).status).toBe(400);
    },
  );

  it("confirms a request as the tapping user and answers in their DaFit language", async () => {
    user.locale = "en";
    const response = await call({ telegram_id: 7, data: `bky:${BOOKING}`, language_code: "ru" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notice: "Booking confirmed. The client will get a message.",
      resolved: true,
      line: "Confirmed.",
    });
    expect(user.calls).toEqual([{ telegramId: 7, fn: "decide_booking", args: { p_booking_id: BOOKING, p_accept: true } }]);
  });

  it("declines a request", async () => {
    const response = await call({ telegram_id: 7, data: `bkn:${BOOKING}` });
    expect(await response.json()).toEqual({ notice: "Запрос отклонён. Клиенту придёт сообщение.", resolved: true, line: "Отклонено." });
    expect(user.calls[0].args).toEqual({ p_booking_id: BOOKING, p_accept: false });
  });

  it("closes a request that no longer waits for this user", async () => {
    user.error = { message: "request_not_found", code: "P0001" };
    expect(await (await call({ telegram_id: 7, data: `bky:${BOOKING}` })).json()).toEqual({
      notice: "Этот запрос уже не ждёт ответа.",
      resolved: true,
      line: "Запрос уже закрыт.",
    });
  });

  it("keeps the buttons when the decision failed for another reason", async () => {
    user.error = { message: "boom", code: "XX000" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await call({ telegram_id: 7, data: `bky:${BOOKING}` })).json()).toEqual({
      notice: "Не получилось. Ответь на запрос в приложении.",
      resolved: false,
    });
  });

  it("asks someone without an account to sign in, in their Telegram language", async () => {
    user.exists = false;
    expect(await (await call({ telegram_id: 7, data: `bky:${BOOKING}`, language_code: "en-GB" })).json()).toEqual({
      notice: "Sign in to DaFit to answer requests.",
      resolved: false,
    });
  });

  it("does nothing with data it does not know", async () => {
    expect(await (await call({ telegram_id: 7, data: "zz:1" })).json()).toEqual({
      notice: "Не получилось. Ответь на запрос в приложении.",
      resolved: false,
    });
    expect(user.calls).toEqual([]);
  });
});

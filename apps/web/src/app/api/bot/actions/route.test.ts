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
  /** Answers by function name; decide_booking falls back to error above. */
  results: {} as Record<string, { data: unknown; error: null | { message: string; code: string } }>,
  calls: [] as { telegramId: number; fn: string; args: unknown }[],
}));
vi.mock("@/lib/bot-actions/act-as", () => ({
  asTelegramUser: async (telegramId: number, work: (supabase: unknown, userId: string) => Promise<unknown>) => {
    if (!user.exists) return null;
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: user.locale ? { locale: user.locale } : null }) }) }) }),
      rpc: async (fn: string, args: unknown) => {
        user.calls.push({ telegramId, fn, args });
        return user.results[fn] ?? { data: user.error ? null : "confirmed", error: user.error };
      },
    };
    return work(supabase, "user-1");
  },
}));

/** The tap limit per Telegram account: whether it allows the next tap, and what it counted. */
const limits = vi.hoisted(() => ({ allow: true, hits: [] as [string, string][] }));
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { botAction: { bucket: "bot:action", limit: 30, windowSeconds: 60 } },
  withinRateLimit: async ({ bucket }: { bucket: string }, subject: string) => {
    limits.hits.push([bucket, subject]);
    return limits.allow;
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
  user.results = {};
  user.calls = [];
  limits.allow = true;
  limits.hits = [];
});

describe("POST /api/bot/actions limits", () => {
  it("answers 429 past the tap limit of the Telegram account and acts on nothing", async () => {
    limits.allow = false;
    const response = await call({ telegram_id: 7, data: `bky:${BOOKING}` });
    expect(response.status).toBe(429);
    expect(limits.hits).toEqual([["bot:action", "7"]]);
    expect(user.calls).toEqual([]);
  });

  it("counts nothing for a caller without the bot's secret or with a bad body", async () => {
    await call({ telegram_id: 7, data: `bky:${BOOKING}` }, "Bearer wrong");
    await call({ telegram_id: -1, data: "bky" });
    expect(limits.hits).toEqual([]);
  });
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

  describe("claims (Т7a)", () => {
    const CLAIM = "9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0";
    const CARD = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const claim = (fields: Record<string, unknown>) => ({
      data: { status: "pending", limit_full: false, cards: [{ id: CARD, name: "Аня" }], ...fields },
      error: null,
    });
    const tap = async (data: string) => (await call({ telegram_id: 7, data })).json();

    it("merges into the only card and names it", async () => {
      user.results.get_managed_client_claim = claim({});
      user.results.resolve_managed_client_claim = { data: "pair", error: null };
      expect(await tap(`mcy:${CLAIM}`)).toEqual({
        notice: "Готово, история карточки теперь у этого клиента.",
        resolved: true,
        line: "Это Аня. Карточка объединена с клиентом.",
      });
      expect(user.calls.map((c) => [c.fn, c.args])).toEqual([
        ["get_managed_client_claim", { p_claim_id: CLAIM }],
        ["resolve_managed_client_claim", { p_claim_id: CLAIM, p_managed_client_id: CARD }],
      ]);
    });

    it("leaves the choice between several cards to the app", async () => {
      user.results.get_managed_client_claim = claim({ cards: [{ id: CARD, name: "Аня" }, { id: CLAIM, name: "Аня К." }] });
      expect(await tap(`mcy:${CLAIM}`)).toEqual({ notice: "Карточек без аккаунта несколько. Выбери нужную в приложении.", resolved: false });
      expect(user.calls.map((c) => c.fn)).toEqual(["get_managed_client_claim"]);
    });

    it("says there is no card to merge", async () => {
      user.results.get_managed_client_claim = claim({ cards: [] });
      expect(await tap(`mcy:${CLAIM}`)).toEqual({ notice: "У тебя нет карточек без аккаунта. Нажми «Новый клиент».", resolved: false });
    });

    it("keeps a new client", async () => {
      user.results.get_managed_client_claim = claim({});
      user.results.resolve_managed_client_claim = { data: "pair", error: null };
      expect(await tap(`mcn:${CLAIM}`)).toEqual({
        notice: "Готово, это новый клиент.",
        resolved: true,
        line: "Новый клиент. Карточки остались как были.",
      });
      expect(user.calls[1]).toMatchObject({ fn: "resolve_managed_client_claim", args: { p_claim_id: CLAIM } });
    });

    it("sends a new client on a full Free plan to the app", async () => {
      user.results.get_managed_client_claim = claim({ limit_full: true });
      expect(await tap(`mcn:${CLAIM}`)).toEqual({ notice: "На тарифе Free новая пара закроется. Ответь в приложении.", resolved: false });
      expect(user.calls.map((c) => c.fn)).toEqual(["get_managed_client_claim"]);
    });

    it.each([
      ["already answered", claim({ status: "merged" })],
      ["not this trainer's", { data: null, error: { message: "claim_not_found", code: "P0001" } }],
    ])("closes a claim that is %s", async (_name, result) => {
      user.results.get_managed_client_claim = result;
      expect(await tap(`mcy:${CLAIM}`)).toEqual({ notice: "Этот запрос уже не ждёт ответа.", resolved: true, line: "Запрос уже закрыт." });
    });
  });

  describe("contact requests (С1)", () => {
    const REQUEST = "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d";
    const tap = async (data: string) => (await call({ telegram_id: 7, data })).json();
    const decline = (data: unknown, error: null | { message: string; code: string } = null) => {
      user.results.decline_contact_request = { data, error };
    };

    it("declines as the tapping user", async () => {
      decline("declined");
      expect(await tap(`ctn:${REQUEST}`)).toEqual({
        notice: "Хорошо, номер не отправим. Собеседник узнает об отказе.",
        resolved: true,
        line: "Контакт не отправлен.",
      });
      expect(user.calls).toEqual([{ telegramId: 7, fn: "decline_contact_request", args: { p_request_id: REQUEST } }]);
    });

    it("says the contact is already shared", async () => {
      decline("accepted");
      expect(await tap(`ctn:${REQUEST}`)).toEqual({ notice: "Контакт уже отправлен.", resolved: true, line: "Контакт уже отправлен." });
    });

    it.each([
      ["expired", ["expired", null]],
      ["not addressed to this user", [null, { message: "request_not_found", code: "P0001" }]],
    ] as const)("closes a request that is %s", async (_name, [data, error]) => {
      decline(data, error);
      expect(await tap(`ctn:${REQUEST}`)).toEqual({ notice: "Этот запрос уже не ждёт ответа.", resolved: true, line: "Запрос уже закрыт." });
    });

    it("keeps the button when declining failed", async () => {
      decline(null, { message: "boom", code: "XX000" });
      expect(await tap(`ctn:${REQUEST}`)).toEqual({ notice: "Не получилось. Ответь на запрос в приложении.", resolved: false });
    });
  });
});

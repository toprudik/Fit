import { describe, expect, it } from "vitest";
import { escapeHtml, renderMessage } from "./messages";

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const row = { kind: "bot_test" as const, locale: "ru" as const, time_zone: "Europe/Moscow", payload: {} };

describe("renderMessage", () => {
  it("writes in the recipient's language", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: false })?.text).toMatch(/^Готово/);
    expect(renderMessage({ ...row, locale: "en" }, { appUrl: "https://fit.example", group: false })?.text).toMatch(/^Done/);
  });

  it("opens the Mini App with the source mark in a private chat", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: false })?.buttons).toEqual([
      { text: "Открыть DaFit", web_app: { url: "https://fit.example/?source=bot_test" } },
    ]);
  });

  it("uses a plain link in a group, where Telegram allows no Mini App buttons", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: true })?.buttons).toEqual([
      { text: "Открыть DaFit", url: "https://fit.example/?source=bot_test" },
    ]);
  });

  it("drops buttons for a local http app URL, which Telegram would refuse", () => {
    expect(renderMessage(row, { appUrl: "http://localhost:3000", group: false })?.buttons).toEqual([]);
  });

  it("tells the trainer about a new client by name, escaped, with a button to the client card", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", payload: { coaching_id: PAIR, first_name: "Анна", last_name: "<Смирнова>" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Новый клиент: Анна &lt;Смирнова&gt;",
      buttons: [{ text: "Открыть клиента", web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=coaching_created` } }],
    });
  });

  it("opens the client list when the pair id is not a uuid", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", payload: { coaching_id: "../admin", first_name: "Анна" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.buttons).toEqual([
      { text: "Открыть клиента", web_app: { url: "https://fit.example/trainer/clients?source=coaching_created" } },
    ]);
  });

  it("names a client without a name neutrally", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", locale: "en", payload: { first_name: null, last_name: " " } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("New client: a client with no name");
  });

  it("asks the trainer with cards to check them when someone joins", () => {
    const message = renderMessage(
      { ...row, kind: "managed_client_claim", payload: { claim_id: "c1", first_name: "Иван" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Иван теперь среди твоих клиентов. Проверь, нет ли у тебя карточки этого человека без аккаунта.");
  });

  it("tells the trainer a client left, with the number of cancelled sessions (Т9)", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", payload: { coaching_id: PAIR, ended_by: "client", cancelled: 2, first_name: "Анна" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Анна больше не занимается у тебя. Будущих занятий отменено: 2.",
      buttons: [{ text: "Открыть клиента", web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=coaching_ended` } }],
    });
  });

  it("leaves the count out when no session was cancelled", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", locale: "en", payload: { ended_by: "client", cancelled: 0, first_name: "Ann" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Ann no longer trains with you.");
  });

  it("tells the client the trainer ended the pair and opens the client zone", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", payload: { coaching_id: PAIR, ended_by: "trainer", cancelled: 1, first_name: "Иван" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Занятия с тренером Иван завершены. Будущие записи отменены без списаний.",
      buttons: [{ text: "Открыть тренера", web_app: { url: `https://fit.example/client/trainers/${PAIR}?source=coaching_ended` } }],
    });
  });

  it("returns null for a type without a template yet", () => {
    expect(renderMessage({ ...row, kind: "booking_assigned" }, { appUrl: "https://fit.example", group: false })).toBeNull();
  });
});

describe("verification messages", () => {
  const options = { appUrl: "https://fit.example", group: false };

  it("tells a verified trainer about the badge and opens the verification screen (С3)", () => {
    const message = renderMessage({ ...row, kind: "verification_result", payload: { decision: "verified" } }, options);
    expect(message?.text).toMatch(/^Верификация пройдена/);
    expect(message?.buttons).toEqual([
      { text: "Открыть верификацию", web_app: { url: "https://fit.example/trainer/verification?source=verification_result" } },
    ]);
  });

  it("gives a rejected trainer the reason, escaped", () => {
    const message = renderMessage(
      { ...row, kind: "verification_result", payload: { decision: "rejected", reason: "Скан <нечитаемый>" } },
      options,
    );
    expect(message?.text).toContain("причина: «Скан &lt;нечитаемый&gt;»");
  });

  it("names the trainer and the number of documents for the admin group (А1)", () => {
    const message = renderMessage(
      { ...row, kind: "verification_submitted", payload: { trainer_name: "Ivan & Co", documents: 3 } },
      { ...options, group: true },
    );
    expect(message?.text).toBe("Новая заявка на верификацию: Ivan &amp; Co, документов: 3.");
    expect(message?.buttons).toEqual([{ text: "Открыть очередь", url: "https://fit.example/admin/verification?source=verification_submitted" }]);
  });
});

describe("escapeHtml", () => {
  it("escapes what parse_mode HTML treats as markup", () => {
    expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  });
});

describe("plan messages", () => {
  const options = { appUrl: "https://fit.example", group: false };

  it("names the plan and its last day in the recipient's zone and language (PLAN-5)", () => {
    const payload = { plan: "trainer_pro", expires_at: "2026-11-30T20:59:59Z" };
    expect(renderMessage({ ...row, kind: "plan_granted", payload }, options)?.text).toBe(
      "Тебе выдан тариф Pro до 30 ноября 2026. Спасибо, что ты в бете DaFit.",
    );
    expect(renderMessage({ ...row, kind: "plan_granted", locale: "en", payload }, options)?.text).toBe(
      "You now have Pro until November 30, 2026. Thanks for being in the DaFit beta.",
    );
  });

  it("says when a plan has no end, and opens My plan", () => {
    const message = renderMessage({ ...row, kind: "plan_granted", payload: { plan: "client_premium", expires_at: null } }, options);
    expect(message?.text).toBe("Тебе выдан тариф Premium без срока. Спасибо, что ты в бете DaFit.");
    expect(message?.buttons).toEqual([
      { text: "Открыть тариф", web_app: { url: "https://fit.example/settings/plan?source=plan_granted" } },
    ]);
  });

  it("tells about a revoked plan and one ending in three days", () => {
    expect(renderMessage({ ...row, kind: "plan_revoked", payload: { plan: "trainer_pro" } }, options)?.text).toBe(
      "Тариф Pro отключён. Все твои данные на месте.",
    );
    expect(
      renderMessage({ ...row, kind: "plan_expiring", payload: { plan: "client_premium", expires_at: "2026-11-30T20:59:59Z" } }, options)?.text,
    ).toBe("Тариф Premium закончится 30 ноября 2026. Если он ещё нужен, запроси доступ в разделе «Мой тариф».");
  });
});

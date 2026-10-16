import { describe, expect, it } from "vitest";
import { escapeHtml, renderMessage } from "./messages";

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

  it("tells the trainer about a new client by name, escaped, with a button to the clients", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", payload: { coaching_id: "p1", first_name: "Анна", last_name: "<Смирнова>" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Новый клиент: Анна &lt;Смирнова&gt;",
      buttons: [{ text: "Открыть клиентов", web_app: { url: "https://fit.example/trainer/clients?source=coaching_created" } }],
    });
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

describe("intake messages", () => {
  const options = { appUrl: "https://fit.example", group: false };

  it("tells the trainer about a new intake and opens it (Т8)", () => {
    const message = renderMessage(
      { ...row, kind: "intake_submitted", payload: { coaching_id: "p1", first_name: "Анна", parq_flagged: false } },
      options,
    );
    expect(message).toEqual({
      text: "Новая анкета: Анна.",
      buttons: [{ text: "Открыть анкету", web_app: { url: "https://fit.example/trainer/clients/p1/intake?source=intake_submitted" } }],
    });
  });

  it("points out a yes in PAR-Q", () => {
    const message = renderMessage(
      { ...row, kind: "intake_submitted", locale: "en", payload: { coaching_id: "p1", first_name: "Anna", parq_flagged: true } },
      options,
    );
    expect(message?.text).toBe("New intake: Anna. There's a yes in PAR-Q, so read the intake before the session.");
  });

  it("asks the client to fill in the intake on the trainer's behalf", () => {
    const message = renderMessage(
      { ...row, kind: "intake_reminder", payload: { coaching_id: "p1", first_name: "Олег", last_name: "<Б>" } },
      options,
    );
    expect(message).toEqual({
      text: "Олег &lt;Б&gt; просит заполнить анкету: так тренер заранее узнает о твоих целях и здоровье.",
      buttons: [{ text: "Заполнить анкету", web_app: { url: "https://fit.example/client/trainers/p1/intake?source=intake_reminder" } }],
    });
  });

  it("says Your trainer when the trainer has no name", () => {
    const message = renderMessage({ ...row, kind: "intake_reminder", locale: "en", payload: { coaching_id: "p1" } }, options);
    expect(message?.text).toMatch(/^Your trainer asks you/);
  });
});

describe("escapeHtml", () => {
  it("escapes what parse_mode HTML treats as markup", () => {
    expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  });
});

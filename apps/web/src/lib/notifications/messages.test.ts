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

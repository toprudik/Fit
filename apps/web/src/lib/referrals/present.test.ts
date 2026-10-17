import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { clientTermLines, formatOfferDay, offerLines } from "./present";

const base = { referrerSessions: 2, refereeSessions: 0, minAmountMinor: null, currency: null, packageTitle: null, activeTo: null };

describe("referral offer lines", () => {
  it("formats the last day without shifting it", () => {
    expect(formatOfferDay("ru", "2026-11-30")).toBe("30 ноября");
    expect(formatOfferDay("en", "2026-11-30")).toBe("November 30");
  });

  it("reads the trainer's offer", () => {
    expect(offerLines(dictionaries.ru, "ru", base)).toEqual(["Клиенту за друга: 2 занятия", "Другу ничего", "Любая оплата", "без срока"]);
    const lines = offerLines(dictionaries.ru, "ru", { ...base, refereeSessions: 1, minAmountMinor: 500000, currency: "RUB", activeTo: "2026-11-30" });
    expect(lines[1]).toBe("Другу: 1 занятие");
    expect(lines[2]).toMatch(/^Оплата от 5\s000\s₽$/);
    expect(lines[3]).toBe("до 30 ноября");
  });

  it("reads the client's terms", () => {
    expect(clientTermLines(dictionaries.en, "en", { ...base, refereeSessions: 1, packageTitle: "Pack 8" }, "Irina")).toEqual([
      "Send the link to a friend. When they pay for sessions with Irina, you get 2 sessions.",
      "Your friend gets 1 session too.",
      "The bonus comes after a payment for “Pack 8”.",
    ]);
  });
});

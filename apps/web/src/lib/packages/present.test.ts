import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import { packageTitle, priceGridItems } from "./present";

describe("price grid items", () => {
  it("writes each line in the viewer's language", () => {
    const [dropIn, pack] = priceGridItems(
      [
        { key: "a", title: "Разовое занятие", sessionsCount: 1, priceMinor: 200000, currency: "RUB", perSessionMinor: 200000, savingsPct: null, isBestValue: false, validityDays: null },
        { key: "b", title: "20 занятий", sessionsCount: 20, priceMinor: 3000000, currency: "RUB", perSessionMinor: 150000, savingsPct: 25, isBestValue: true, validityDays: 180 },
      ],
      ru,
      "ru",
    );
    expect(dropIn).toMatchObject({ perSession: null, savings: null, validity: null, best: false });
    expect({ ...pack, price: pack?.price.replace(/\s/g, " "), perSession: pack?.perSession?.replace(/\s/g, " ") }).toEqual({
      key: "b",
      title: "20 занятий",
      price: "30 000 ₽",
      perSession: "1 500 ₽ за занятие",
      savings: "выгода 25 %",
      best: true,
      validity: "180 дней",
    });
  });

  it("names unnamed packages by their sessions", () => {
    expect(packageTitle(ru, "ru", 1)).toBe("Разовое занятие");
    expect(packageTitle(ru, "ru", 5)).toBe("5 занятий");
    expect(packageTitle(ru, "ru", 2)).toBe("2 занятия");
    expect(packageTitle(en, "en", 10)).toBe("10 sessions");
  });
});

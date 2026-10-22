import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { amountsText, debtText, unpaidByCurrency } from "./debt";

const t = dictionaries.ru;

describe("debtText", () => {
  it("says there is no debt when no sessions are owed", () => {
    expect(debtText(t, "ru", { sessions: 0, amounts: { RUB: 400000 } })).toBe(t.money.payments.noDebt);
  });

  it("names the sessions and the money per currency", () => {
    expect(debtText(t, "ru", { sessions: 2, amounts: { RUB: 400000 } }).replace(/\s/g, " ")).toBe("2 занятия, 4 000 ₽");
  });
});

describe("unpaidByCurrency", () => {
  it("sums what is left to pay on live passes per currency", () => {
    const passes = [
      { unpaidMinor: 300000, currency: "RUB", status: "active" },
      { unpaidMinor: 100000, currency: "RUB", status: "frozen" },
      { unpaidMinor: 5000, currency: "USD", status: "active" },
      { unpaidMinor: 200000, currency: "RUB", status: "ended" },
      { unpaidMinor: 0, currency: "RUB", status: "active" },
    ];
    expect(unpaidByCurrency(passes)).toEqual({ RUB: 400000, USD: 5000 });
    expect(amountsText("ru", { RUB: 400000 }).replace(/\s/g, " ")).toBe("4 000 ₽");
  });

  it("is empty when every pass is paid", () => {
    expect(unpaidByCurrency([{ unpaidMinor: 0, currency: "RUB", status: "active" }])).toEqual({});
  });
});

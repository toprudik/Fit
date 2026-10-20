import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { debtText } from "./debt";

const t = dictionaries.ru;

describe("debtText", () => {
  it("says there is no debt when no sessions are owed", () => {
    expect(debtText(t, "ru", { sessions: 0, amounts: { RUB: 400000 } })).toBe(t.money.payments.noDebt);
  });

  it("names the sessions and the money per currency", () => {
    expect(debtText(t, "ru", { sessions: 2, amounts: { RUB: 400000 } }).replace(/\s/g, " ")).toBe("2 занятия, 4 000 ₽");
  });
});

import { describe, expect, it } from "vitest";
import { moneyDetails } from "./money-changes-present";

const ZONE = "Europe/Moscow";

describe("moneyDetails edges", () => {
  it("shows the new amount of a changed payment with the currency it had", () => {
    expect(moneyDetails("payment_changed", { amount_minor: 1000, currency: "RUB" }, { amount_minor: 1500 }, ZONE)).toEqual([
      { kind: "amount", minor: 1500, currency: "RUB" },
    ]);
  });
});

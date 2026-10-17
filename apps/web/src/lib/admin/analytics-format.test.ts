import { describe, expect, it } from "vitest";
import { analyticsPeriod, moneyByCurrency, share } from "./analytics-format";

describe("analyticsPeriod", () => {
  it("takes an offered period and falls back to 30 days", () => {
    expect(analyticsPeriod("7")).toBe(7);
    expect(analyticsPeriod("90")).toBe(90);
    expect(analyticsPeriod("14")).toBe(30);
    expect(analyticsPeriod(undefined)).toBe(30);
    expect(analyticsPeriod(["7", "90"])).toBe(30);
  });
});

describe("share", () => {
  it("rounds to a whole percent and has nothing to say about an empty total", () => {
    expect(share(1, 3)).toBe(33);
    expect(share(2, 2)).toBe(100);
    expect(share(0, 0)).toBeNull();
  });
});

describe("moneyByCurrency", () => {
  it("lists non-zero amounts by currency and drops anything else", () => {
    expect(moneyByCurrency({ USD: 500, RUB: 100000, EUR: 0 })).toEqual([
      { currency: "RUB", minor: 100000 },
      { currency: "USD", minor: 500 },
    ]);
    expect(moneyByCurrency(null)).toEqual([]);
    expect(moneyByCurrency([1, 2])).toEqual([]);
    expect(moneyByCurrency({ RUB: "1" })).toEqual([]);
  });
});

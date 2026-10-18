import { describe, expect, it } from "vitest";
import { amountOf, parseAmount, shareOf } from "./diary";

describe("diary edges", () => {
  it("has no share without a positive target", () => {
    expect(shareOf(100, 0)).toBeNull();
  });

  it("rounds the kcal of an amount to a tenth", () => {
    expect(amountOf({ kcal100: 55, protein100: null, fat100: null, carbs100: null }, 33).kcal).toBe(18.2);
  });

  it("accepts the lowest allowed amount", () => {
    expect(parseAmount("1", 1, 5000)).toBe(1);
    expect(parseAmount("5000", 1, 5000)).toBe(5000);
  });
});

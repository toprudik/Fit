import { describe, expect, it } from "vitest";
import { parseDiscountPercent } from "./percent";

describe("parseDiscountPercent", () => {
  it("reads whole percents from 1 to 100", () => {
    expect(parseDiscountPercent("1")).toBe(1);
    expect(parseDiscountPercent(" 30 ")).toBe(30);
    expect(parseDiscountPercent("25%")).toBe(25);
    expect(parseDiscountPercent("100")).toBe(100);
  });

  it("refuses anything else", () => {
    for (const text of ["", "0", "101", "12.5", "-5", "abc", "1000"]) expect(parseDiscountPercent(text)).toBeNull();
  });
});

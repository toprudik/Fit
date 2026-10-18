import { describe, expect, it } from "vitest";
import { gridRaise, type SimulatorPackage } from "./grid-raise";

const pack = (id: string, priceMinor: number, sold: number): SimulatorPackage => ({ id, title: id, priceMinor, currency: "RUB", sold });

describe("gridRaise", () => {
  it("weighs each package by what it sold over the base months", () => {
    const packages = [pack("one", 2_000_00, 4), pack("ten", 15_000_00, 2)];
    const prices = new Map([
      ["one", 2_500_00],
      ["ten", 15_000_00],
    ]);
    // 4 × 2 000 + 2 × 15 000 = 38 000 → 4 × 2 500 + 2 × 15 000 = 40 000
    expect(gridRaise(packages, prices)).toBeCloseTo(40_000 / 38_000 - 1);
  });

  it("counts every package once when nothing sold", () => {
    const packages = [pack("one", 1_000_00, 0), pack("five", 4_000_00, 0)];
    const prices = new Map([
      ["one", 1_500_00],
      ["five", 4_000_00],
    ]);
    expect(gridRaise(packages, prices)).toBeCloseTo(0.1);
  });

  it("goes below zero when prices drop", () => {
    expect(gridRaise([pack("one", 2_000_00, 1)], new Map([["one", 1_500_00]]))).toBeCloseTo(-0.25);
  });

  it("leaves out free packages and fields that are not a price yet", () => {
    const packages = [pack("free", 0, 5), pack("one", 1_000_00, 1), pack("ten", 9_000_00, 1)];
    const prices = new Map<string, number | null>([
      ["free", 500_00],
      ["one", 1_200_00],
      ["ten", null],
    ]);
    expect(gridRaise(packages, prices)).toBeCloseTo(0.2);
    expect(gridRaise([], new Map())).toBe(0);
  });
});

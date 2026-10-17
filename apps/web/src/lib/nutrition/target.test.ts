import { describe, expect, it } from "vitest";
import { ageOn, gramsOfPercent, kcalOfMacros, macrosDisagree, minKcal, parseCalcResult, percentOfGrams } from "./target";

describe("minKcal", () => {
  it("is 1500 for men and 1200 otherwise, unknown included (wave-2 §2.8)", () => {
    expect(minKcal("male")).toBe(1500);
    expect(minKcal("female")).toBe(1200);
    expect(minKcal(null)).toBe(1200);
  });
});

describe("macros", () => {
  it("turns shares of the kcal into grams and back (§2.11)", () => {
    expect([gramsOfPercent(1800, "protein", 30), gramsOfPercent(1800, "fat", 30), gramsOfPercent(1800, "carbs", 40)]).toEqual([135, 60, 180]);
    expect(kcalOfMacros(135, 60, 180)).toBe(1800);
    expect([percentOfGrams(1800, "protein", 135), percentOfGrams(1800, "fat", 60), percentOfGrams(1800, "carbs", 180)]).toEqual([30, 30, 40]);
    expect(percentOfGrams(0, "fat", 60)).toBeNull();
  });

  it("adds 4/9/4 kcal per gram once all three are given", () => {
    expect(kcalOfMacros(120, 60, 195)).toBe(1800);
    expect(kcalOfMacros(120, null, 195)).toBeNull();
  });

  it("flags macros more than 5% away from the kcal (§2.11)", () => {
    expect(macrosDisagree({ kcal: 1800, proteinG: 120, fatG: 60, carbsG: 195 })).toBe(false);
    expect(macrosDisagree({ kcal: 1800, proteinG: 120, fatG: 60, carbsG: 230 })).toBe(true);
    expect(macrosDisagree({ kcal: 1800, proteinG: null, fatG: null, carbsG: null })).toBe(false);
  });
});

describe("parseCalcResult", () => {
  it("reads a result of the calculator", () => {
    expect(parseCalcResult({ status: "ok", kcal: 2760, protein_g: 144, fat_g: 72, carbs_g: 384, bmr: 1780, age: 30 })).toEqual({
      status: "ok",
      kcal: 2760,
      proteinG: 144,
      fatG: 72,
      carbsG: 384,
      bmr: 1780,
      age: 30,
    });
  });

  it("keeps the reason when there is no result", () => {
    expect(parseCalcResult({ status: "minor" })).toEqual({ status: "minor" });
    expect(parseCalcResult({ status: "too_low", bmr: 996.5 })).toEqual({ status: "too_low" });
    expect(parseCalcResult(null)).toEqual({ status: "incomplete" });
  });
});

describe("ageOn", () => {
  it("counts whole years and turns on the birthday", () => {
    expect(ageOn("2008-10-17", "2026-10-16")).toBe(17);
    expect(ageOn("2008-10-17", "2026-10-17")).toBe(18);
    expect(ageOn("1996-01-01", "2026-10-17")).toBe(30);
  });
});

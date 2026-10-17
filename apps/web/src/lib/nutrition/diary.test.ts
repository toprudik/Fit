import { describe, expect, it } from "vitest";
import { amountOf, byMeal, formatDiaryDay, parseAmount, shareOf, shiftDay, totalsOf } from "./diary";

describe("totalsOf", () => {
  it("adds the entries of a day; quick kcal without macros counts 0 g", () => {
    expect(
      totalsOf([
        { kcal: 525, proteinG: 19.5, fatG: 3.8, carbsG: 102 },
        { kcal: 350, proteinG: null, fatG: null, carbsG: null },
      ]),
    ).toEqual({ kcal: 875, proteinG: 19.5, fatG: 3.8, carbsG: 102 });
  });
});

describe("amountOf", () => {
  it("scales the values per 100 g (§3.1: 150 g of buckwheat)", () => {
    expect(amountOf({ kcal100: 350, protein100: 13, fat100: 2.5, carbs100: 68 }, 150)).toEqual({
      kcal: 525,
      proteinG: 19.5,
      fatG: 3.8,
      carbsG: 102,
    });
  });
});

describe("byMeal", () => {
  it("keeps the order of meals and every meal, empty ones too", () => {
    const groups = byMeal([{ meal: "snack" as const }, { meal: "breakfast" as const }]);
    expect(groups.map((group) => [group.meal, group.entries.length])).toEqual([
      ["breakfast", 1],
      ["lunch", 0],
      ["dinner", 0],
      ["snack", 1],
    ]);
  });
});

describe("shareOf", () => {
  it("fills the ring up to the target", () => {
    expect(shareOf(1000, 2000)).toBe(0.5);
    expect(shareOf(2500, 2000)).toBe(1);
    expect(shareOf(100, null)).toBeNull();
  });
});

describe("shiftDay", () => {
  it("moves across months and years", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("parseAmount", () => {
  it("reads comma and dot decimals within the range", () => {
    expect(parseAmount("72,5", 0, 100)).toBe(72.5);
    expect(parseAmount(" 150 ", 1, 5000)).toBe(150);
    expect(parseAmount("", 1, 5000)).toBeNull();
    expect(parseAmount("6000", 1, 5000)).toBe("invalid");
    expect(parseAmount("abc", 1, 5000)).toBe("invalid");
    expect(parseAmount("0", 1, 5000)).toBe("invalid");
  });
});

describe("formatDiaryDay", () => {
  it("drops the year inside the current one", () => {
    expect(formatDiaryDay("ru-RU", "2026-10-17", "2026-10-18")).toBe("17 октября");
    expect(formatDiaryDay("en-US", "2025-12-31", "2026-01-01")).toBe("December 31, 2025");
  });
});

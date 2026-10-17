import { describe, expect, it } from "vitest";
import {
  ENTRY_GRAMS_MAX,
  amountOf,
  byMeal,
  formatDiaryDay,
  gramsOfPortion,
  hourIn,
  mealAt,
  parseAmount,
  portionOfGrams,
  portionRange,
  portionUnit,
  shareOf,
  shiftDay,
  totalsOf,
} from "./diary";

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

describe("mealAt and hourIn", () => {
  it("picks the meal by the local hour", () => {
    expect(mealAt(8)).toBe("breakfast");
    expect(mealAt(13)).toBe("lunch");
    expect(mealAt(16)).toBe("snack");
    expect(mealAt(19)).toBe("dinner");
    expect(mealAt(23)).toBe("snack");
    expect(hourIn("Europe/Moscow", new Date("2026-10-17T05:30:00Z"))).toBe(8);
    expect(hourIn("UTC", new Date("2026-10-17T00:10:00Z"))).toBe(0);
  });
});

describe("portion weights", () => {
  it("are grams in both languages, kept in grams; ounces still convert", () => {
    expect([portionUnit("en"), portionUnit("ru")]).toEqual(["g", "g"]);
    expect(portionOfGrams(100, "oz")).toBe(3.5);
    expect(gramsOfPortion(4, "oz")).toBe(113.4);
    expect([portionOfGrams(150, "g"), gramsOfPortion(150, "g")]).toEqual([150, 150]);
  });

  it("keep the largest portion in ounces under the database limit", () => {
    const [min, max] = portionRange("oz");
    expect(min).toBe(0.1);
    expect(gramsOfPortion(max, "oz")).toBeLessThanOrEqual(ENTRY_GRAMS_MAX);
    expect(portionRange("g")).toEqual([1, ENTRY_GRAMS_MAX]);
  });
});

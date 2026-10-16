import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { en } from "@/i18n/dictionaries/en";
import { formatOffset, isValidOffsets, sortOffsets, splitOffset } from "./offsets";

describe("isValidOffsets", () => {
  it("accepts up to three distinct offsets from 5 minutes to 7 days (NOTIF-1)", () => {
    expect(isValidOffsets([])).toBe(true);
    expect(isValidOffsets([1440, 60, 30])).toBe(true);
    expect(isValidOffsets([5, 10080])).toBe(true);
  });

  it("refuses a fourth, a duplicate and anything out of range", () => {
    expect(isValidOffsets([1440, 180, 60, 15])).toBe(false);
    expect(isValidOffsets([60, 60])).toBe(false);
    expect(isValidOffsets([4])).toBe(false);
    expect(isValidOffsets([10081])).toBe(false);
    expect(isValidOffsets([7.5])).toBe(false);
  });
});

describe("splitOffset and formatOffset", () => {
  it("uses the biggest whole unit", () => {
    expect(splitOffset(2880)).toEqual({ value: 2, unit: "days" });
    expect(splitOffset(180)).toEqual({ value: 3, unit: "hours" });
    expect(splitOffset(90)).toEqual({ value: 90, unit: "minutes" });
  });

  it("writes the plural forms of each language", () => {
    expect(formatOffset("ru", 1440, ru.reminders.units)).toBe("1 день");
    expect(formatOffset("ru", 60, ru.reminders.units)).toBe("1 час");
    expect(formatOffset("ru", 25, ru.reminders.units)).toBe("25 минут");
    expect(formatOffset("en", 15, en.reminders.units)).toBe("15 minutes");
    expect(formatOffset("en", 60, en.reminders.units)).toBe("1 hour");
  });
});

it("sortOffsets puts the earliest reminder first", () => {
  expect(sortOffsets([15, 1440, 60])).toEqual([1440, 60, 15]);
});

import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import { formatLogDay, formatRecord, formatSet } from "./present";

describe("formatSet", () => {
  it("reads reps with weight, reps alone, weight with time and time alone", () => {
    expect(formatSet(ru, "ru", { reps: 10, weightKg: 40, durationS: null }, "kg")).toBe("10 × 40 кг");
    expect(formatSet(ru, "ru", { reps: 12, weightKg: null, durationS: null }, "kg")).toBe("12 повторов");
    expect(formatSet(ru, "ru", { reps: null, weightKg: 22.5, durationS: 90 }, "kg")).toBe("22,5 кг · 1:30");
    expect(formatSet(ru, "ru", { reps: null, weightKg: null, durationS: 45 }, "kg")).toBe("0:45");
  });

  it("shows pounds in English", () => {
    expect(formatSet(en, "en", { reps: 5, weightKg: 102.06, durationS: null }, "lb")).toBe("5 × 225 lb");
    expect(formatSet(en, "en", { reps: 1, weightKg: 0, durationS: null }, "lb")).toBe("1 rep");
  });
});

describe("formatRecord", () => {
  it("formats each record type", () => {
    expect(formatRecord(ru, "ru", { type: "max_weight", value: 100 }, "kg")).toBe("100 кг");
    expect(formatRecord(ru, "ru", { type: "max_reps", value: 21 }, "kg")).toBe("21 повтор");
    expect(formatRecord(ru, "ru", { type: "max_duration", value: 3725 }, "kg")).toBe("1:02:05");
  });
});

describe("formatLogDay", () => {
  it("adds the year only for another year", () => {
    expect(formatLogDay("en", "2026-10-16", 2026)).toBe("Fri, Oct 16");
    expect(formatLogDay("en", "2025-10-16", 2026)).toBe("Thu, Oct 16, 2025");
  });
});

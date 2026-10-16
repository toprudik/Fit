import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { formatPlanDate, PLAN_FEATURES, zonedDayEnd } from "./plans";

describe("zonedDayEnd", () => {
  it("ends the day in the admin's zone", () => {
    expect(zonedDayEnd("2026-11-30", "Europe/Moscow")?.toISOString()).toBe("2026-11-30T20:59:59.000Z");
    expect(zonedDayEnd("2026-11-30", "UTC")?.toISOString()).toBe("2026-11-30T23:59:59.000Z");
    expect(zonedDayEnd("2026-11-30", "America/New_York")?.toISOString()).toBe("2026-12-01T04:59:59.000Z");
  });

  it("follows daylight saving time", () => {
    expect(zonedDayEnd("2026-07-01", "Europe/Berlin")?.toISOString()).toBe("2026-07-01T21:59:59.000Z");
    expect(zonedDayEnd("2026-03-29", "Europe/Berlin")?.toISOString()).toBe("2026-03-29T21:59:59.000Z");
    expect(zonedDayEnd("2026-10-25", "Europe/Berlin")?.toISOString()).toBe("2026-10-25T22:59:59.000Z");
  });

  it("refuses what is not a date or a zone", () => {
    expect(zonedDayEnd("", "UTC")).toBeNull();
    expect(zonedDayEnd("2026-02-30", "UTC")).toBeNull();
    expect(zonedDayEnd("30.11.2026", "UTC")).toBeNull();
    expect(zonedDayEnd("2026-11-30", "Mars/Olympus")).toBeNull();
  });
});

describe("PLAN_FEATURES", () => {
  it("names every feature it lists, and every named feature is in a plan", () => {
    const listed = Object.values(PLAN_FEATURES).flat().sort();
    expect(listed).toEqual(Object.keys(ru.plans.features).sort());
  });
});

describe("formatPlanDate", () => {
  it("writes the day in the reader's zone, without the Russian «г.»", () => {
    expect(formatPlanDate("ru", "2026-11-30T20:59:59Z", "Europe/Moscow")).toBe("30 ноября 2026");
    expect(formatPlanDate("en", "2026-11-30T20:59:59Z", "Asia/Tokyo")).toBe("December 1, 2026");
    expect(formatPlanDate("en", "2026-11-30T20:59:59Z", "Mars/Olympus")).toBe("November 30, 2026");
  });
});

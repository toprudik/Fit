import { describe, expect, it } from "vitest";
import { dailySeries, formatChange, formatMeasurement, fromMetric, isValidMetric, parseMeasurement, periodStart, toMetric, unitOf, unitSystem } from "./measurements";

const UNITS = { kg: "кг", lb: "lb", cm: "см", in: "in" };

describe("units", () => {
  it("uses kilograms and centimetres in both languages, as across the CIS", () => {
    expect(unitSystem("en")).toBe("metric");
    expect(unitOf("weight", unitSystem("en"))).toBe("kg");
    expect(unitOf("waist", unitSystem("en"))).toBe("cm");
    expect(unitOf("weight", "imperial")).toBe("lb");
    expect(unitOf("waist", "imperial")).toBe("in");
    expect(unitOf("weight", unitSystem("ru"))).toBe("kg");
    expect(unitOf("waist", unitSystem("ru"))).toBe("cm");
  });

  it("stores 180 lb as 81.65 kg, which a Russian trainer reads as about 81.6 kg (PROG-2)", () => {
    const stored = toMetric(180, "lb");
    expect(stored).toBe(81.65);
    expect(fromMetric(stored, "lb")).toBe(180);
    expect(formatMeasurement("ru", "weight", stored, UNITS)).toMatch(/^81,[67]\u00a0кг$/);
  });

  it("converts inches", () => {
    expect(toMetric(32, "in")).toBe(81.28);
    expect(fromMetric(81.28, "in")).toBe(32);
  });
});

describe("parseMeasurement", () => {
  it("reads a comma or a dot", () => {
    expect(parseMeasurement("weight", "72,5", "kg")).toEqual({ ok: true, metric: 72.5 });
    expect(parseMeasurement("waist", " 80.25 ", "cm")).toEqual({ ok: true, metric: 80.25 });
  });

  it("tells an empty field from a bad or impossible one", () => {
    expect(parseMeasurement("weight", "  ", "kg")).toEqual({ ok: false, reason: "empty" });
    expect(parseMeasurement("weight", "7x", "kg")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMeasurement("weight", "-3", "kg")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMeasurement("weight", "0", "kg")).toEqual({ ok: false, reason: "range" });
    expect(parseMeasurement("neck", "250", "cm")).toEqual({ ok: false, reason: "range" });
    expect(parseMeasurement("weight", "1200", "lb")).toEqual({ ok: false, reason: "range" });
  });
});

describe("periods", () => {
  it("counts a month and three months back", () => {
    // A month back from 31 March is the last day of February, not a rolled-over 3 March.
    expect(periodStart("month", "2026-03-31")).toBe("2026-02-28");
    expect(periodStart("quarter", "2026-05-31")).toBe("2026-02-28");
    expect(periodStart("month", "2028-03-31")).toBe("2028-02-29");
    expect(periodStart("quarter", "2026-10-16")).toBe("2026-07-16");
    expect(periodStart("all", "2026-10-16")).toBeNull();
  });
});

describe("dailySeries", () => {
  it("keeps the last value of each day, sorted by date", () => {
    expect(
      dailySeries([
        { date: "2026-10-02", value: 80, at: "2026-10-02T08:00:00Z" },
        { date: "2026-10-01", value: 81, at: "2026-10-01T08:00:00Z" },
        { date: "2026-10-02", value: 79.5, at: "2026-10-02T20:00:00Z" },
      ]),
    ).toEqual([
      { date: "2026-10-01", value: 81 },
      { date: "2026-10-02", value: 79.5 },
    ]);
  });
});

describe("formatChange", () => {
  it("shows the sign in the user's unit", () => {
    expect(formatChange("ru", "weight", 82, 80.5, UNITS)).toMatch(/^[-−]1,5\u00a0кг$/);
    expect(formatChange("en", "waist", 81.28, 82.3, UNITS)).toBe("+1\u00a0см");
    expect(formatChange("ru", "waist", 80, 80, UNITS)).toBe("0\u00a0см");
  });
});

describe("isValidMetric", () => {
  it("takes what the column stores", () => {
    expect(isValidMetric("weight", 81.65)).toBe(true);
    expect(isValidMetric("weight", 81.655)).toBe(false);
    expect(isValidMetric("weight", 0)).toBe(false);
    expect(isValidMetric("neck", 120)).toBe(false);
  });
});

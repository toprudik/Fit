import { describe, expect, it } from "vitest";
import { formatDuration, fromKg, parseAmount, parseDuration, toKg, weightUnit } from "./units";

describe("weights (PRD 2.10-9, WORK-6)", () => {
  it("shows kilograms in both languages (Q67)", () => {
    expect(weightUnit("en")).toBe("kg");
    expect(weightUnit("ru")).toBe("kg");
  });

  it("stores pounds as kilograms that read back the same", () => {
    expect(toKg(225, "lb")).toBe(102.06);
    expect(fromKg(102.06, "lb")).toBe(225);
    expect(fromKg(102.06, "kg")).toBe(102.06);
    expect(toKg(100, "kg")).toBe(100);
  });

  it("reads a comma or a dot", () => {
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount(" 80 ")).toBe(80);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1e3")).toBeNull();
  });
});

describe("durations", () => {
  it("formats and reads m:ss and h:mm:ss", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

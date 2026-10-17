import { describe, expect, it } from "vitest";
import { byAdherence, isAdherencePeriod, toAdherence, trendOf, type Adherence } from "./adherence";

const make = (share: number | null, hasTarget = true, previous: number | null = null): Adherence => ({
  days: 7,
  logged: 5,
  counted: share === null ? 0 : 5,
  inNorm: 3,
  share,
  previous,
  hasTarget,
});

describe("isAdherencePeriod", () => {
  it("takes 7, 30 and 90 only", () => {
    expect(isAdherencePeriod("7")).toBe(true);
    expect(isAdherencePeriod(90)).toBe(true);
    expect(isAdherencePeriod("14")).toBe(false);
    expect(isAdherencePeriod("07")).toBe(false);
    expect(isAdherencePeriod(undefined)).toBe(false);
  });
});

describe("toAdherence", () => {
  it("maps the row of the database", () => {
    expect(
      toAdherence({ days: 7, logged: 5, counted: 5, in_norm: 3, adherence: 60, previous_adherence: null, has_target: true }, 7),
    ).toEqual({ days: 7, logged: 5, counted: 5, inNorm: 3, share: 60, previous: null, hasTarget: true });
  });
});

describe("trendOf", () => {
  it("needs two percentages and a step of 5 points", () => {
    expect(trendOf({ share: 60, previous: 50 })).toBe("up");
    expect(trendOf({ share: 60, previous: 70 })).toBe("down");
    expect(trendOf({ share: 60, previous: 58 })).toBe("flat");
    expect(trendOf({ share: 60, previous: null })).toBeNull();
    expect(trendOf({ share: null, previous: 40 })).toBeNull();
  });
});

describe("byAdherence", () => {
  it("puts the lowest first, then no judged day, then no target", () => {
    const rows = [
      { name: "Вера", adherence: make(null, false) },
      { name: "Анна", adherence: make(80) },
      { name: "Борис", adherence: make(null, true) },
      { name: "Глеб", adherence: make(40) },
      { name: "Дина", adherence: make(40) },
    ];
    expect(byAdherence(rows, new Intl.Collator("ru")).map((row) => row.name)).toEqual(["Глеб", "Дина", "Анна", "Борис", "Вера"]);
  });
});

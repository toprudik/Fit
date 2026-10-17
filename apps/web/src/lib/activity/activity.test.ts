import { describe, expect, it } from "vitest";
import { activityDay, formatSleep, parseSleep, parseSteps, shortcutSteps, waterGoalMl, type ActivityEntry } from "./activity";

const DAY = "2026-10-17";
const entry = (extra: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(),
  localDate: DAY,
  metric: "steps",
  value: 0,
  sleepQuality: null,
  source: "manual",
  ...extra,
});

describe("activityDay", () => {
  it("shows typed steps over the iOS ones (4.6)", () => {
    const day = activityDay([entry({ value: 8500, source: "ios_shortcut" }), entry({ value: 9000 })], DAY);
    expect(day.steps).toEqual({ value: 9000, source: "manual" });
  });

  it("falls back to the iOS steps and sums the water", () => {
    const day = activityDay(
      [
        entry({ value: 8500, source: "ios_shortcut" }),
        entry({ metric: "water", value: 250 }),
        entry({ metric: "water", value: 500 }),
        entry({ metric: "water", value: 250, localDate: "2026-10-16" }),
      ],
      DAY,
    );
    expect(day).toEqual({ steps: { value: 8500, source: "ios_shortcut" }, waterMl: 750, sleep: null });
  });

  it("keeps sleep with its quality", () => {
    expect(activityDay([entry({ metric: "sleep", value: 450, sleepQuality: 4 })], DAY).sleep).toEqual({ minutes: 450, quality: 4 });
  });
});

describe("parsing", () => {
  it("reads steps with spaces and refuses more than 100 000 (4.5)", () => {
    expect(parseSteps("9 000")).toBe(9000);
    expect(parseSteps("150000")).toBeNull();
    expect(parseSteps("12a")).toBeNull();
  });

  it("reads sleep as a clock or hours", () => {
    expect(parseSleep("7:30")).toBe(450);
    expect(parseSleep("7,5")).toBe(450);
    expect(parseSleep("25")).toBeNull();
    expect(parseSleep("7:75")).toBeNull();
    expect(formatSleep(450)).toBe("7:30");
  });

  it("rounds the steps a shortcut sends", () => {
    expect(shortcutSteps(8532.4)).toBe(8532);
    expect(shortcutSteps("8532,6")).toBe(8533);
    expect(shortcutSteps("")).toBeNull();
    expect(shortcutSteps(undefined)).toBeNull();
  });
});

describe("waterGoalMl", () => {
  it("takes the trainer's goal, else 30 ml per kg", () => {
    expect(waterGoalMl(2500, 80)).toBe(2500);
    expect(waterGoalMl(null, 72)).toBe(2150);
    expect(waterGoalMl(null, null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { formatLongDate, formatNumber, interpolate, plural, type PluralForms } from "./format";

// Intl separates groups in Russian with a no-break space.
const NBSP = " ";

describe("interpolate", () => {
  it("replaces every placeholder, numbers included", () => {
    expect(interpolate("{name} записан на {time}, {name}", { name: "Анна", time: "18:30" })).toBe("Анна записан на 18:30, Анна");
    expect(interpolate("{count} min", { count: 60 })).toBe("60 min");
  });

  it("keeps unknown placeholders so a missing value shows", () => {
    expect(interpolate("Hi, {name}", {})).toBe("Hi, {name}");
  });

  // A placeholder named like a built-in ({toString}, {constructor}) must stay visible, not print function source.
  it("does not treat inherited object keys as values", () => {
    expect(interpolate("{toString}", {})).toBe("{toString}");
  });

  it("leaves text without placeholders alone", () => {
    expect(interpolate("08:00–09:00 {", { x: 1 })).toBe("08:00–09:00 {");
  });
});

describe("plural", () => {
  const sessionsRu: PluralForms = { one: "{count} занятие", few: "{count} занятия", many: "{count} занятий", other: "{count} занятия" };
  const sessionsEn: PluralForms = { one: "{count} session", other: "{count} sessions" };

  it.each([
    [0, "0 занятий"],
    [1, "1 занятие"],
    [2, "2 занятия"],
    [5, "5 занятий"],
    [11, "11 занятий"],
    [21, "21 занятие"],
    [22, "22 занятия"],
    [111, "111 занятий"],
    [1.5, "1,5 занятия"],
  ])("ru %d → %s", (count, expected) => {
    expect(plural("ru", count, sessionsRu)).toBe(expected);
  });

  it.each([
    [0, "0 sessions"],
    [1, "1 session"],
    [2, "2 sessions"],
    [21, "21 sessions"],
  ])("en %d → %s", (count, expected) => {
    expect(plural("en", count, sessionsEn)).toBe(expected);
  });

  it("formats the count for the locale", () => {
    expect(plural("ru", 1000, sessionsRu)).toBe(`1${NBSP}000 занятий`);
    expect(plural("en", 1000, sessionsEn)).toBe("1,000 sessions");
  });

  it("falls back to the other form when a category is missing", () => {
    expect(plural("ru", 3, { one: "{count} раз", other: "{count} раза" })).toBe("3 раза");
  });
});

describe("formatNumber", () => {
  it("uses the locale's separators", () => {
    expect(formatNumber("ru", 1234567.5)).toBe(`1${NBSP}234${NBSP}567,5`);
    expect(formatNumber("en", 1234567.5)).toBe("1,234,567.5");
  });

  it("passes Intl options through", () => {
    expect(formatNumber("ru", 72.4, { maximumFractionDigits: 0 })).toBe("72");
    expect(formatNumber("en", 0.5, { style: "percent" })).toBe("50%");
  });
});

describe("formatLongDate", () => {
  const tuesday = new Date("2026-10-13T12:00:00Z");

  it("writes weekday, day and month with a capital letter", () => {
    expect(formatLongDate("ru", tuesday, "UTC")).toBe("Вторник, 13 октября");
    expect(formatLongDate("en", tuesday, "UTC")).toBe("Tuesday, October 13");
  });

  it("uses the given time zone to pick the day", () => {
    const lateEvening = new Date("2026-10-13T22:30:00Z");
    expect(formatLongDate("ru", lateEvening, "UTC")).toBe("Вторник, 13 октября");
    expect(formatLongDate("ru", lateEvening, "Europe/Moscow")).toBe("Среда, 14 октября");
  });
});

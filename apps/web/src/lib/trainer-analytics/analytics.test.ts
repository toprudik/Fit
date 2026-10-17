import { describe, expect, it } from "vitest";
import { isoInZone, majorUnits, toCsv } from "./csv";
import { change, periodKind, periodOffset, periodRange, previousPeriod, simulatorBase } from "./period";
import { breakEvenChurn, forecast } from "./simulator";

describe("periodRange", () => {
  it("covers calendar weeks, months, quarters and years", () => {
    expect(periodRange("week", "2026-10-17")).toEqual({ from: "2026-10-12", to: "2026-10-19" });
    expect(periodRange("month", "2026-10-17")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(periodRange("quarter", "2026-11-30")).toEqual({ from: "2026-10-01", to: "2027-01-01" });
    expect(periodRange("year", "2026-10-17")).toEqual({ from: "2026-01-01", to: "2027-01-01" });
  });

  it("moves back across year ends", () => {
    expect(periodRange("month", "2026-01-15", -1)).toEqual({ from: "2025-12-01", to: "2026-01-01" });
    expect(periodRange("quarter", "2026-02-01", -1)).toEqual({ from: "2025-10-01", to: "2026-01-01" });
    expect(previousPeriod("week", { from: "2026-01-05", to: "2026-01-12" })).toEqual({ from: "2025-12-29", to: "2026-01-05" });
  });

  it("takes the three full months before the current one as the simulator base", () => {
    expect(simulatorBase("2026-10-17")).toEqual({ from: "2026-07-01", to: "2026-10-01" });
  });

  it("reads the query safely", () => {
    expect(periodKind("quarter")).toBe("quarter");
    expect(periodKind("decade")).toBe("month");
    expect(periodOffset("-2")).toBe(-2);
    expect(periodOffset("3")).toBe(0);
    expect(periodOffset("x")).toBe(0);
  });

  it("compares with the previous period in whole percent", () => {
    expect(change(12, 10)).toBe(20);
    expect(change(5, 10)).toBe(-50);
    expect(change(3, 0)).toBeNull();
  });
});

describe("simulator", () => {
  it("7.5: +20 % breaks even at 16.7 % churn, and 10 % churn still earns more", () => {
    expect(Math.round(breakEvenChurn(0.2) * 1000) / 10).toBe(16.7);
    expect(forecast(100_000_00, 0.2, 0.1)).toBeGreaterThan(100_000_00);
    expect(forecast(100_000_00, 0.2, 0.1)).toBe(108_000_00);
  });

  it("has no break-even without a raise", () => {
    expect(breakEvenChurn(0)).toBe(0);
  });
});

describe("csv", () => {
  it("7.7: starts with a BOM, uses ; and a decimal comma in Russian", () => {
    const csv = toCsv(["Клиент", "Сумма", "Валюта"], [["Петров; Илья", majorUnits(1_000_050, "ru"), "RUB"]], "ru");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Клиент;Сумма;Валюта\r\n"Петров; Илья";10000,50;RUB\r\n');
  });

  it("uses , and a decimal point in English and quotes quotes", () => {
    expect(toCsv(["Note"], [['He said "hi", then left'], [null]], "en")).toBe('﻿Note\r\n"He said ""hi"", then left"\r\n\r\n');
    expect(majorUnits(-250, "en")).toBe("-2.50");
  });

  it("writes instants in the trainer's zone with the offset", () => {
    expect(isoInZone("2026-10-31T20:30:00Z", "Europe/Moscow")).toBe("2026-10-31T23:30:00+03:00");
    expect(isoInZone("2026-07-01T12:00:05Z", "America/New_York")).toBe("2026-07-01T08:00:05-04:00");
  });
});

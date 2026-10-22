import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatLocalDay,
  freezePeriod,
  freezeState,
  isDay,
  lastValidDay,
  localDay,
  parseFreezePeriod,
  passStatus,
  paidAtFor,
  paymentState,
  localInstant,
  unfreeze,
} from "./present";

describe("paymentState", () => {
  it("is partial below the price and paid at it (MONEY-9)", () => {
    expect(paymentState(1_800_000, 0)).toBe("unpaid");
    expect(paymentState(1_800_000, 900_000)).toBe("partial");
    expect(paymentState(1_800_000, 1_800_000)).toBe("paid");
    expect(paymentState(1_800_000, 2_000_000)).toBe("paid");
  });

  it("treats a free pass as owing nothing", () => {
    expect(paymentState(0, 0)).toBe("free");
  });
});

describe("dates", () => {
  it("reads the last valid day from the exclusive end in the trainer zone", () => {
    // 2026-12-01 00:00 in Moscow is 2026-11-30 21:00 UTC: the pass is valid through 30 November.
    expect(lastValidDay("2026-11-30T21:00:00+00:00", "Europe/Moscow")).toBe("2026-11-30");
    expect(lastValidDay(null, "Europe/Moscow")).toBeNull();
  });

  it("takes the local date of an instant", () => {
    expect(localDay("2026-10-16T22:30:00Z", "Europe/Moscow")).toBe("2026-10-17");
    expect(localDay("2026-10-16T22:30:00Z", "America/New_York")).toBe("2026-10-16");
  });

  it("adds and counts calendar days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
  });

  it("accepts only real days", () => {
    expect(isDay("2026-11-30")).toBe(true);
    expect(isDay("2026-11-31")).toBe(false);
    expect(isDay("30.11.2026")).toBe(false);
    expect(isDay(undefined)).toBe(false);
  });

  it("formats a local date in the viewer's language", () => {
    expect(formatLocalDay("ru", "2026-11-30")).toBe("30 ноября 2026 г.");
    expect(formatLocalDay("en", "2026-11-30")).toBe("November 30, 2026");
  });
});

describe("freezes", () => {
  it("turns a daterange into first and last day and back", () => {
    expect(parseFreezePeriod("[2026-11-01,2026-11-11)")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
    expect(parseFreezePeriod("empty")).toBeNull();
    expect(freezePeriod("2026-11-01", "2026-11-10")).toBe("[2026-11-01,2026-11-11)");
  });

  it("knows whether a freeze is ahead, running or over", () => {
    const freeze = { from: "2026-11-01", to: "2026-11-10" };
    expect(freezeState(freeze, "2026-10-31")).toBe("future");
    expect(freezeState(freeze, "2026-11-01")).toBe("current");
    expect(freezeState(freeze, "2026-11-10")).toBe("current");
    expect(freezeState(freeze, "2026-11-11")).toBe("past");
  });
});

describe("passStatus", () => {
  it("falls back to active for anything unknown", () => {
    expect(passStatus("frozen")).toBe("frozen");
    expect(passStatus(null)).toBe("active");
  });
});

describe("paidAtFor", () => {
  const now = new Date("2026-10-16T09:00:00Z");

  it("keeps the moment for today", () => {
    expect(paidAtFor("2026-10-16", "Europe/Moscow", now)).toBe(now.toISOString());
  });

  it("puts an earlier day at local noon", () => {
    expect(paidAtFor("2026-10-10", "Europe/Moscow", now)).toBe("2026-10-10T09:00:00.000Z");
    expect(paidAtFor("2026-10-10", "America/New_York", now)).toBe("2026-10-10T16:00:00.000Z");
  });
});

describe("localInstant", () => {
  it("reads a local day and time in the trainer's zone", () => {
    expect(localInstant("2026-10-16", "18:30", "Europe/Moscow")).toBe("2026-10-16T15:30:00.000Z");
    expect(localInstant("2026-01-15", "09:00", "Europe/Berlin")).toBe("2026-01-15T08:00:00.000Z");
    expect(localInstant("2026-07-15", "09:00", "Europe/Berlin")).toBe("2026-07-15T07:00:00.000Z");
  });
});

describe("unfreeze", () => {
  it("removes a freeze that started today and ends an earlier one yesterday", () => {
    expect(unfreeze({ from: "2026-10-21" }, "2026-10-21")).toEqual({ kind: "remove" });
    expect(unfreeze({ from: "2026-10-18" }, "2026-10-21")).toEqual({ kind: "end", lastDay: "2026-10-20" });
  });
});

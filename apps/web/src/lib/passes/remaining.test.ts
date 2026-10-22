import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import { bookedSessions, passLeftText, withBooked } from "./remaining";

describe("passLeftText", () => {
  it("shows the sessions on the pass when nothing is booked", () => {
    expect(passLeftText(ru, { remaining: 10, available: 10, sessionsTotal: 10 })).toBe("Осталось 10 из 10");
  });

  it("adds the booked sessions instead of taking them off", () => {
    expect(passLeftText(ru, { remaining: 10, available: 9, sessionsTotal: 10 })).toBe(
      "Осталось 10 из 10, забронировано: 1",
    );
    expect(passLeftText(en, { remaining: 10, available: 8, sessionsTotal: 10 })).toBe("10 of 10 left, 2 booked");
  });

  it("says an expired pass is over", () => {
    expect(passLeftText(ru, { remaining: 3, available: 3, sessionsTotal: 10, status: "expired" })).toBe(
      "Истёк, не использовано 3",
    );
  });
});

describe("bookedSessions", () => {
  it("never goes below zero when debt makes available larger", () => {
    expect(bookedSessions({ remaining: -1, available: 0 })).toBe(0);
  });

  it("appends to any line", () => {
    expect(withBooked(ru, "Осталось 2", { remaining: 2, available: 1 })).toBe("Осталось 2, забронировано: 1");
    expect(withBooked(ru, "Осталось 2", { remaining: 2, available: 2 })).toBe("Осталось 2");
  });
});

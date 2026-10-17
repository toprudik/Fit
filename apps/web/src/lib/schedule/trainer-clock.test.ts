import { describe, expect, it } from "vitest";
import { trainerClock } from "./trainer-clock";

const session = { startsAt: "2026-11-20T15:00:00Z", endsAt: "2026-11-20T16:00:00Z" };

describe("trainerClock", () => {
  it("gives the trainer's time when their clock differs", () => {
    // Moscow 18:00, Almaty 20:00.
    expect(trainerClock(session, "Europe/Moscow", "Asia/Almaty", "ru-RU")).toBe("20:00–21:00");
  });

  it("is null for the same clock, even under another zone name", () => {
    expect(trainerClock(session, "Europe/Moscow", "Europe/Moscow", "ru-RU")).toBeNull();
    expect(trainerClock(session, "Europe/Moscow", "Europe/Simferopol", "ru-RU")).toBeNull();
    expect(trainerClock(session, "Europe/Moscow", null, "ru-RU")).toBeNull();
  });

  it("names the trainer's day when it is another one", () => {
    const late = { startsAt: "2026-11-20T20:00:00Z", endsAt: "2026-11-20T21:00:00Z" };
    // Moscow Friday 23:00, Vladivostok Saturday 06:00.
    expect(trainerClock(late, "Europe/Moscow", "Asia/Vladivostok", "ru-RU")).toBe("сб, 06:00–07:00");
  });
});

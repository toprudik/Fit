import { describe, expect, it } from "vitest";
import { dayRange, findOverlap, groupByDay, segmentBookings } from "./book";

describe("dayRange", () => {
  it("lists local days across a month end", () => {
    expect(dayRange("2026-10-30", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("groupByDay", () => {
  it("puts a slot on the viewer's local day", () => {
    const slots = [
      { id: "a", startsAt: "2026-10-20T20:30:00Z" },
      { id: "b", startsAt: "2026-10-20T22:30:00Z" },
    ];
    const moscow = groupByDay(slots, "Europe/Moscow");
    expect(moscow.get("2026-10-20")?.map((slot) => slot.id)).toEqual(["a"]);
    expect(moscow.get("2026-10-21")?.map((slot) => slot.id)).toEqual(["b"]);
    expect(groupByDay(slots, "UTC").get("2026-10-20")).toHaveLength(2);
  });
});

describe("findOverlap", () => {
  const busy = [{ startsAt: "2026-10-20T10:00:00Z", endsAt: "2026-10-20T11:00:00Z", trainer: "Анна" }];

  it("finds a booking that overlaps the time", () => {
    expect(findOverlap({ startsAt: "2026-10-20T10:30:00Z", endsAt: "2026-10-20T11:30:00Z" }, busy)?.trainer).toBe("Анна");
  });

  it("lets back-to-back times pass", () => {
    expect(findOverlap({ startsAt: "2026-10-20T11:00:00Z", endsAt: "2026-10-20T12:00:00Z" }, busy)).toBeNull();
  });
});

describe("segmentBookings", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const booking = (id: string, status: string, startsAt: string, sessionStatus = "scheduled") => ({ id, status, startsAt, sessionStatus });

  it("splits requests, upcoming and past", () => {
    const result = segmentBookings(
      [
        booking("later", "confirmed", "2026-10-25T10:00:00Z"),
        booking("soon", "confirmed", "2026-10-21T10:00:00Z"),
        booking("request", "requested", "2026-10-22T10:00:00Z"),
        booking("done", "attended", "2026-10-19T10:00:00Z"),
        booking("declined", "declined", "2026-10-23T10:00:00Z", "cancelled"),
        booking("over", "confirmed", "2026-10-20T11:00:00Z"),
      ],
      now,
    );
    expect(result.upcoming.map((item) => item.id)).toEqual(["soon", "later"]);
    expect(result.requests.map((item) => item.id)).toEqual(["request"]);
    expect(result.past.map((item) => item.id)).toEqual(["declined", "over", "done"]);
  });
});

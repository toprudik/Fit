import { describe, expect, it } from "vitest";
import { segmentBookings } from "./book";

describe("segmentBookings edges", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const booking = (id: string, status: string, startsAt: string, sessionStatus = "scheduled") => ({ id, status, startsAt, sessionStatus });

  it("puts a request whose time has passed into the past", () => {
    const result = segmentBookings([booking("stale", "requested", "2026-10-20T11:00:00Z")], now);
    expect(result.requests).toEqual([]);
    expect(result.past.map((item) => item.id)).toEqual(["stale"]);
  });

  it("puts a confirmed booking of a cancelled session into the past even when it is ahead", () => {
    const result = segmentBookings([booking("gone", "confirmed", "2026-10-22T10:00:00Z", "cancelled")], now);
    expect(result.upcoming).toEqual([]);
    expect(result.past.map((item) => item.id)).toEqual(["gone"]);
  });
});

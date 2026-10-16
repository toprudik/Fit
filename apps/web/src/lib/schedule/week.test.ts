import { describe, expect, it } from "vitest";
import { buildWeek, gridHours, isClosedMarker, type SessionRow, type SlotRow } from "./week";
import { weekDays } from "./time";

const ZONE = "Europe/Moscow";
const days = weekDays("2026-10-12");

const slot = (id: string, startsAt: string, endsAt: string, extra: Partial<SlotRow> = {}): SlotRow => ({
  id,
  starts_at: startsAt,
  ends_at: endsAt,
  status: "open",
  mode: "offline",
  template_item_id: "item",
  ...extra,
});

const session = (id: string, startsAt: string, endsAt: string, extra: Partial<SessionRow> = {}): SessionRow => ({
  id,
  kind: "personal",
  title: null,
  starts_at: startsAt,
  ends_at: endsAt,
  mode: "offline",
  capacity: 1,
  status: "scheduled",
  ...extra,
});

describe("buildWeek", () => {
  it("puts free slots and sessions on their local day, earliest first", () => {
    const week = buildWeek(
      days,
      [slot("s1", "2026-10-13T08:00:00Z", "2026-10-13T09:00:00Z"), slot("s2", "2026-10-13T06:00:00Z", "2026-10-13T07:00:00Z")],
      [session("x1", "2026-10-13T07:00:00Z", "2026-10-13T08:00:00Z", { kind: "group", capacity: 8 })],
      new Map([["x1", 5]]),
      ZONE,
    );
    const tuesday = week[1];
    expect(tuesday.day).toBe("2026-10-13");
    expect(tuesday.items.map((item) => [item.type, item.id, item.startMin, item.endMin])).toEqual([
      ["free", "s2", 9 * 60, 10 * 60],
      ["session", "x1", 10 * 60, 11 * 60],
      ["free", "s1", 11 * 60, 12 * 60],
    ]);
    expect(tuesday.items[1]).toMatchObject({ taken: 5 });
    expect(week.filter((day) => day.items.length > 0)).toHaveLength(1);
  });

  it("leaves out booked and single closed slots and cancelled sessions", () => {
    const week = buildWeek(
      days,
      [
        slot("booked", "2026-10-14T08:00:00Z", "2026-10-14T09:00:00Z", { status: "booked" }),
        slot("closed", "2026-10-14T10:00:00Z", "2026-10-14T11:00:00Z", { status: "closed" }),
      ],
      [session("gone", "2026-10-14T12:00:00Z", "2026-10-14T13:00:00Z", { status: "cancelled" })],
      new Map(),
      ZONE,
    );
    expect(week.flatMap((day) => day.items)).toEqual([]);
    expect(week.some((day) => day.closed)).toBe(false);
  });

  it("marks every local day a closed-days marker covers", () => {
    // 15 to 16 October in Moscow: 14 Oct 21:00 UTC to 16 Oct 21:00 UTC.
    const marker = slot("m", "2026-10-14T21:00:00Z", "2026-10-16T21:00:00Z", { status: "closed", template_item_id: null });
    expect(isClosedMarker(marker)).toBe(true);
    const week = buildWeek(days, [marker], [], new Map(), ZONE);
    expect(week.filter((day) => day.closed).map((day) => day.day)).toEqual(["2026-10-15", "2026-10-16"]);
  });

  it("ends an item that runs past midnight at the end of its day", () => {
    const week = buildWeek(days, [], [session("late", "2026-10-12T20:30:00Z", "2026-10-12T21:30:00Z")], new Map(), ZONE);
    expect(week[0].items[0]).toMatchObject({ startMin: 23 * 60 + 30, endMin: 24 * 60 });
  });
});

describe("gridHours", () => {
  it("shows 8 to 21 for an ordinary week and widens for early or late items", () => {
    expect(gridHours(buildWeek(days, [], [], new Map(), ZONE))).toEqual({ from: 8, to: 21 });
    const week = buildWeek(days, [slot("early", "2026-10-12T03:00:00Z", "2026-10-12T04:00:00Z")], [], new Map(), ZONE);
    expect(gridHours(week)).toEqual({ from: 6, to: 21 });
  });
});

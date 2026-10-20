import { describe, expect, it } from "vitest";
import { buildWeek, type SessionRow, type SlotRow } from "./week";
import { weekDays } from "./time";

const ZONE = "Europe/Moscow";
const days = weekDays("2026-10-12");

const slot: SlotRow = {
  id: "free",
  starts_at: "2026-10-13T07:00:00Z",
  ends_at: "2026-10-13T08:00:00Z",
  status: "open",
  mode: "offline",
  template_item_id: "item",
};

const session: SessionRow = {
  id: "busy",
  kind: "personal",
  title: null,
  starts_at: "2026-10-13T07:00:00Z",
  ends_at: "2026-10-13T08:00:00Z",
  mode: "offline",
  capacity: 1,
  status: "scheduled",
};

describe("buildWeek edges", () => {
  it("puts a session before a free slot at the same minute", () => {
    const week = buildWeek(days, [slot], [session], new Map(), ZONE);
    expect(week[1].items.map((item) => item.id)).toEqual(["busy", "free"]);
  });
});

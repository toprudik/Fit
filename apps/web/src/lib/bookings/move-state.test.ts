import { describe, expect, it } from "vitest";
import { moveBlock } from "./move-state";

const at = new Date("2026-10-20T10:00:00Z");
const booking = { status: "confirmed", kind: "personal", source: "client_slot", freeCancelUntil: "2026-10-21T10:00:00Z" } as const;

describe("moveBlock", () => {
  it("lets a confirmed personal booking move before its deadline", () => {
    expect(moveBlock(booking, at)).toBeNull();
  });

  it("names why a booking does not move", () => {
    expect(moveBlock(null, at)).toBe("not_found");
    expect(moveBlock({ ...booking, status: "rescheduled", freeCancelUntil: null }, at)).toBe("moved");
    expect(moveBlock({ ...booking, status: "cancelled", freeCancelUntil: null }, at)).toBe("closed");
    expect(moveBlock({ ...booking, status: "attended", freeCancelUntil: null }, at)).toBe("closed");
    expect(moveBlock({ ...booking, kind: "group" }, at)).toBe("fixed");
    expect(moveBlock({ ...booking, source: "trial" }, at)).toBe("fixed");
    expect(moveBlock({ ...booking, freeCancelUntil: "2026-10-20T09:00:00Z" }, at)).toBe("late");
  });
});

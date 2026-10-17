import { describe, expect, it } from "vitest";
import { bookingDecisionData, parseBotAction } from "./callback-data";

const ID = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("bot action callback_data", () => {
  it("round-trips a booking decision within Telegram's 64 bytes", () => {
    for (const accept of [true, false]) {
      const data = bookingDecisionData(ID, accept);
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(parseBotAction(data)).toEqual({ kind: "booking", accept, bookingId: ID });
    }
  });

  it.each(["", "bky", "bky:", "bky:not-a-uuid", `bkx:${ID}`, `bky:${ID}:1`, `bky:${ID.toUpperCase()}`])("refuses %j", (data) => {
    expect(parseBotAction(data)).toBeNull();
  });
});

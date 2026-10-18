import { describe, expect, it } from "vitest";
import { bookingChange } from "./history-present";

describe("bookingChange edges", () => {
  it("calls an event that keeps the status a change", () => {
    expect(bookingChange({ from: "confirmed", to: "confirmed", payload: {} })).toBe("changed");
  });
});

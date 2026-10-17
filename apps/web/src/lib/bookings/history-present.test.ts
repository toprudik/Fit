import { describe, expect, it } from "vitest";
import { bookingChange } from "./history-present";

describe("bookingChange", () => {
  it("names the first event by the status it starts with", () => {
    expect(bookingChange({ from: null, to: "requested", payload: {} })).toBe("requested");
    expect(bookingChange({ from: null, to: "confirmed", payload: { auto_confirmed: true } })).toBe("booked");
  });

  it("names a decision, an end and a move", () => {
    expect(bookingChange({ from: "requested", to: "confirmed", payload: {} })).toBe("confirmed");
    expect(bookingChange({ from: "requested", to: "declined", payload: {} })).toBe("declined");
    expect(bookingChange({ from: "requested", to: "expired", payload: {} })).toBe("expired");
    expect(bookingChange({ from: "confirmed", to: "late_cancelled", payload: {} })).toBe("lateCancelled");
    expect(bookingChange({ from: "confirmed", to: "rescheduled", payload: { rescheduled_to: "x" } })).toBe("rescheduled");
  });

  it("tells a first mark from a changed one", () => {
    expect(bookingChange({ from: "confirmed", to: "attended", payload: { method: "qr" } })).toBe("attended");
    expect(bookingChange({ from: "confirmed", to: "no_show", payload: {} })).toBe("noShow");
    expect(bookingChange({ from: "no_show", to: "attended", payload: {} })).toBe("remarked");
  });

  it("names a forgiven charge, whatever the status", () => {
    expect(bookingChange({ from: "late_cancelled", to: "late_cancelled", payload: { waiver_id: "w" } })).toBe("forgiven");
  });
});

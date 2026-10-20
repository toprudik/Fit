import { describe, expect, it } from "vitest";
import { isTimeZone } from "./options";

describe("isTimeZone", () => {
  it("knows current zone names that the runtime may list by an older alias", () => {
    expect(isTimeZone("Europe/Kyiv")).toBe(true);
    expect(isTimeZone("Asia/Kolkata")).toBe(true);
    expect(isTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isTimeZone("Europe/Moscow")).toBe(true);
  });

  it("refuses made-up zones, offsets and anything else", () => {
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("+03:00")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("Europe/Moscow; drop")).toBe(false);
  });
});

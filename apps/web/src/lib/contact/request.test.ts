import { describe, expect, it } from "vitest";
import { contactRequestPath, contactRequestTelegram, nextContactRequestAt } from "./request";

const NOW = new Date("2026-10-16T12:00:00Z");

describe("nextContactRequestAt", () => {
  it("allows a request when there was none or the last one is a day old", () => {
    expect(nextContactRequestAt(null, NOW)).toBeNull();
    expect(nextContactRequestAt("2026-10-15T12:00:00Z", NOW)).toBeNull();
  });

  it("names the time the next request opens within 24 hours", () => {
    expect(nextContactRequestAt("2026-10-16T09:30:00Z", NOW)).toEqual(new Date("2026-10-17T09:30:00Z"));
  });
});

describe("links", () => {
  it("opens the answer screen on the website and in the Mini App", () => {
    const id = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
    expect(contactRequestPath(id)).toBe(`/contact/${id}`);
    expect(contactRequestTelegram(id, "fitconnection_bot")).toBe(`https://t.me/fitconnection_bot?startapp=cr_${id}`);
  });
});

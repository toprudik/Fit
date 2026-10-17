import { describe, expect, it } from "vitest";
import { feedbackInput, platformLabel, routeOf, screenshotPath, screenshotProblem } from "./input";

describe("feedback input", () => {
  it("accepts PNG, JPG and WebP screenshots up to 5 MB (FDBK-3)", () => {
    expect(screenshotProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: "image/gif", size: 1000 })).toBe("type");
    expect(screenshotProblem({ type: "image/webp", size: 5 * 1024 * 1024 + 1 })).toBe("size");
    expect(screenshotProblem({ type: "image/jpeg", size: 0 })).toBe("size");
  });

  it("names screenshots under the author's folder and the message", () => {
    expect(screenshotPath("u1", "f1", 2, "image/jpeg")).toBe("u1/f1/2.jpg");
  });

  it("records the screen without its query", () => {
    expect(routeOf("/client/bookings/42?token=secret#x")).toBe("/client/bookings/42");
    expect(routeOf("https://evil.example/")).toBeNull();
    expect(routeOf("//evil.example/")).toBeNull();
    expect(routeOf(null)).toBeNull();
  });

  it("labels the surface and the device class", () => {
    expect(platformLabel({ inTelegram: true, coarsePointer: true })).toBe("tma-mobile");
    expect(platformLabel({ inTelegram: false, coarsePointer: false })).toBe("web-desktop");
  });

  it("refuses an empty text and a fourth screenshot (FDBK-3)", () => {
    const base = {
      id: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
      kind: "bug",
      body: "Не работает",
      route: null,
      zone: "client",
      platform: "web-desktop",
      locale: "ru",
      theme: "dark",
      screenshots: [],
    };
    expect(feedbackInput.safeParse(base).success).toBe(true);
    expect(feedbackInput.safeParse({ ...base, body: "   " }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...base, screenshots: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

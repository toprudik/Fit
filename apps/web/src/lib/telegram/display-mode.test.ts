import { describe, expect, it } from "vitest";
import { displayModeFor } from "./display-mode";

describe("displayModeFor", () => {
  it.each(["ios", "android", "android_x"])("opens fullscreen on a phone (%s)", (platform) => {
    expect(displayModeFor(platform)).toBe("fullscreen");
  });

  // Fullscreen on a computer would cover the whole desktop, so these get Telegram's full window height.
  it.each(["tdesktop", "macos", "weba", "webk", "unigram", "web", "unknown", "", "IOS"])("stays at full height on %j", (platform) => {
    expect(displayModeFor(platform)).toBe("expanded");
  });

  it("stays at full height when the client does not say", () => {
    expect(displayModeFor(undefined)).toBe("expanded");
  });
});

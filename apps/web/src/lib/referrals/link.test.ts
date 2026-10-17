import { describe, expect, it } from "vitest";
import { startParamPath } from "@/lib/telegram/start-param";
import { isReferralCode, referralPath, referralTelegram, referralUrl } from "./link";

describe("referral link", () => {
  it("accepts only the database's code shape", () => {
    expect(isReferralCode("a1b2c3d4e5")).toBe(true);
    expect(isReferralCode("A1B2C3D4E5")).toBe(false);
    expect(isReferralCode("a1b2c3d4e")).toBe(false);
    expect(isReferralCode(null)).toBe(false);
  });

  it("builds the web and Telegram addresses", () => {
    expect(referralPath("a1b2c3d4e5")).toBe("/r/a1b2c3d4e5");
    expect(referralUrl("a1b2c3d4e5", "https://app.example.com")).toBe("https://app.example.com/r/a1b2c3d4e5");
    expect(referralTelegram("a1b2c3d4e5", "example_bot")).toBe("https://t.me/example_bot?startapp=rf_a1b2c3d4e5");
  });

  it("opens the landing from startapp=rf_<code>", () => {
    expect(startParamPath("rf_a1b2c3d4e5")).toBe("/r/a1b2c3d4e5");
    expect(startParamPath("rf_bad")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { formatInviteCode, inviteTelegramLink, normalizeInviteCode, redeemPath } from "./code";

describe("trainer invite codes", () => {
  it("normalizes case, dashes and spaces the way the database does", () => {
    expect(normalizeInviteCode(" abcd-efgh jklm ")).toBe("ABCDEFGHJKLM");
    expect(normalizeInviteCode("")).toBe("");
  });

  it("groups the code by four", () => {
    expect(formatInviteCode("abcdefghjklm")).toBe("ABCD-EFGH-JKLM");
    expect(formatInviteCode("ABCDE")).toBe("ABCD-E");
    expect(formatInviteCode("")).toBe("");
  });

  it("builds the Mini App link with startapp=ti_<code>", () => {
    expect(inviteTelegramLink("abcd-efgh-jklm", "fitconnection_bot")).toBe(
      "https://t.me/fitconnection_bot?startapp=ti_ABCDEFGHJKLM",
    );
  });

  it("points the redeem screen at the code, or at the empty form", () => {
    expect(redeemPath("abcd-efgh")).toBe("/onboarding/trainer?code=ABCDEFGH");
    expect(redeemPath("")).toBe("/onboarding/trainer");
    expect(redeemPath(null)).toBe("/onboarding/trainer");
  });
});

import { describe, expect, it } from "vitest";
import { shareTarget } from "./target";

const APP = "https://app.example.test";
const BOT = "example_bot";

describe("shareTarget", () => {
  it("reads a client's referral link", () => {
    expect(shareTarget(`${APP}/r/abc123def4`, APP, BOT)).toEqual({
      kind: "referral",
      telegram: "https://t.me/example_bot?startapp=rf_abc123def4",
    });
  });

  it("reads a trainer's invitation for trainers", () => {
    expect(shareTarget(`${APP}/onboarding/trainer?code=ABCDEFGHJKLM`, APP, BOT)).toEqual({
      kind: "trainer_invite",
      telegram: "https://t.me/example_bot?startapp=ti_ABCDEFGHJKLM",
    });
  });

  it("reads a trainer's link for clients", () => {
    expect(shareTarget(`${APP}/i/abcdefghijklmnopqrstuv`, APP, BOT)).toEqual({
      kind: "client_link",
      telegram: "https://t.me/example_bot?startapp=ci_abcdefghijklmnopqrstuv",
    });
  });

  it("refuses links of other sites and other screens", () => {
    for (const link of [
      "https://elsewhere.example.test/r/abc123def4",
      `${APP}/r/short`,
      `${APP}/trainer/team`,
      `${APP}/onboarding/trainer`,
      `${APP}/onboarding/trainer?code=ABC`,
      `${APP}/onboarding/trainer?code=ABCDEFGHJKLM&next=/admin`,
      "not a link",
    ]) {
      expect(shareTarget(link, APP, BOT)).toBeNull();
    }
  });
});

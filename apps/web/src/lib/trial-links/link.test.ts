import { describe, expect, it } from "vitest";
import { formatTrialPrice, isTrialToken, trialPath, trialTelegram, trialUrl } from "./link";

const TOKEN = "Ab3_-Ab3_-Ab3_-Ab3_-Ab";

describe("trial links", () => {
  it("accepts only database-shaped tokens", () => {
    expect(isTrialToken(TOKEN)).toBe(true);
    expect(isTrialToken("short")).toBe(false);
    expect(isTrialToken(null)).toBe(false);
  });

  it("builds the page, web and Telegram addresses", () => {
    expect(trialPath(TOKEN)).toBe(`/trial/${TOKEN}`);
    expect(trialUrl(TOKEN, "https://dafit.example")).toBe(`https://dafit.example/trial/${TOKEN}`);
    expect(trialTelegram(TOKEN, "fitconnection_bot")).toBe(`https://t.me/fitconnection_bot?startapp=tl_${TOKEN}`);
  });

  it("formats the price in the viewer's language, with kopecks only when there are some", () => {
    expect(formatTrialPrice("ru", 150000, "RUB").replace(/\s/g, " ")).toBe("1 500 ₽");
    expect(formatTrialPrice("en", 150050, "USD")).toBe("$1,500.50");
  });
});

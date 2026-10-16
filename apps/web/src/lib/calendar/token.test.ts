import { describe, expect, it } from "vitest";
import { feedToken, feedUrls } from "./token";

const TOKEN = "Ab3_-xY9Ab3_-xY9Ab3_-xY9Ab3_-xY9Ab3_-xY9Ab3";

describe("feedToken", () => {
  it("accepts a base64url token with or without .ics", () => {
    expect(feedToken(TOKEN)).toBe(TOKEN);
    expect(feedToken(`${TOKEN}.ics`)).toBe(TOKEN);
  });

  it("refuses anything else before it reaches the database", () => {
    expect(feedToken("short")).toBeNull();
    expect(feedToken(`${TOKEN}%2F..`)).toBeNull();
    expect(feedToken(`${TOKEN}=`)).toBeNull();
    expect(feedToken("a".repeat(101))).toBeNull();
  });
});

describe("feedUrls", () => {
  it("gives the https link, its webcal twin and the Google Calendar subscribe link", () => {
    const urls = feedUrls("https://fit.example", TOKEN);
    expect(urls.https).toBe(`https://fit.example/api/calendar/${TOKEN}.ics`);
    expect(urls.webcal).toBe(`webcal://fit.example/api/calendar/${TOKEN}.ics`);
    expect(urls.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urls.webcal)}`);
  });
});

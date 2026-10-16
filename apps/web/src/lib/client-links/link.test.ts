import { describe, expect, it } from "vitest";
import {
  clientLinkPath,
  clientLinkTelegram,
  clientLinkUrl,
  isClientLinkToken,
  joinPath,
  normalizeClientCode,
  personName,
  tokenFromScan,
} from "./link";

const TOKEN = "Ab3_-Ab3_-Ab3_-Ab3_-Ab";

describe("client links", () => {
  it("accepts only 22-character base64url tokens", () => {
    expect(isClientLinkToken(TOKEN)).toBe(true);
    expect(isClientLinkToken(TOKEN.slice(1))).toBe(false);
    expect(isClientLinkToken(`${TOKEN.slice(1)}/`)).toBe(false);
    expect(isClientLinkToken(null)).toBe(false);
  });

  it("builds the landing, web and Telegram addresses", () => {
    expect(clientLinkPath(TOKEN)).toBe(`/i/${TOKEN}`);
    expect(clientLinkUrl(TOKEN, "https://dafit.example")).toBe(`https://dafit.example/i/${TOKEN}`);
    expect(clientLinkTelegram(TOKEN, "fitconnection_bot")).toBe(`https://t.me/fitconnection_bot?startapp=ci_${TOKEN}`);
  });

  it("normalizes a typed code and builds the join screen path", () => {
    expect(normalizeClientCode(" ab-c d2 ")).toBe("ABCD2");
    expect(joinPath("abc-def")).toBe("/join?code=ABCDEF");
    expect(joinPath("")).toBe("/join");
    expect(joinPath(null)).toBe("/join");
  });

  it("reads the token from a scanned web or Telegram link", () => {
    expect(tokenFromScan(`https://dafit.example/i/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromScan(`  https://dafit.example/i/${TOKEN}/ `)).toBe(TOKEN);
    expect(tokenFromScan(`https://t.me/fitconnection_bot?startapp=ci_${TOKEN}`)).toBe(TOKEN);
  });

  it("ignores anything else in a QR", () => {
    expect(tokenFromScan("hello")).toBeNull();
    expect(tokenFromScan(`javascript:alert(1)//i/${TOKEN}`)).toBeNull();
    expect(tokenFromScan("https://dafit.example/i/short")).toBeNull();
    expect(tokenFromScan(`https://t.me/fitconnection_bot?startapp=ti_${TOKEN}`)).toBeNull();
    expect(tokenFromScan(`https://evil.example/?startapp=ci_${TOKEN}`)).toBeNull();
  });

  it("joins the name parts that exist", () => {
    expect(personName("Анна", "Смирнова")).toBe("Анна Смирнова");
    expect(personName(" Анна ", null)).toBe("Анна");
    expect(personName(null, undefined)).toBe("");
  });
});

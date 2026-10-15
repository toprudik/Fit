import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, INTL_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, matchLocale, negotiateLocale, parseAcceptLanguage } from "./config";

describe("locales", () => {
  it("supports Russian and English, Russian by default", () => {
    expect(LOCALES).toEqual(["ru", "en"]);
    expect(DEFAULT_LOCALE).toBe("ru");
    expect(LOCALE_COOKIE).toBe("dafit-locale");
  });

  it("has an Intl tag for every locale", () => {
    expect(INTL_LOCALE).toEqual({ ru: "ru-RU", en: "en-US" });
    for (const locale of LOCALES) expect(Intl.NumberFormat.supportedLocalesOf(INTL_LOCALE[locale])).toHaveLength(1);
  });

  it.each([
    ["ru", true],
    ["en", true],
    ["EN", false],
    ["en-US", false],
    ["de", false],
    ["", false],
    [null, false],
    [undefined, false],
    [1, false],
  ])("isLocale(%j) is %s", (value, expected) => {
    expect(isLocale(value)).toBe(expected);
  });
});

describe("matchLocale", () => {
  it.each([
    ["ru", "ru"],
    ["ru-RU", "ru"],
    ["EN", "en"],
    ["en-GB", "en"],
    ["en_US", "en"],
    [" en-us ", "en"],
    ["de", null],
    ["uk-UA", null],
    ["english", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("%j → %j", (tag, expected) => {
    expect(matchLocale(tag)).toBe(expected);
  });
});

describe("parseAcceptLanguage", () => {
  it("orders tags by quality, keeping header order for ties", () => {
    expect(parseAcceptLanguage("de;q=0.5, en-US, ru;q=0.9, en;q=0.9")).toEqual(["en-US", "ru", "en", "de"]);
  });

  it("drops the wildcard, refused tags and broken qualities", () => {
    expect(parseAcceptLanguage("*, fr;q=0, en;q=abc, ru;q=0.1")).toEqual(["ru"]);
  });

  it("tolerates spaces and empty parts", () => {
    expect(parseAcceptLanguage(" en-US ; q=0.8 ,, ru ")).toEqual(["ru", "en-US"]);
  });

  it("returns nothing for a missing header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });
});

describe("negotiateLocale", () => {
  it("prefers the saved choice over everything else", () => {
    expect(negotiateLocale({ saved: "en", languageCode: "ru", acceptLanguage: "ru-RU" })).toBe("en");
    expect(negotiateLocale({ saved: "ru", acceptLanguage: "en-US,en;q=0.9" })).toBe("ru");
  });

  it("ignores a saved value it does not support", () => {
    expect(negotiateLocale({ saved: "de", acceptLanguage: "en-US" })).toBe("en");
    expect(negotiateLocale({ saved: "EN", acceptLanguage: "ru" })).toBe("ru");
  });

  it("uses Telegram's language code before the browser's", () => {
    expect(negotiateLocale({ languageCode: "en", acceptLanguage: "ru-RU,ru;q=0.9" })).toBe("en");
    expect(negotiateLocale({ languageCode: "ru", acceptLanguage: "en-US" })).toBe("ru");
  });

  it("falls back to Accept-Language when Telegram sends a blank code", () => {
    expect(negotiateLocale({ languageCode: "  ", acceptLanguage: "en-GB,en;q=0.9" })).toBe("en");
  });

  it("only counts the primary language", () => {
    // A German speaker with English as a second browser language gets the default, not English.
    expect(negotiateLocale({ acceptLanguage: "de-DE,de;q=0.9,en;q=0.8" })).toBe("ru");
    expect(negotiateLocale({ languageCode: "uk", acceptLanguage: "en-US" })).toBe("ru");
  });

  it("picks the most preferred browser language, not the first listed", () => {
    expect(negotiateLocale({ acceptLanguage: "ru;q=0.5, en-US;q=0.9" })).toBe("en");
  });

  it("defaults to Russian with nothing to go on", () => {
    expect(negotiateLocale({})).toBe("ru");
    expect(negotiateLocale({ saved: null, languageCode: null, acceptLanguage: null })).toBe("ru");
  });
});

import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "./config";
import { dictionaries } from "./dictionaries";

type Entry = { key: string; value: string };

/** Flattens a catalog into dotted keys, so failures name the exact string. */
function entries(node: unknown, prefix = ""): Entry[] {
  if (typeof node === "string") return [{ key: prefix, value: node }];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, child]) => entries(child, prefix ? `${prefix}.${key}` : key));
  }
  return [{ key: prefix, value: `<${typeof node}>` }];
}

/** Keys with the type of their value; arrays and objects are walked, so shape changes show up too. */
function shape(node: unknown, prefix = ""): string[] {
  if (node && typeof node === "object") {
    const kind = Array.isArray(node) ? "array" : "object";
    return [`${prefix}:${kind}`, ...Object.entries(node).flatMap(([key, child]) => shape(child, `${prefix}.${key}`))];
  }
  return [`${prefix}:${typeof node}`];
}

/** Language names are written in their own language (ru.ts), so they are exempt from per-language checks. */
const OWN_LANGUAGE_NAMES = /^languages\./;

const all = LOCALES.flatMap((locale) => entries(dictionaries[locale]).map((entry) => ({ locale, ...entry })));
const byLocale = (locale: Locale) => all.filter((entry) => entry.locale === locale);

/** Lists offending strings as "locale key: value" so a failure reads like a to-do list. */
function offenders(predicate: (entry: Entry & { locale: Locale }) => boolean, from = all) {
  return from.filter(predicate).map(({ locale, key, value }) => `${locale} ${key}: ${value}`);
}

// Lookarounds instead of \b: \b only knows ASCII letters, and most of these words are Cyrillic.
const word = (source: string) => new RegExp(`(?<!\\p{L})(?:${source})(?!\\p{L})`, "iu");

describe("dictionaries", () => {
  it("has a catalog for every locale", () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...LOCALES].sort());
  });

  it("has the same keys in every catalog", () => {
    const reference = shape(dictionaries.ru);
    for (const locale of LOCALES) expect(shape(dictionaries[locale]), locale).toEqual(reference);
  });

  it("has only strings at the leaves", () => {
    expect(offenders(({ value }) => value.startsWith("<"))).toEqual([]);
  });

  it("has no empty or padded strings", () => {
    expect(offenders(({ value }) => value.trim() === "" || value !== value.trim() || /\s{2,}/.test(value))).toEqual([]);
  });

  it("keeps the same placeholders in every language", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const ru = new Map(byLocale("ru").map((entry) => [entry.key, placeholders(entry.value)]));
    for (const entry of byLocale("en")) expect(placeholders(entry.value), entry.key).toEqual(ru.get(entry.key));
  });
});

/** Mechanical part of docs/writing.md; the rest needs a human read. */
describe("dictionaries follow docs/writing.md", () => {
  it("has no exclamation marks", () => {
    expect(offenders(({ value }) => value.includes("!"))).toEqual([]);
  });

  it("has no emoji", () => {
    expect(offenders(({ value }) => /\p{Extended_Pictographic}/u.test(value))).toEqual([]);
  });

  it("has no em dashes", () => {
    expect(offenders(({ value }) => value.includes("—"))).toEqual([]);
  });

  it("uses en dashes only in number and time ranges", () => {
    // "08:00–09:00", "1–5", "{from}–{to}" are data formats; anything else is a dash in prose.
    expect(offenders(({ value }) => /–/.test(value.replace(/[\d}]–[\d{]/g, "")))).toEqual([]);
  });

  it("has no hyphen or minus standing in for a dash", () => {
    expect(offenders(({ value }) => / [-−] /.test(value))).toEqual([]);
  });

  it("joins parts with commas, not middle dots", () => {
    expect(offenders(({ value }) => value.includes("·"))).toEqual([]);
  });

  it("has no bureaucratic or filler words in Russian", () => {
    const banned = word(
      [
        "являет(?:ся|есь|ются)",
        "представля\\p{L}* собой",
        "осуществ\\p{L}*",
        "производит\\p{L}* оплат\\p{L}*",
        "в рамках",
        // "данные" (data) is a normal word; the demonstrative singular forms are not.
        "данн(?:ый|ая|ое|ого|ой|ом|ую|ым)",
        "ключев\\p{L}*",
        "важно отметить",
        "стоит отметить",
        "позволя\\p{L}*",
        "обеспечива\\p{L}*",
        "играет важную роль",
        "уникальн\\p{L}*",
        "инновацион\\p{L}*",
        "бесшовн\\p{L}*",
        "комплексн\\p{L}*",
      ].join("|"),
    );
    expect(offenders(({ value }) => banned.test(value), byLocale("ru"))).toEqual([]);
  });

  it("speaks to the user as «ты» in Russian", () => {
    const formal = word("вы|вас|вам|вами|ваш\\p{L}*");
    expect(offenders(({ value }) => formal.test(value), byLocale("ru"))).toEqual([]);
  });

  it("has no AI-flavoured words in English", () => {
    const banned = word("delve\\p{L}*|seamless\\p{L}*|robust\\p{L}*|leverag\\p{L}*|crucial\\p{L}*|utiliz\\p{L}*|empower\\p{L}*");
    expect(offenders(({ value }) => banned.test(value), byLocale("en"))).toEqual([]);
  });

  it("has no Cyrillic in English strings", () => {
    expect(offenders(({ key, value }) => !OWN_LANGUAGE_NAMES.test(key) && /\p{Script=Cyrillic}/u.test(value), byLocale("en"))).toEqual([]);
  });

  it("writes English in sentence case", () => {
    // Words that keep their capital mid-sentence. Extend when a new name or acronym appears in copy.
    const properNouns = new Set([
      "DaFit", "Telegram", "QR", "Pro", "Premium", "English", "I", "OK", "JPG", "PNG", "PDF", "MB",
      "USA", "Russia", "Supabase", "Vercel", "Start",
    ]);
    const titleCased = (value: string) =>
      value
        // Sentence starts may be capitalised: the first word and any word after ". ", "? " or ": ".
        .split(/(?<=[.?:])\s+/)
        .flatMap((sentence) => sentence.split(/\s+/).slice(1))
        .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
        .some((token) => /^\p{Lu}/u.test(token) && !properNouns.has(token));
    expect(offenders(({ key, value }) => !OWN_LANGUAGE_NAMES.test(key) && titleCased(value), byLocale("en"))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { exerciseDescription, keyLabel, libraryQuery, licenseLabel, normalizeVideoUrl } from "./catalog";

describe("normalizeVideoUrl", () => {
  it("keeps https links and drops empty ones", () => {
    expect(normalizeVideoUrl("  https://youtu.be/abc ")).toBe("https://youtu.be/abc");
    expect(normalizeVideoUrl("   ")).toBeNull();
  });

  it("refuses anything but an https link (PRD 2.10-8, the database checks the same)", () => {
    expect(normalizeVideoUrl("http://youtu.be/abc")).toBeUndefined();
    expect(normalizeVideoUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeVideoUrl("youtube")).toBeUndefined();
    expect(normalizeVideoUrl("https://localhost/x")).toBeUndefined();
    expect(normalizeVideoUrl(`https://a.ru/${"x".repeat(500)}`)).toBeUndefined();
  });
});

describe("libraryQuery", () => {
  it("reads the search, a known group and the own filter from the URL", () => {
    expect(libraryQuery({ q: "  присед ", category: "legs", own: "1" })).toEqual({ q: "присед", category: "legs", own: true });
  });

  it("drops what it does not know", () => {
    expect(libraryQuery({ q: "  ", category: "feet", own: "yes" })).toEqual({ q: undefined, category: undefined, own: undefined });
    expect(libraryQuery({ q: ["жим", "тяга"] }).q).toBe("жим");
    expect(libraryQuery({ q: "a".repeat(300) }).q).toHaveLength(100);
  });
});

describe("labels", () => {
  it("names a license the way the credit line does", () => {
    expect(licenseLabel("CC-BY-SA-4.0")).toBe("CC-BY-SA 4.0");
    expect(licenseLabel("CC0-1.0")).toBe("CC0 1.0");
  });

  it("falls back to the raw key", () => {
    expect(keyLabel({ legs: "Ноги" }, "legs")).toBe("Ноги");
    expect(keyLabel({ legs: "Ноги" }, "neck")).toBe("neck");
  });
});

describe("exerciseDescription", () => {
  it("shows a wger exercise's text only in the reader's language", () => {
    expect(exerciseDescription("wger", "Бег трусцой в парке", "Running in a park", null)).toBe("Бег трусцой в парке");
    expect(exerciseDescription("wger", null, "Running in a park", "Running in a park")).toBeNull();
  });

  it("falls back to English, then the owner's text, for an own exercise", () => {
    expect(exerciseDescription("custom", null, "Slow squat", "Медленный присед")).toBe("Slow squat");
    expect(exerciseDescription("custom", null, null, "Медленный присед")).toBe("Медленный присед");
    expect(exerciseDescription("custom", null, null, null)).toBeNull();
  });
});

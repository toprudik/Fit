import { describe, expect, it } from "vitest";
import { monthLabel, monthStart, seasonChallengeFrom } from "./season";

describe("season challenge", () => {
  it("takes a month field or a first day and nothing else", () => {
    expect(monthStart("2027-01")).toBe("2027-01-01");
    expect(monthStart("2027-01-01")).toBe("2027-01-01");
    expect(monthStart("2027-01-05")).toBeNull();
    expect(monthStart("2027-13")).toBeNull();
    expect(monthStart(null)).toBeNull();
  });

  it("names the month in the reader's language", () => {
    expect(monthLabel("ru", "2027-01-01")).toBe("январь 2027");
    expect(monthLabel("en", "2027-01-01")).toBe("January 2027");
  });

  it("reads the row and drops a malformed one", () => {
    const row = { id: "x", title: "Январь без пропусков", month: "2027-01-01", joined: true, finished: false, result: null, attended: 3, missed: 0, ahead: 2 };
    expect(seasonChallengeFrom([row])).toEqual({ ...row, result: null });
    expect(seasonChallengeFrom([{ ...row, result: "done", attended: null }])).toMatchObject({ result: "done", attended: 0 });
    expect(seasonChallengeFrom([])).toBeNull();
    expect(seasonChallengeFrom([{ ...row, month: "январь" }])).toBeNull();
  });
});

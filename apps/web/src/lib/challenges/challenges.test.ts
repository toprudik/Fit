import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { isChallengeMetric, isChallengeWeeks, joinErrorOf, parseGoal, shareOfMetric, stateOf } from "./challenges";
import { challengePeriod, challengeScore, nextMonday } from "./present";

describe("challenge rules (wave-3 §2.3–2.4)", () => {
  it("has no body metric", () => {
    expect(isChallengeMetric("steps")).toBe(true);
    expect(isChallengeMetric("weight")).toBe(false);
    expect(isChallengeMetric("measurements")).toBe(false);
  });

  it("counts each metric from its share", () => {
    expect(shareOfMetric("workouts")).toBe("workouts");
    expect(shareOfMetric("steps")).toBe("steps");
    expect(shareOfMetric("diary_days")).toBe("nutrition");
    expect(shareOfMetric("adherence_days")).toBe("nutrition");
  });

  it("lasts 1 to 12 whole weeks", () => {
    expect(isChallengeWeeks(1)).toBe(true);
    expect(isChallengeWeeks(12)).toBe(true);
    expect(isChallengeWeeks(0)).toBe(false);
    expect(isChallengeWeeks(13)).toBe(false);
    expect(isChallengeWeeks(2.5)).toBe(false);
  });

  it("reads an optional goal", () => {
    expect(parseGoal("")).toEqual({ ok: true, value: null });
    expect(parseGoal(" 100 000 ")).toEqual({ ok: true, value: 100000 });
    expect(parseGoal("0")).toEqual({ ok: false });
    expect(parseGoal("12.5")).toEqual({ ok: false });
    expect(parseGoal("10000001")).toEqual({ ok: false });
  });

  it("works out the state for the trainer's list", () => {
    const base = { cancelled_at: null, finished_at: null, starts_on: "2026-10-19" };
    expect(stateOf(base, "2026-10-17")).toBe("upcoming");
    expect(stateOf(base, "2026-10-19")).toBe("active");
    expect(stateOf({ ...base, finished_at: "2026-11-02T00:07:00Z" }, "2026-11-02")).toBe("finished");
    expect(stateOf({ ...base, cancelled_at: "2026-10-18T10:00:00Z" }, "2026-10-17")).toBe("cancelled");
  });

  it("names the join errors", () => {
    expect(joinErrorOf("share_needed")).toBe("share_needed");
    expect(joinErrorOf("challenge_closed")).toBe("closed");
    expect(joinErrorOf("not_allowed")).toBe("failed");
  });
});

describe("challenge texts", () => {
  const ru = dictionaries.ru.challenges;
  const en = dictionaries.en.challenges;

  it("writes the period and the score", () => {
    expect(challengePeriod(ru, "ru", "2026-10-19", "2026-11-01")).toBe("с 19 октября по 1 ноября");
    expect(challengePeriod(en, "en", "2026-10-19", "2026-11-01")).toBe("October 19 to November 1");
    expect(challengeScore(ru, "ru", "steps", 12400)).toBe("12\u00a0400 шагов");
    expect(challengeScore(ru, "ru", "workouts", 3)).toBe("3 тренировки");
    expect(challengeScore(en, "en", "diary_days", 1)).toBe("1 day");
  });

  it("finds the next Monday", () => {
    expect(nextMonday("2026-10-17")).toBe("2026-10-19");
    expect(nextMonday("2026-10-19")).toBe("2026-10-26");
    expect(nextMonday("2026-10-18")).toBe("2026-10-19");
  });
});

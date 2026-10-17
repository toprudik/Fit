import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { formatHomeworkDay, homeworkSchedule } from "./format";
import {
  addDays,
  canMark,
  canUnmark,
  completionRate,
  currentOccurrence,
  draftFromHomework,
  homeworkPayload,
  logDraftFromHomework,
  occurrenceState,
  type Homework,
  type HomeworkDraft,
} from "./homework";

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const HOMEWORK = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const TODAY = "2026-10-17";

const occurrence = (id: string, dueOn: string, doneAt: string | null = null) => ({ id, dueOn, doneAt, comment: null, workoutLogId: null });

const homework = (occurrences: Homework["occurrences"], extra: Partial<Homework> = {}): Homework => ({
  id: HOMEWORK,
  coachingId: PAIR,
  title: "Планка",
  description: null,
  videoUrl: null,
  dueDate: occurrences[0]?.dueOn ?? TODAY,
  repeatWeekdays: null,
  repeatUntil: null,
  archived: false,
  exercises: [],
  occurrences,
  ...extra,
});

const draft = (extra: Partial<HomeworkDraft> = {}): HomeworkDraft => ({
  title: " Планка ",
  description: "",
  videoUrl: "",
  dueDate: "2026-10-18",
  repeat: false,
  weekdays: [],
  repeatUntil: "",
  exercises: [],
  ...extra,
});

describe("dates and states", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("calls a deadline past its day without a mark overdue (10.3)", () => {
    expect(occurrenceState(occurrence("a", "2026-10-16"), TODAY)).toBe("overdue");
    expect(occurrenceState(occurrence("a", TODAY), TODAY)).toBe("open");
    expect(occurrenceState(occurrence("a", "2026-10-16", "2026-10-16T10:00:00Z"), TODAY)).toBe("done");
  });

  it("shows the earliest deadline without a mark, else the last one", () => {
    const h = homework([occurrence("a", "2026-10-16", "2026-10-16T10:00:00Z"), occurrence("b", "2026-10-19"), occurrence("c", "2026-10-21")]);
    expect(currentOccurrence(h)?.id).toBe("b");
    expect(currentOccurrence(homework([occurrence("a", "2026-10-16", "x"), occurrence("b", "2026-10-18", "y")]))?.id).toBe("b");
    expect(currentOccurrence(homework([]))).toBeNull();
  });

  it("lets the client mark a deadline that came, or the earliest one ahead", () => {
    const h = homework([occurrence("a", "2026-10-19"), occurrence("b", "2026-10-21")]);
    expect(canMark(h, h.occurrences[0], TODAY)).toBe(true);
    expect(canMark(h, h.occurrences[1], TODAY)).toBe(false);
    expect(canMark({ ...h, archived: true }, h.occurrences[0], TODAY)).toBe(false);
  });

  it("allows taking a mark back within 24 hours only", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(canUnmark(occurrence("a", TODAY, "2026-10-16T12:30:00Z"), now)).toBe(true);
    expect(canUnmark(occurrence("a", TODAY, "2026-10-16T11:30:00Z"), now)).toBe(false);
    expect(canUnmark(occurrence("a", TODAY), now)).toBe(false);
  });
});

describe("completionRate (10-6, 10.4)", () => {
  it("counts every deadline due in the last 30 days, and early marks", () => {
    const repeat = homework([
      occurrence("a", "2026-10-12", "x"),
      occurrence("b", "2026-10-14"),
      occurrence("c", "2026-10-16", "y"),
      occurrence("d", "2026-10-19", "z"),
      occurrence("e", "2026-10-21"),
    ]);
    const old = homework([occurrence("f", "2026-09-17", "w")]);
    expect(completionRate([repeat, old], TODAY)).toEqual({ done: 3, total: 4, percent: 75 });
  });

  it("is null when nothing was due", () => {
    expect(completionRate([homework([occurrence("a", "2026-10-20")])], TODAY)).toBeNull();
  });
});

describe("homeworkPayload", () => {
  it("builds a one-off homework for a pair", () => {
    expect(homeworkPayload(draft({ videoUrl: " https://youtu.be/x " }), TODAY, { coachingId: PAIR })).toEqual({
      ok: true,
      payload: {
        coaching_id: PAIR,
        title: "Планка",
        description: null,
        video_url: "https://youtu.be/x",
        due_date: "2026-10-18",
        repeat_weekdays: null,
        repeat_until: null,
        exercises: [],
      },
    });
  });

  it("sends the exercises in order with a trimmed prescription", () => {
    const exercises = [
      { key: "a", exerciseId: "e1", name: "Планка", prescription: " 3 × 1 мин " },
      { key: "b", exerciseId: "e2", name: "Мостик", prescription: "  " },
    ];
    const result = homeworkPayload(draft({ exercises }), TODAY, { coachingId: PAIR });
    expect(result.ok && result.payload.exercises).toEqual([
      { exercise_id: "e1", prescription: "3 × 1 мин" },
      { exercise_id: "e2", prescription: null },
    ]);
  });

  it("sorts weekdays and keeps them once", () => {
    const result = homeworkPayload(draft({ repeat: true, weekdays: [5, 1, 3, 1], repeatUntil: "2026-11-15" }), TODAY, {
      coachingId: PAIR,
    });
    expect(result.ok && result.payload.repeat_weekdays).toEqual([1, 3, 5]);
  });

  it("names every field that is wrong", () => {
    expect(
      homeworkPayload(draft({ title: " ", videoUrl: "http://x", dueDate: "2026-10-16", repeat: true, repeatUntil: "2027-06-01" }), TODAY, {
        coachingId: PAIR,
      }),
    ).toEqual({ ok: false, errors: ["title", "videoUrl", "dueDate", "weekdays", "repeatUntil"] });
  });

  it("keeps a past deadline an edit does not change", () => {
    const result = homeworkPayload(draft({ dueDate: "2026-10-10" }), TODAY, { id: HOMEWORK, dueDate: "2026-10-10" });
    expect(result.ok && result.payload).toMatchObject({ id: HOMEWORK, due_date: "2026-10-10" });
  });

  it("fills the form back from a saved homework", () => {
    const saved = homework([occurrence("a", "2026-10-19")], { repeatWeekdays: [1], repeatUntil: "2026-11-16", description: "3 по минуте" });
    expect(draftFromHomework(saved)).toEqual({
      title: "Планка",
      description: "3 по минуте",
      videoUrl: "",
      dueDate: "2026-10-19",
      repeat: true,
      weekdays: [1],
      repeatUntil: "2026-11-16",
      exercises: [],
    });
  });

  it("starts a log of sets from the homework's exercises (10.2)", () => {
    const saved = homework([occurrence("a", TODAY)], {
      exercises: [{ exerciseId: "e1", name: "Планка", prescription: "3 × 1 мин" }],
    });
    expect(logDraftFromHomework(saved, TODAY)).toEqual({
      title: "Планка",
      date: TODAY,
      durationMin: "",
      notes: "",
      exercises: [
        {
          key: "homework-0-e1",
          exerciseId: "e1",
          name: "Планка",
          notes: "3 × 1 мин",
          sets: [{ reps: "", weight: "", duration: "", warmup: false }],
        },
      ],
    });
  });
});

describe("format", () => {
  it("writes the day as given, with no time zone shift", () => {
    expect(formatHomeworkDay("ru", "2026-10-18")).toBe("18 октября");
    expect(formatHomeworkDay("en", "2026-10-18")).toBe("October 18");
  });

  it("describes a one-off and a repeat", () => {
    const t = dictionaries.ru;
    expect(homeworkSchedule(t, "ru", { dueDate: "2026-10-18", repeatWeekdays: null, repeatUntil: null })).toBe("Срок 18 октября");
    expect(homeworkSchedule(t, "ru", { dueDate: "2026-10-19", repeatWeekdays: [1, 3, 5], repeatUntil: "2026-11-15" })).toBe(
      "Пн, Ср, Пт до 15 ноября",
    );
  });
});

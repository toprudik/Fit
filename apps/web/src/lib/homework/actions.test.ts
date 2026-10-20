import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeworkPayload } from "./homework";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { archiveHomework, markHomeworkDone, saveHomework, unmarkHomeworkDone } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const HOMEWORK = "00000000-0000-4000-8000-000000000002";
const OCCURRENCE = "00000000-0000-4000-8000-000000000003";
const LOG = "00000000-0000-4000-8000-000000000004";

const refused = (message: string) => ({ data: null, error: { code: "P0001", message } });
const broken = { data: null, error: { code: "XX000", message: "internal detail" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("saveHomework", () => {
  const payload: HomeworkPayload = {
    coaching_id: PAIR,
    title: "Растяжка",
    description: null,
    video_url: null,
    due_date: "2026-10-20",
    repeat_weekdays: [1, 3],
    repeat_until: "2026-11-20",
    exercises: [{ exercise_id: "00000000-0000-4000-8000-000000000009", prescription: "3×12" }],
  };

  it("creates homework for a pair through save_homework and returns its id", async () => {
    db.answer = { data: HOMEWORK, error: null };
    expect(await saveHomework(payload)).toEqual({ ok: true, id: HOMEWORK });
    expect(db.calls).toEqual([["save_homework", { p_homework: payload }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("edits existing homework by its id", async () => {
    db.answer = { data: HOMEWORK, error: null };
    const edit = { ...payload, coaching_id: undefined, id: HOMEWORK };
    expect(await saveHomework(edit)).toEqual({ ok: true, id: HOMEWORK });
    expect(db.calls).toEqual([["save_homework", { p_homework: edit }]]);
  });

  it.each([
    ["a new one without a pair", { ...payload, coaching_id: undefined }],
    ["a malformed pair", { ...payload, coaching_id: "pair-1" }],
    ["a malformed homework id", { ...payload, id: "hw-1" }],
  ])("refuses %s without a call", async (_label, bad) => {
    expect(await saveHomework(bad)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it.each(["pair_ended", "card_client", "due_in_past", "no_dates", "bad_exercise"])("passes on %s", async (reason) => {
    db.answer = refused(reason);
    expect(await saveHomework(payload)).toEqual({ ok: false, reason });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails on an unknown error or a missing id", async () => {
    db.answer = broken;
    expect(await saveHomework(payload)).toEqual({ ok: false, reason: "failed" });
    db.answer = { data: null, error: null };
    expect(await saveHomework(payload)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("archiveHomework", () => {
  it("archives through archive_homework and refreshes", async () => {
    expect(await archiveHomework(HOMEWORK)).toEqual({ ok: true });
    expect(db.calls).toEqual([["archive_homework", { p_homework: HOMEWORK }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id and fails on an error", async () => {
    expect(await archiveHomework("1")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.answer = broken;
    expect(await archiveHomework(HOMEWORK)).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("markHomeworkDone", () => {
  it("marks it done with the trimmed comment and the log of sets", async () => {
    expect(await markHomeworkDone({ occurrenceId: OCCURRENCE, comment: "  Тяжело, но сделал  ", logId: LOG })).toEqual({ ok: true });
    expect(db.calls).toEqual([["mark_homework_done", { p_occurrence: OCCURRENCE, p_comment: "Тяжело, но сделал", p_log: LOG }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no comment for a blank one and no log without it", async () => {
    await markHomeworkDone({ occurrenceId: OCCURRENCE, comment: "   " });
    expect(db.calls).toEqual([["mark_homework_done", { p_occurrence: OCCURRENCE, p_comment: undefined, p_log: undefined }]]);
  });

  it("takes a comment of exactly 1000 characters after trimming", async () => {
    expect(await markHomeworkDone({ occurrenceId: OCCURRENCE, comment: ` ${"a".repeat(1000)} ` })).toEqual({ ok: true });
  });

  it.each([
    ["a malformed occurrence", { occurrenceId: "o", comment: "" }],
    ["a comment that is not text", { occurrenceId: OCCURRENCE, comment: null as unknown as string }],
    ["a malformed log", { occurrenceId: OCCURRENCE, comment: "", logId: "log-1" }],
    ["a comment over 1000 characters", { occurrenceId: OCCURRENCE, comment: "a".repeat(1001) }],
  ])("refuses %s without a call", async (_label, input) => {
    expect(await markHomeworkDone(input)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("tells a deadline that has not come yet apart from other failures", async () => {
    db.answer = refused("not_yet");
    expect(await markHomeworkDone({ occurrenceId: OCCURRENCE, comment: "" })).toEqual({ ok: false, reason: "not_yet" });
    db.answer = broken;
    expect(await markHomeworkDone({ occurrenceId: OCCURRENCE, comment: "" })).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("unmarkHomeworkDone", () => {
  it("takes the mark back through unmark_homework_done", async () => {
    expect(await unmarkHomeworkDone(OCCURRENCE)).toEqual({ ok: true });
    expect(db.calls).toEqual([["unmark_homework_done", { p_occurrence: OCCURRENCE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id", async () => {
    expect(await unmarkHomeworkDone("x")).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("tells a mark older than 24 hours apart from other failures", async () => {
    db.answer = refused("too_late");
    expect(await unmarkHomeworkDone(OCCURRENCE)).toEqual({ ok: false, reason: "too_late" });
    db.answer = broken;
    expect(await unmarkHomeworkDone(OCCURRENCE)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

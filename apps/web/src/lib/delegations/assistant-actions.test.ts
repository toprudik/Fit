import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** The signed-in assistant (null when signed out), the RPCs made as them, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
  signedIn: true,
  timeZone: "Europe/Moscow",
}));

vi.mock("@/lib/schedule/load", () => ({
  loadScheduleOwner: async () =>
    db.signedIn
      ? {
          userId: "assistant-1",
          timeZone: db.timeZone,
          supabase: {
            rpc: (fn: string, args: unknown) => {
              db.calls.push(["rpc", fn, args]);
              return Promise.resolve(db.answer);
            },
          },
        }
      : null,
}));

const { createAssistedSession } = await import("./assistant-actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const LOCATION = "00000000-0000-4000-8000-000000000002";
const offline = { mode: "offline" as const, coachingId: PAIR, day: "2026-10-20", time: "10:00", durationMin: 60, locationId: LOCATION };
const online = { mode: "online" as const, coachingId: PAIR, day: "2026-10-20", time: "10:00", durationMin: 45, meetingUrl: " https://meet.example/room " };
const FAILED = { ok: false, reason: "failed" };
const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  Object.assign(db, { calls: [], answer: { data: null, error: null }, signedIn: true, timeZone: "Europe/Moscow" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAssistedSession", () => {
  it("creates an offline session on the assistant's clock, at the chosen location, and refreshes", async () => {
    expect(await createAssistedSession(offline)).toEqual({ ok: true });
    // 10:00 in Moscow (UTC+3) is 07:00 UTC.
    expect(db.calls).toEqual([
      ["rpc", "create_session", { p_coaching_id: PAIR, p_starts_at: "2026-10-20T07:00:00.000Z", p_duration_min: 60, p_mode: "offline", p_location_id: LOCATION }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no location when there is none", async () => {
    await createAssistedSession({ ...offline, locationId: null });
    expect(db.calls[0]?.[2]).toEqual({ p_coaching_id: PAIR, p_starts_at: "2026-10-20T07:00:00.000Z", p_duration_min: 60, p_mode: "offline" });
  });

  it("creates an online session with the trimmed link, or without one", async () => {
    db.timeZone = "UTC";
    await createAssistedSession(online);
    await createAssistedSession({ ...online, meetingUrl: "   " });
    expect(db.calls).toEqual([
      ["rpc", "create_session", { p_coaching_id: PAIR, p_starts_at: "2026-10-20T10:00:00.000Z", p_duration_min: 45, p_mode: "online", p_meeting_url: "https://meet.example/room" }],
      ["rpc", "create_session", { p_coaching_id: PAIR, p_starts_at: "2026-10-20T10:00:00.000Z", p_duration_min: 45, p_mode: "online" }],
    ]);
  });

  it("never mixes a location into an online session", async () => {
    await createAssistedSession({ ...online, locationId: LOCATION } as unknown as typeof online);
    expect(db.calls[0]?.[2]).not.toHaveProperty("p_location_id");
  });

  it("refuses each bad field without a call", async () => {
    const bad: Record<string, unknown>[] = [
      { ...offline, mode: "hybrid" },
      { ...offline, coachingId: "nope" },
      { ...offline, day: "20.10.2026" },
      { ...offline, day: "2026-02-30" },
      { ...offline, time: "9:00" },
      { ...offline, time: "24:00" },
      { ...offline, time: "10:60" },
      { ...offline, durationMin: 50 },
      { ...offline, locationId: "nope" },
      { ...online, meetingUrl: "x".repeat(501) },
    ];
    for (const input of bad) expect(await createAssistedSession(input as typeof offline)).toEqual(FAILED);
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("takes every offered duration", async () => {
    for (const durationMin of [30, 45, 60, 75, 90, 120]) expect(await createAssistedSession({ ...offline, durationMin })).toEqual({ ok: true });
  });

  it("fails for a signed-out visitor without a call", async () => {
    db.signedIn = false;
    expect(await createAssistedSession(offline)).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("refuses a time already past on the assistant's clock without a call", async () => {
    // 15:00 in Moscow on 18.10 is 12:00 UTC, which is now.
    expect(await createAssistedSession({ ...offline, day: "2026-10-18", time: "15:00" })).toEqual({ ok: false, reason: "past" });
    expect(await createAssistedSession({ ...offline, day: "2026-10-17" })).toEqual({ ok: false, reason: "past" });
    expect(db.calls).toEqual([]);
    expect(await createAssistedSession({ ...offline, day: "2026-10-18", time: "15:01" })).toEqual({ ok: true });
  });

  it("maps the database answers: past, bad link, no delegation, anything else", async () => {
    db.answer = fail("in_past");
    expect(await createAssistedSession(offline)).toEqual({ ok: false, reason: "past" });
    db.answer = fail("invalid_link");
    expect(await createAssistedSession(online)).toEqual({ ok: false, reason: "link" });
    db.answer = fail("not_delegated", "42501");
    expect(await createAssistedSession(offline)).toEqual({ ok: false, reason: "denied" });
    db.answer = fail("overlap", "23P01");
    expect(await createAssistedSession(offline)).toEqual(FAILED);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

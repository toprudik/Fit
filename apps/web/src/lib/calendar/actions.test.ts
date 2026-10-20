import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { createCalendarFeed } = await import("./actions");

const TOKEN = "feedtoken_0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createCalendarFeed", () => {
  it("issues a feed for the zone and returns its links once", async () => {
    db.answer = { data: TOKEN, error: null };
    expect(await createCalendarFeed("trainer")).toEqual({
      ok: true,
      urls: {
        https: `https://fit.example/api/calendar/${TOKEN}.ics`,
        webcal: `webcal://fit.example/api/calendar/${TOKEN}.ics`,
        google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://fit.example/api/calendar/${TOKEN}.ics`)}`,
      },
    });
    expect(db.calls).toEqual([["rpc", "create_calendar_feed", { p_zone: "trainer" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("issues a client feed", async () => {
    db.answer = { data: TOKEN, error: null };
    expect(await createCalendarFeed("client")).toMatchObject({ ok: true });
    expect(db.calls).toEqual([["rpc", "create_calendar_feed", { p_zone: "client" }]]);
  });

  it("refuses any other zone without a call", async () => {
    for (const zone of ["admin", "", "Trainer", null, undefined]) {
      expect(await createCalendarFeed(zone as unknown as "trainer")).toEqual({ ok: false });
    }
    expect(db.calls).toEqual([]);
  });

  it("fails on an error or an empty token without a refresh", async () => {
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await createCalendarFeed("trainer")).toEqual({ ok: false });
    db.answer = { data: null, error: null };
    expect(await createCalendarFeed("trainer")).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

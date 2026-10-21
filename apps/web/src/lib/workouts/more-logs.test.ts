import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const mocks = vi.hoisted(() => ({ placeClient: vi.fn(), loadLogs: vi.fn() }));
vi.mock("./place", () => ({ placeClient: mocks.placeClient }));
vi.mock("./logs", () => ({ loadLogs: mocks.loadLogs }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));

const { moreLogs } = await import("./log-actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const CLIENT = "00000000-0000-4000-8000-000000000002";
const LOG = "00000000-0000-4000-8000-000000000003";
const before = { performedAt: "2026-09-01T09:00:00.123456+00:00", id: LOG };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.placeClient.mockResolvedValue({ clientId: CLIENT, canWrite: true });
  mocks.loadLogs.mockResolvedValue([]);
});

describe("moreLogs", () => {
  it("loads the page after the cursor for the client the place resolves to, keeping the microseconds", async () => {
    expect(await moreLogs({ place: { side: "trainer", coachingId: PAIR }, before, locale: "ru" })).toEqual([]);
    expect(mocks.placeClient).toHaveBeenCalledWith({ side: "trainer", coachingId: PAIR });
    expect(mocks.loadLogs).toHaveBeenCalledWith(CLIENT, "ru", before);
  });

  it("checks the client's own diary again on the server", async () => {
    await moreLogs({ place: { side: "client" }, before, locale: "en" });
    expect(mocks.placeClient).toHaveBeenCalledWith({ side: "client" });
  });

  it("returns nothing for a place that is not the viewer's", async () => {
    mocks.placeClient.mockResolvedValue(null);
    expect(await moreLogs({ place: { side: "trainer", coachingId: PAIR }, before, locale: "ru" })).toBeNull();
    expect(mocks.loadLogs).not.toHaveBeenCalled();
  });

  it("refuses a malformed cursor, place or locale without reading", async () => {
    const bad = [
      { place: { side: "client" as const }, before: { ...before, id: "1; drop table" }, locale: "ru" as const },
      { place: { side: "client" as const }, before: { ...before, performedAt: "yesterday" }, locale: "ru" as const },
      { place: { side: "client" as const }, before: { ...before, performedAt: '2026-09-01T09:00:00Z",id.gt.0' }, locale: "ru" as const },
      { place: { side: "trainer" as const, coachingId: "nope" }, before, locale: "ru" as const },
      { place: { side: "substitute" } as never, before, locale: "ru" as const },
      { place: { side: "client" as const }, before, locale: "de" as never },
    ];
    for (const input of bad) expect(await moreLogs(input)).toBeNull();
    expect(mocks.placeClient).not.toHaveBeenCalled();
  });
});

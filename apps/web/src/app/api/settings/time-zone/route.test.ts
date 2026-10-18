import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));

/** The signed-in user, whether they are a trainer, their saved zone and the updates written as them. */
const session = vi.hoisted(() => ({
  userId: null as string | null,
  trainer: false,
  zone: "Europe/Moscow",
  updates: [] as { row: Record<string, unknown>; userId: unknown }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null }) },
    from: (table: string) => {
      if (table === "trainer_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: session.trainer ? { user_id: session.userId } : null, error: null }) }),
          }),
        };
      }
      expect(table).toBe("user_settings");
      return {
        update: (row: { time_zone: string }) => ({
          eq: (_column: string, userId: unknown) => ({
            neq: (_zoneColumn: string, zone: string) => ({
              select: async () => {
                if (session.zone === zone) return { data: [], error: null };
                session.updates.push({ row, userId });
                session.zone = row.time_zone;
                return { data: [{ user_id: userId }], error: null };
              },
            }),
          }),
        }),
      };
    },
  }),
}));

const { POST } = await import("./route");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${APP_URL}/api/settings/time-zone`, {
      method: "POST",
      headers: { origin: APP_URL, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  session.userId = "user-42";
  session.trainer = false;
  session.zone = "Europe/Moscow";
  session.updates = [];
});

describe("POST /api/settings/time-zone", () => {
  it("saves a client's device zone and says it changed", async () => {
    const res = await post({ timeZone: "Asia/Almaty" });

    expect(await res.json()).toEqual({ changed: true });
    expect(session.updates).toEqual([{ row: { time_zone: "Asia/Almaty" }, userId: "user-42" }]);
  });

  it("reports no change when the account already has the zone", async () => {
    const res = await post({ timeZone: "Europe/Moscow" });

    expect(await res.json()).toEqual({ changed: false });
    expect(session.updates).toEqual([]);
  });

  it("leaves a trainer's zone alone", async () => {
    session.trainer = true;
    const res = await post({ timeZone: "Asia/Almaty" });

    expect(await res.json()).toEqual({ changed: false });
    expect(session.updates).toEqual([]);
  });

  it("saves nothing for a signed-out visitor", async () => {
    session.userId = null;
    const res = await post({ timeZone: "Asia/Almaty" });

    expect(await res.json()).toEqual({ changed: false });
    expect(session.updates).toEqual([]);
  });

  it("rejects a zone that does not exist", async () => {
    expect((await post({ timeZone: "Mars/Olympus" })).status).toBe(400);
    expect(session.updates).toEqual([]);
  });

  it("refuses a cross-site request", async () => {
    expect((await post({ timeZone: "Asia/Almaty" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(session.updates).toEqual([]);
  });
});

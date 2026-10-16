import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));

/** The signed-in user (null: signed out) and the user_settings updates written as them. */
const session = vi.hoisted(() => ({
  userId: null as string | null,
  updates: [] as { row: Record<string, unknown>; userId: unknown }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null }) },
    from: (table: string) => {
      expect(table).toBe("user_settings");
      return {
        update: (row: Record<string, unknown>) => ({
          eq: async (_column: string, userId: unknown) => {
            session.updates.push({ row, userId });
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { PATCH } = await import("./route");

function patch(body: unknown, headers: Record<string, string> = {}) {
  return PATCH(
    new Request(`${APP_URL}/api/settings/preferences`, {
      method: "PATCH",
      headers: { origin: APP_URL, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  session.userId = "user-42";
  session.updates = [];
});

describe("PATCH /api/settings/preferences", () => {
  it("saves the choice to the signed-in user's settings", async () => {
    const res = await patch({ theme: "light", lastZone: "trainer" });

    expect(res.status).toBe(204);
    expect(session.updates).toEqual([{ row: { theme: "light", last_zone: "trainer" }, userId: "user-42" }]);
  });

  it("saves nothing for a signed-out visitor, without an error", async () => {
    session.userId = null;
    const res = await patch({ locale: "en" });

    expect(res.status).toBe(204);
    expect(session.updates).toEqual([]);
  });

  it("refuses values and fields it doesn't know", async () => {
    expect((await patch({ locale: "de" })).status).toBe(400);
    expect((await patch({ time_zone: "UTC" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(session.updates).toEqual([]);
  });

  it("refuses requests from other sites", async () => {
    const res = await patch({ locale: "en" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(res.status).toBe(403);
    expect(session.updates).toEqual([]);
  });
});

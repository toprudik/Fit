import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** The caller's session and roles; loads records whether the metrics were read at all. */
const session = vi.hoisted(() => ({ userId: null as string | null, admin: false, roleQueries: [] as unknown[][], loads: 0 }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null }) },
    from: (table: string) => {
      expect(table).toBe("user_roles");
      const filters: unknown[] = [];
      session.roleQueries.push(filters);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: session.admin ? { role: "admin" } : null, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/owner-metrics/load", () => ({
  loadOwnerMetrics: async () => {
    session.loads += 1;
    return {};
  },
}));
vi.mock("@/lib/owner-metrics/metrics", () => ({
  ownerWeeks: () => 12,
  ownerCsv: () => "a;b\n",
  ownerCsvName: (day: string) => `dafit-${day}.csv`,
}));

const { GET } = await import("./route");

const call = () => GET(new NextRequest("https://fit.example/api/admin/stats?weeks=12"));

beforeEach(() => {
  session.userId = null;
  session.admin = false;
  session.roleQueries = [];
  session.loads = 0;
});

describe("GET /api/admin/stats", () => {
  it("answers 404 without a session, like the admin pages", async () => {
    const response = await call();
    expect(response.status).toBe(404);
    expect(session.loads).toBe(0);
  });

  it("answers the same 404 to a signed-in user who is not an admin", async () => {
    session.userId = "11111111-1111-4111-8111-111111111111";
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(session.loads).toBe(0);
  });

  it("checks the admin role of the session's own user", async () => {
    session.userId = "11111111-1111-4111-8111-111111111111";
    await call();
    expect(session.roleQueries[0]).toEqual([
      ["user_id", "11111111-1111-4111-8111-111111111111"],
      ["role", "admin"],
    ]);
  });

  it("gives an admin the CSV, never cached by a shared cache", async () => {
    session.userId = "22222222-2222-4222-8222-222222222222";
    session.admin = true;
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(session.loads).toBe(1);
  });
});

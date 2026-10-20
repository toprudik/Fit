import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TRAINER = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

/** The session, the trainer.export entitlement and every query the route sends as the user, with its filters. */
const db = vi.hoisted(() => ({
  userId: null as string | null,
  entitled: true,
  queries: [] as { table: string; filters: [string, string, unknown][] }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcs.push({ fn, args });
      return { data: db.entitled, error: null };
    },
    from: (table: string) => {
      const entry = { table, filters: [] as [string, string, unknown][] };
      db.queries.push(entry);
      const result = { data: table === "user_settings" ? { time_zone: "Europe/Moscow" } : [], error: null };
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => resolve(result),
        maybeSingle: async () => result,
      };
      for (const op of ["select", "order", "range"]) query[op] = () => query;
      for (const op of ["eq", "lt", "gte", "in", "or"]) {
        query[op] = (column: string, value: unknown) => {
          entry.filters.push([op, column, value]);
          return query;
        };
      }
      return query;
    },
  }),
}));
vi.mock("@/lib/schedule/load", () => ({ clientNames: async () => new Map() }));

const { GET } = await import("./route");

const call = (kind: string, query = "from=2026-09-01&to=2026-10-01") =>
  GET(new NextRequest(`https://fit.example/api/trainer/export/${kind}?${query}`), { params: Promise.resolve({ kind }) } as never);

beforeEach(() => {
  db.userId = TRAINER;
  db.entitled = true;
  db.queries = [];
  db.rpcs = [];
});

describe("GET /api/trainer/export/[kind]", () => {
  it("answers 401 without a session and reads nothing", async () => {
    db.userId = null;
    expect((await call("clients")).status).toBe(401);
    expect(db.queries).toEqual([]);
  });

  it("answers 403 without the Pro export and reads no client data", async () => {
    db.entitled = false;
    expect((await call("payments")).status).toBe(403);
    expect(db.queries.map((q) => q.table)).toEqual(["user_settings"]);
    expect(db.rpcs).toEqual([{ fn: "has_entitlement", args: { p_user: TRAINER, p_feature: "trainer.export" } }]);
  });

  it.each([
    ["unknown", "from=2026-09-01&to=2026-10-01"],
    ["clients", "from=2026-10-01&to=2026-09-01"],
    ["clients", "from=2025-01-01&to=2026-10-01"],
    ["clients", "from=x&to=y"],
    ["clients", ""],
  ])("refuses kind %j with %j before reading anything", async (kind, query) => {
    expect((await call(kind, query)).status).toBe(400);
    expect(db.queries).toEqual([]);
  });

  it.each(["clients", "sessions", "payments", "passes"])(
    "exports %s of the signed-in trainer only, whatever the URL says",
    async (kind) => {
      const response = await call(kind, `from=2026-09-01&to=2026-10-01&trainer_id=${OTHER}&user=${OTHER}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const main = db.queries.find((q) => q.table !== "user_settings")!;
      expect(main.filters).toContainEqual(["eq", "trainer_id", TRAINER]);
      expect(JSON.stringify(db.queries)).not.toContain(OTHER);
    },
  );
});

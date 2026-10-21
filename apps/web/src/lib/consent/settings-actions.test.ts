import { beforeEach, describe, expect, it, vi } from "vitest";

/** redirect() throws in Next.js; the mock does the same and keeps the target. */
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));

/** What the update was filtered by and set to. */
const db = vi.hoisted(() => ({
  user: "user-1" as string | null,
  set: null as Record<string, unknown> | null,
  filters: [] as [string, unknown][],
  error: null as { code: string } | null,
  rpc: [] as [string, unknown][],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      db.rpc.push([name, args]);
      return { error: db.error };
    },
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => {
      db.filters.push(["table", table]);
      const chain = {
        update: (values: Record<string, unknown>) => {
          db.set = values;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          db.filters.push([column, value]);
          return chain;
        },
        is: async (column: string, value: unknown) => {
          db.filters.push([column, value]);
          return { error: db.error };
        },
      };
      return chain;
    },
  }),
}));

const { revokeHealthConsent, revokePublicDataConsent } = await import("./settings-actions");

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  return thrown && typeof thrown === "object" && "url" in thrown ? String(thrown.url) : null;
}

beforeEach(() => {
  db.user = "user-1";
  db.set = null;
  db.filters = [];
  db.error = null;
  db.rpc = [];
});

describe("revokeHealthConsent", () => {
  it("stamps the user's health data consent in force as revoked and comes back to the screen", async () => {
    expect(await redirectOf(revokeHealthConsent())).toBe("/settings/consents");
    expect(db.set).toHaveProperty("revoked_at");
    expect(db.filters).toEqual([
      ["table", "consents"],
      ["user_id", "user-1"],
      ["kind", "pd_health"],
      ["revoked_at", null],
    ]);
  });

  it("says so when the database refuses", async () => {
    db.error = { code: "42501" };
    await expect(revokeHealthConsent()).resolves.toEqual({ failed: true });
  });

  it("does nothing for a signed-out visitor", async () => {
    db.user = null;
    await expect(revokeHealthConsent()).resolves.toEqual({ failed: true });
    expect(db.set).toBeNull();
  });
});

describe("revokePublicDataConsent", () => {
  it("withdraws the consent to publish through the database and comes back to the screen", async () => {
    expect(await redirectOf(revokePublicDataConsent("showcase"))).toBe("/settings/consents");
    expect(db.rpc).toEqual([["revoke_public_data_consent", { p_scope: "showcase" }]]);
    expect(await redirectOf(revokePublicDataConsent("story"))).toBe("/settings/consents");
    expect(db.rpc[1]).toEqual(["revoke_public_data_consent", { p_scope: "story" }]);
  });

  it("says so when the database refuses", async () => {
    db.error = { code: "42501" };
    await expect(revokePublicDataConsent("story")).resolves.toEqual({ failed: true });
  });

  it("refuses a scope it does not know without calling the database", async () => {
    await expect(revokePublicDataConsent("profile" as never)).resolves.toEqual({ failed: true });
    expect(db.rpc).toEqual([]);
  });
});

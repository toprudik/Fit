import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "./required";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  user: "user-1" as string | null,
  rows: [] as { kind: string; version: string }[],
  failed: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: async () => (db.failed ? { data: null, error: { code: "PGRST000" } } : { data: [...db.rows], error: null }),
      };
      return chain;
    },
  }),
}));

const { healthConsentPath, mayOpenHealthSections } = await import("./health");

beforeEach(() => {
  db.user = "user-1";
  db.rows = [];
  db.failed = false;
});

describe("mayOpenHealthSections", () => {
  it("opens the sections once the health data consent in force is given", async () => {
    db.rows = [{ kind: "pd_health", version: LEGAL_VERSION }];
    expect(await mayOpenHealthSections()).toBe(true);
  });

  it("asks without it, for an earlier edition, and when the read fails", async () => {
    expect(await mayOpenHealthSections()).toBe(false);
    db.rows = [{ kind: "pd_health", version: "2025-01" }];
    expect(await mayOpenHealthSections()).toBe(false);
    db.failed = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mayOpenHealthSections()).toBe(false);
  });

  it("lets a signed-out visitor through to the screen's own signed-out state", async () => {
    db.user = null;
    expect(await mayOpenHealthSections()).toBe(true);
  });
});

describe("healthConsentPath", () => {
  it("opens the health step of the consent screen and comes back", () => {
    expect(healthConsentPath("/client/progress")).toBe("/onboarding/consent?step=health&next=%2Fclient%2Fprogress");
  });
});

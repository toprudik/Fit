import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TERMS_CONSENTS, PERSONAL_CONSENT } from "@/lib/consent/required";

vi.mock("@/env/client", () => ({
  clientEnv: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" },
}));

/** What the fake database answers: the signed-in user (or none) and their consent rows (or an error). */
const db: { userId: string | null; consents: { kind: string; version: string }[] | null; queries: number } = {
  userId: null,
  consents: [],
  queries: 0,
};

/** A query builder that answers every table: consents with `db.consents`, others with one row. */
function query(table: string) {
  const result = () => {
    if (table !== "consents") return { data: { user_id: db.userId }, error: null };
    db.queries += 1;
    return db.consents ? { data: db.consents, error: null } : { data: null, error: { code: "08006" } };
  };
  const builder = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };
  return builder;
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    from: query,
  }),
}));

const { proxy } = await import("./proxy");

const ALL = [...TERMS_CONSENTS, PERSONAL_CONSENT].map(({ kind, version }) => ({ kind, version }));
const open = (path: string, init?: { method?: string }) => proxy(new NextRequest(new URL(path, "http://localhost:3000"), init));

beforeEach(() => {
  db.userId = "00000000-0000-4000-8000-000000000001";
  db.consents = [];
  db.queries = 0;
});

describe("proxy: required consents", () => {
  it("sends a user without them to the consents screen, keeping the screen asked for", async () => {
    const response = await open("/client/sessions");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding/consent?next=%2Fclient%2Fsessions");
  });

  it("asks again when only some are given, such as the old beta terms alone", async () => {
    db.consents = [{ kind: "beta_terms", version: "2026-11-beta" }];
    expect((await open("/client")).headers.get("location")).toContain("/onboarding/consent");
  });

  it("lets a user with all of them in, after one query", async () => {
    db.consents = ALL;
    const response = await open("/client");
    expect(response.headers.get("location")).toBeNull();
    expect(db.queries).toBe(1);
  });

  it("ignores a consent cookie set on the device", async () => {
    const request = new NextRequest(new URL("/client", "http://localhost:3000"));
    request.cookies.set("dafit-consent", `${db.userId}:anything`);
    expect((await proxy(request)).headers.get("location")).toContain("/onboarding/consent");
  });

  it("does not let anyone in when the consents cannot be read", async () => {
    db.consents = null;
    expect((await open("/client")).headers.get("location")).toContain("/onboarding/consent");
  });

  it("keeps the consents screen, sign-in and the documents open", async () => {
    for (const path of ["/onboarding/consent", "/login", "/legal", "/legal/privacy"]) {
      expect((await open(path)).headers.get("location"), path).toBeNull();
    }
  });

  it("asks nothing of a signed-out visitor", async () => {
    db.userId = null;
    expect((await open("/client")).headers.get("location")).toBeNull();
    expect(db.queries).toBe(0);
  });

  it("answers 403 on the user's API routes, but not on theme and language", async () => {
    const denied = await open("/api/settings/time-zone", { method: "POST" });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "consent_required" });
    expect((await open("/api/settings/preferences", { method: "POST" })).status).toBe(200);
  });
});

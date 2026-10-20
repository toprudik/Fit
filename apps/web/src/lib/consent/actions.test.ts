import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

/** redirect() throws in Next.js, so nothing after it runs; the mock does the same and keeps the target. */
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));

const jar = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

type Write = { table: string; values: unknown };

/** Reads and writes made as the signed-in user, and what they answer. */
const db = vi.hoisted(() => ({
  user: "user-1" as string | null,
  reads: [] as unknown[][],
  writes: [] as Write[],
  earlier: [] as { id: string }[],
  readError: null as { code: string } | null,
  writeError: null as { code: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => ({
      select: (columns: string) => {
        const steps: unknown[] = [table, "select", columns];
        db.reads.push(steps);
        const chain = {
          eq: (column: string, value: unknown) => (steps.push("eq", column, value), chain),
          limit: async (count: number) => {
            steps.push("limit", count);
            return { data: db.readError ? null : db.earlier, error: db.readError };
          },
        };
        return chain;
      },
      insert: async (values: unknown) => {
        db.writes.push({ table, values });
        return { error: db.writeError };
      },
    }),
  }),
}));

const { acceptBetaTerms } = await import("./actions");
const { BETA_TERMS_VERSION, CONSENT_COOKIE, consentCookieOptions } = await import("./beta-terms");

function form(next?: string) {
  const data = new FormData();
  if (next !== undefined) data.append("next", next);
  return data;
}

/** Runs the action and returns where it redirected to. */
async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toMatchObject({ message: "NEXT_REDIRECT" });
  return (error as { url: string }).url;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, { user: "user-1", reads: [], writes: [], earlier: [], readError: null, writeError: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("acceptBetaTerms", () => {
  it("records the version for the signed-in user, sets the cookie and opens the preferences step the first time", async () => {
    const url = await redirectOf(acceptBetaTerms({ failed: false }, form("/client/book?day=2026-10-20")));
    expect(url).toBe(`/onboarding/preferences?next=${encodeURIComponent("/client/book?day=2026-10-20")}`);
    expect(db.reads).toEqual([["consents", "select", "id", "eq", "user_id", "user-1", "eq", "kind", "beta_terms", "limit", 1]]);
    expect(db.writes).toEqual([{ table: "consents", values: { user_id: "user-1", kind: "beta_terms", version: BETA_TERMS_VERSION } }]);
    expect(jar.set).toHaveBeenCalledWith(CONSENT_COOKIE, `user-1:${BETA_TERMS_VERSION}`, consentCookieOptions);
  });

  it("goes straight back to next after a new version", async () => {
    db.earlier = [{ id: "c-1" }];
    expect(await redirectOf(acceptBetaTerms({ failed: false }, form("/trainer/schedule")))).toBe("/trainer/schedule");
  });

  it("treats a second tap on the same version as accepted", async () => {
    db.earlier = [{ id: "c-1" }];
    db.writeError = { code: "23505" };
    expect(await redirectOf(acceptBetaTerms({ failed: false }, form("/trainer")))).toBe("/trainer");
    expect(jar.set).toHaveBeenCalledOnce();
  });

  it("never sends the user to another site or back into onboarding", async () => {
    db.earlier = [{ id: "c-1" }];
    for (const next of ["https://evil.example/", "//evil.example", "/onboarding/consent", "/onboarding/preferences?x=1"]) {
      expect(await redirectOf(acceptBetaTerms({ failed: false }, form(next)))).toBe("/");
    }
    expect(await redirectOf(acceptBetaTerms({ failed: false }, form()))).toBe("/");
  });

  it("sends a signed-out visitor to login, coming back to the terms, without touching the database", async () => {
    db.user = null;
    const url = await redirectOf(acceptBetaTerms({ failed: false }, form("/trainer")));
    expect(url).toBe(`/login?next=${encodeURIComponent(`/onboarding/consent?next=${encodeURIComponent("/trainer")}`)}`);
    expect(db.reads).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("fails without writing when the earlier consents cannot be read", async () => {
    db.readError = { code: "42501" };
    expect(await acceptBetaTerms({ failed: false }, form("/trainer"))).toEqual({ failed: true });
    expect(db.writes).toEqual([]);
    expect(jar.set).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("fails without a cookie when the consent is not saved", async () => {
    db.writeError = { code: "42501" };
    expect(await acceptBetaTerms({ failed: false }, form("/trainer"))).toEqual({ failed: true });
    expect(jar.set).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BETA_TERMS_VERSION } from "./beta-terms";
import { LEGAL_VERSION } from "./required";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({
  clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" },
}));
/** The texts are hashed in the language the form names; the hash marks which one. */
vi.mock("./documents", () => ({
  loadConsentDocument: async (locale: string, kind: string) =>
    kind === "age_confirmed" ? null : { hash: `hash-${kind}-${locale}` },
}));

/** redirect() throws in Next.js, so nothing after it runs; the mock does the same and keeps the target. */
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));

type Row = { kind: string; version: string };

/** The signed-in user's consent rows, what reads and writes answer, and what was written. */
const db = vi.hoisted(() => ({
  user: "user-1" as string | null,
  rows: [] as Row[],
  writes: [] as Record<string, unknown>[],
  rpcs: [] as string[],
  readError: null as { code: string } | null,
  writeError: null as { code: string } | null,
  rpcError: null as { code: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: db.user ? { claims: { sub: db.user } } : null,
      }),
      refreshSession: async () => ({ error: null }),
    },
    rpc: async (name: string) => {
      db.rpcs.push(name);
      return { error: db.rpcError };
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: async () => ({
          data: db.readError ? null : [...db.rows],
          error: db.readError,
        }),
        insert: async (values: Record<string, unknown>) => {
          db.writes.push(values);
          if (!db.writeError)
            db.rows.push({
              kind: String(values.kind),
              version: String(values.version),
            });
          return { error: db.writeError };
        },
      };
      return chain;
    },
  }),
}));

const {
  acceptPersonalData,
  acceptTerms,
  answerHealthData,
  closeUnderageAccount,
  keepUnderageAccount,
} = await import("./actions");

const TERMS: Row[] = [
  { kind: "beta_terms", version: BETA_TERMS_VERSION },
  { kind: "terms", version: LEGAL_VERSION },
  { kind: "privacy_policy", version: LEGAL_VERSION },
  { kind: "age_confirmed", version: LEGAL_VERSION },
];
const PERSONAL: Row = { kind: "pd_general", version: LEGAL_VERSION };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
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
  Object.assign(db, {
    user: "user-1",
    rows: [],
    writes: [],
    rpcs: [],
    readError: null,
    writeError: null,
    rpcError: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("acceptTerms", () => {
  it("needs the 18+ box ticked and writes nothing without it", async () => {
    expect(
      await acceptTerms({ failed: false }, form({ next: "/client" })),
    ).toEqual({ failed: "age" });
    expect(db.writes).toEqual([]);
  });

  it("records the four terms consents with the hashes of the Russian texts by default, then opens the personal data step", async () => {
    const url = await redirectOf(
      acceptTerms({ failed: false }, form({ next: "/client", adult: "on" })),
    );
    expect(url).toBe(
      `/onboarding/consent?${new URLSearchParams({ next: "/client", first: "1" })}`,
    );
    expect(db.writes).toEqual([
      {
        user_id: "user-1",
        kind: "beta_terms",
        version: BETA_TERMS_VERSION,
        text_hash: "hash-beta_terms-ru",
      },
      {
        user_id: "user-1",
        kind: "terms",
        version: LEGAL_VERSION,
        text_hash: "hash-terms-ru",
      },
      {
        user_id: "user-1",
        kind: "privacy_policy",
        version: LEGAL_VERSION,
        text_hash: "hash-privacy_policy-ru",
      },
      {
        user_id: "user-1",
        kind: "age_confirmed",
        version: LEGAL_VERSION,
        text_hash: null,
      },
    ]);
  });

  it("writes only what is missing and is not the first time after the old beta terms", async () => {
    db.rows = [TERMS[0]];
    const url = await redirectOf(
      acceptTerms({ failed: false }, form({ next: "/trainer", adult: "on" })),
    );
    expect(url).toBe(
      `/onboarding/consent?${new URLSearchParams({ next: "/trainer" })}`,
    );
    expect(db.writes.map((write) => write.kind)).toEqual([
      "terms",
      "privacy_policy",
      "age_confirmed",
    ]);
  });

  it("treats a second tap on the same version as given", async () => {
    db.writeError = { code: "23505" };
    expect(
      await redirectOf(
        acceptTerms({ failed: false }, form({ next: "/trainer", adult: "on" })),
      ),
    ).toContain("/onboarding/consent?");
  });

  it("fails when a consent is not saved or the consents cannot be read", async () => {
    db.writeError = { code: "42501" };
    expect(await acceptTerms({ failed: false }, form({ adult: "on" }))).toEqual(
      { failed: "save" },
    );
    db.writeError = null;
    db.readError = { code: "42501" };
    expect(await acceptTerms({ failed: false }, form({ adult: "on" }))).toEqual(
      { failed: "save" },
    );
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to login, coming back to the consents, without touching the database", async () => {
    db.user = null;
    const url = await redirectOf(
      acceptTerms({ failed: false }, form({ next: "/trainer", adult: "on" })),
    );
    expect(url).toBe(
      `/login?next=${encodeURIComponent(`/onboarding/consent?next=${encodeURIComponent("/trainer")}`)}`,
    );
    expect(db.writes).toEqual([]);
  });

  it("never sends the user to another site or back into onboarding", async () => {
    for (const next of [
      "https://evil.example/",
      "//evil.example",
      "/onboarding/preferences?x=1",
    ]) {
      db.rows = [...TERMS];
      expect(
        await redirectOf(
          acceptTerms({ failed: false }, form({ next, adult: "on" })),
        ),
      ).toBe(`/onboarding/consent?${new URLSearchParams({ next: "/" })}`);
    }
  });
});

describe("acceptPersonalData", () => {
  it("records the consent with the hash of the text in the form's language and asks about health data next", async () => {
    db.rows = [...TERMS];
    const url = await redirectOf(
      acceptPersonalData(
        { failed: false },
        form({ next: "/client", first: "1", locale: "en" }),
      ),
    );
    expect(url).toBe(
      `/onboarding/consent?${new URLSearchParams({ next: "/client", step: "health", first: "1" })}`,
    );
    expect(db.writes).toEqual([
      {
        user_id: "user-1",
        kind: "pd_general",
        version: LEGAL_VERSION,
        text_hash: "hash-pd_general-en",
      },
    ]);
  });

  it("goes on to next when health data was given before", async () => {
    db.rows = [...TERMS, { kind: "pd_health", version: LEGAL_VERSION }];
    expect(
      await redirectOf(
        acceptPersonalData({ failed: false }, form({ next: "/client" })),
      ),
    ).toBe("/client");
  });

  it("sends back to the terms when they are still missing", async () => {
    expect(
      await redirectOf(
        acceptPersonalData({ failed: false }, form({ next: "/client" })),
      ),
    ).toBe(`/onboarding/consent?${new URLSearchParams({ next: "/client" })}`);
  });
});

describe("answerHealthData", () => {
  it("records the consent on «Даю согласие» and opens the language step the first time", async () => {
    db.rows = [...TERMS, PERSONAL];
    const url = await redirectOf(
      answerHealthData(
        { failed: false },
        form({ next: "/client", first: "1", answer: "give" }),
      ),
    );
    expect(url).toBe(
      `/onboarding/preferences?next=${encodeURIComponent("/client")}`,
    );
    expect(db.writes.map((write) => write.kind)).toEqual(["pd_health"]);
  });

  it("writes nothing on «Не сейчас» and still goes on", async () => {
    db.rows = [...TERMS, PERSONAL];
    expect(
      await redirectOf(
        answerHealthData(
          { failed: false },
          form({ next: "/client", answer: "later" }),
        ),
      ),
    ).toBe("/client");
    expect(db.writes).toEqual([]);
  });
});

describe("under 18", () => {
  it("asks for the usual deletion and shows the underage screen", async () => {
    const url = await redirectOf(
      closeUnderageAccount({ failed: false }, form({ next: "/client" })),
    );
    expect(db.rpcs).toEqual(["request_account_deletion"]);
    expect(url).toBe(
      `/onboarding/consent?${new URLSearchParams({ next: "/client", step: "underage" })}`,
    );
  });

  it("fails without leaving the screen when the deletion is not saved", async () => {
    db.rpcError = { code: "42501" };
    expect(await closeUnderageAccount({ failed: false }, form({}))).toEqual({
      failed: "save",
    });
  });

  it("keeps the account after a wrong tap and returns to the terms", async () => {
    const url = await redirectOf(
      keepUnderageAccount({ failed: false }, form({ next: "/client" })),
    );
    expect(db.rpcs).toEqual(["cancel_account_deletion"]);
    expect(url).toBe(
      `/onboarding/consent?${new URLSearchParams({ next: "/client" })}`,
    );
  });
});

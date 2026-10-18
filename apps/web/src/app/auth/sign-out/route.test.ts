import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));

/** How many times the session was ended. */
const session = vi.hoisted(() => ({ signOuts: 0 }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signOut: async () => {
        session.signOuts += 1;
        return { error: null };
      },
    },
  }),
}));

const { POST } = await import("./route");

const post = (headers: Record<string, string> = { origin: APP_URL, "sec-fetch-site": "same-origin" }) =>
  POST(new Request(`${APP_URL}/auth/sign-out`, { method: "POST", headers }));

beforeEach(() => {
  session.signOuts = 0;
});

describe("POST /auth/sign-out", () => {
  it("ends the session and sends the browser to /login with a 303", async () => {
    const res = await post();

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
    expect(session.signOuts).toBe(1);
  });

  it("accepts a same-origin form post without Sec-Fetch-Site", async () => {
    expect((await post({ origin: APP_URL })).status).toBe(303);
    expect(session.signOuts).toBe(1);
  });

  it.each([
    ["a cross-site request", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["a same-site subdomain", { origin: APP_URL, "sec-fetch-site": "same-site" }],
    ["no Origin at all", {}],
  ])("refuses %s and keeps the session", async (_name, headers) => {
    const res = await post(headers);

    expect(res.status).toBe(403);
    expect(session.signOuts).toBe(0);
  });
});

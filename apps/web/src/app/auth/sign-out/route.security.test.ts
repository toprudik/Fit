import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
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

const call = (headers: Record<string, string>) => POST(new Request(`${APP_URL}/auth/sign-out`, { method: "POST", headers }));

beforeEach(() => {
  session.signOuts = 0;
});

describe("POST /auth/sign-out", () => {
  it("signs out a same-origin form post and goes to /login on our own origin", async () => {
    const response = await call({ origin: APP_URL, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_URL}/login`);
    expect(session.signOuts).toBe(1);
  });

  it.each<Record<string, string>>([{}, { origin: "https://evil.example" }, { origin: APP_URL, "sec-fetch-site": "cross-site" }])(
    "refuses a cross-site post %j, so another site can't sign the user out",
    async (headers) => {
      expect((await call(headers)).status).toBe(403);
      expect(session.signOuts).toBe(0);
    },
  );
});

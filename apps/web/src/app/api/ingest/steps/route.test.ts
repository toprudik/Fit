import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** What public.ingest_steps answers, and the calls it got. */
const rpc = vi.hoisted(() => ({
  answer: { data: "ok" as string | null, error: null as { code: string } | null },
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.calls.push({ name, args });
      return rpc.answer;
    },
  }),
}));

const { GET, POST } = await import("./route");

const URL = "https://fit.example/api/ingest/steps";

function post(body: unknown, headers: Record<string, string> = { authorization: "Bearer dft_test" }) {
  return POST(
    new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/ingest/steps", () => {
  beforeEach(() => {
    rpc.answer = { data: "ok", error: null };
    rpc.calls = [];
  });

  it("saves the steps with the token and answers with a sentence", async () => {
    const response = await post({ steps: "8532.0", date: "2026-10-17" });
    expect(response.status).toBe(200);
    expect(rpc.calls).toEqual([{ name: "ingest_steps", args: { p_token: "dft_test", p_steps: 8532, p_day: "2026-10-17" } }]);
    expect(await response.json()).toEqual({ ok: true, message: "Done, steps saved: 8532" });
  });

  it("answers in Russian to a Russian iPhone", async () => {
    const response = await post({ steps: 100 }, { authorization: "Bearer dft_test", "accept-language": "ru-RU,ru;q=0.9" });
    expect((await response.json()).message).toBe("Готово, шагов записано: 100");
    expect(rpc.calls[0].args.p_day).toBeUndefined();
  });

  it("refuses a request without a token before reaching the database", async () => {
    const response = await post({ steps: 100 }, {});
    expect(response.status).toBe(401);
    expect(rpc.calls).toEqual([]);
  });

  it("refuses a body that is not JSON or has no steps", async () => {
    expect((await post("steps=100")).status).toBe(400);
    expect((await post({ steps: "many" })).status).toBe(422);
    expect((await post({ steps: 100, date: "17.10.2026" })).status).toBe(422);
    expect((await post({ steps: 100, date: "2026-02-31" })).status).toBe(422);
    expect(rpc.calls).toEqual([]);
  });

  it("passes the database's refusals on with their status", async () => {
    for (const [data, status] of [
      ["bad_token", 401],
      ["rate_limited", 429],
      ["too_many_steps", 422],
      ["bad_day", 422],
    ] as const) {
      rpc.answer = { data, error: null };
      expect((await post({ steps: 100 })).status).toBe(status);
    }
  });

  it("says the service is unavailable when the database fails", async () => {
    rpc.answer = { data: null, error: { code: "57014" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ steps: 100 })).status).toBe(503);
  });
});

describe("GET /api/ingest/steps", () => {
  it("never reads with the token", async () => {
    expect(GET(new Request(URL)).status).toBe(401);
  });
});

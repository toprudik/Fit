import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));

/** What public.calendar_feed answers, and the calls it got. */
const rpc = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as { code: string } | null },
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

const { GET } = await import("./route");

const TOKEN = "feed-token-for-unit-tests_0001";

const get = (token: string) => GET(new Request(`${APP_URL}/api/calendar/${token}`), { params: Promise.resolve({ token }) });

const event = {
  uid: "session-1",
  starts_at: "2026-10-20T07:00:00Z",
  ends_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-18T10:00:00Z",
  cancelled: false,
  kind: "personal",
  title: null,
  mode: "offline",
  location_name: "Test gym",
  location_address: "1 Example street",
  meeting_url: null,
  partner: "Test Client",
};

beforeEach(() => {
  rpc.answer = { data: { zone: "trainer", locale: "en", events: [event] }, error: null };
  rpc.calls = [];
});

describe("GET /api/calendar/[token]", () => {
  it("answers the feed as an iCalendar file for calendar apps", async () => {
    const response = await get(`${TOKEN}.ics`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(rpc.calls).toEqual([{ name: "calendar_feed", args: { p_token: TOKEN } }]);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="dafit.ics"');
    // The token is a secret in the URL: no shared cache and no search engine keeps it.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("UID:session-1@dafit");
    expect(body).toContain("DTSTART:20261020T070000Z");
    expect(body).toContain(`URL:${APP_URL}/trainer/schedule`);
  });

  it("takes the token without the .ics suffix too", async () => {
    expect((await get(TOKEN)).status).toBe(200);
    expect(rpc.calls[0].args).toEqual({ p_token: TOKEN });
  });

  it("names the calendar in the feed's language, Russian when it has none", async () => {
    const english = await (await get(TOKEN)).text();
    rpc.answer = { data: { zone: "trainer", events: [] }, error: null };
    const russian = await (await get(TOKEN)).text();
    rpc.answer = { data: { zone: "trainer", locale: "de", events: [] }, error: null };
    const unknown = await (await get(TOKEN)).text();

    const name = (body: string) => /X-WR-CALNAME:(.*)\r\n/.exec(body)?.[1];
    expect(name(english)).not.toBe(name(russian));
    expect(name(unknown)).toBe(name(russian));
  });

  it.each(["short", "has spaces in it, long enough", "token/with/slashes-0000000", `${"a".repeat(101)}`, "feed-token-for-unit-tests_0001.ics.ics"])(
    "answers 404 to a malformed token %j before reaching the database",
    async (token) => {
      const response = await get(token);

      expect(response.status).toBe(404);
      expect(rpc.calls).toEqual([]);
    },
  );

  it.each([
    ["an unknown or reissued token", null],
    ["a list", []],
    ["a string", "nope"],
  ])("answers 404 for %s", async (_name, data) => {
    rpc.answer = { data, error: null };
    const response = await get(TOKEN);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("answers 503 when the database fails and logs only the code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.answer = { data: null, error: { code: "57014" } };
    const response = await get(TOKEN);

    expect(response.status).toBe(503);
    expect(error).toHaveBeenCalledWith("calendar feed failed", "57014");
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
  });
});

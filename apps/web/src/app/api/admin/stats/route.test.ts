import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

const summary = {
  users: 120,
  trainers: 12,
  trainers_verified: 4,
  clients: 100,
  cards: 30,
  pairs: 80,
  dau: 20,
  wau: 60,
  mau: 100,
  trainers_active_7: 8,
  trainers_active_30: 11,
  clients_active_7: 50,
  clients_active_30: 90,
  held_sessions: 400,
  attended: 380,
  bookings: 420,
  passes_sold: 25,
  turnover: { RUB: 12_345_000 },
  turnover_30: { RUB: 2_000_050 },
  trainer_invites_created: 10,
  trainer_invites_redeemed: 6,
  trainer_referrals: 2,
  client_referrals: 5,
  client_referrals_qualified: 3,
  joins_by_source: { link: 40 },
};
const success = { clients: 100, clients_with_streak: 31, trainers: 12, trainers_offer_live: 8, trainers_offer_ever: 9 };
const week = { week_start: "2026-10-05", new_users: 6, new_trainers: 1, new_pairs: 4, active_users: 50, active_trainers: 8, active_clients: 40, held_sessions: 30, attended: 28, bookings: 32, passes_sold: 2, turnover: { RUB: 100_000 }, trainer_invites_created: 1, trainer_invites_redeemed: 1, referrals: 0 };
const cohort = { cohort_week: "2026-09-28", size: 10, retained: [6, 4] };
const channel = { source: "vk", campaign: null, users: 7, trainers: 2, clients: 4 };

/**
 * The signed-in user, whether they hold the admin role, the owner RPCs' answers (an error code fails that RPC)
 * and the RPC calls made.
 */
const session = vi.hoisted(() => ({
  userId: null as string | null,
  admin: false,
  failing: null as string | null,
  rpcs: [] as { name: string; args: unknown }[],
  roleQueries: [] as [string, unknown][][],
  uploads: [] as { bucket: string; path: string; body: Blob }[],
  signed: [] as { path: string; ttl: number; options: unknown }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Blob) => {
          session.uploads.push({ bucket, path, body });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string, ttl: number, options: unknown) => {
          session.signed.push({ path, ttl, options });
          return { data: { signedUrl: `https://storage.example/sign/${bucket}/${path}?token=t` }, error: null };
        },
      }),
    },
    from: (table: string) => {
      expect(table).toBe("user_roles");
      const filters: [string, unknown][] = [];
      session.roleQueries.push(filters);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: session.admin ? { role: "admin" } : null, error: null }),
      };
      return query;
    },
    rpc: (name: string, args?: unknown) => {
      session.rpcs.push({ name, args });
      const answers: Record<string, unknown> = {
        admin_owner_summary: summary,
        admin_owner_success: success,
        admin_owner_sources: [channel],
        admin_owner_weekly: [week],
        admin_owner_cohorts: [cohort],
      };
      const result = session.failing === name ? { data: null, error: { code: "42501" } } : { data: answers[name], error: null };
      return Object.assign(Promise.resolve(result), { single: async () => result });
    },
  }),
}));

const { GET, POST } = await import("./route");

const get = (search = "", cookie?: string) =>
  GET(new NextRequest(`https://fit.example/api/admin/stats${search}`, { headers: cookie ? { cookie } : {} }));

/** The body as sent: Response.text() would drop the BOM the file starts with. */
const rawText = async (response: Response) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());

beforeEach(() => {
  session.userId = "user-42";
  session.admin = true;
  session.failing = null;
  session.rpcs = [];
  session.roleQueries = [];
  session.uploads = [];
  session.signed = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
});

describe("GET /api/admin/stats", () => {
  it("gives an admin the whole page as a CSV download", async () => {
    const response = await get();
    const body = await rawText(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="dafit-stats-2026-10-18.csv"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // Russian by default: a BOM for Excel, ";" between cells and the Russian section names.
    expect(body.startsWith(`﻿${dictionaries.ru.ownerStats.csv.sections.summary}\r\n`)).toBe(true);
    expect(body).toContain("123450,00 RUB");
    expect(body).toContain("2026-10-05;6;");
    expect(body).toContain("2026-09-28;10;60%;40%");
    expect(body).toContain("ВКонтакте;;7;2;4");
    expect(session.roleQueries).toEqual([
      [
        ["user_id", "user-42"],
        ["role", "admin"],
      ],
    ]);
  });

  it("writes the file in the language of the locale cookie", async () => {
    const body = await rawText(await get("", "dafit-locale=en"));

    expect(body.startsWith(`﻿${dictionaries.en.ownerStats.csv.sections.summary}\r\n`)).toBe(true);
    expect(body).toContain("123450.00 RUB");
    expect(body).toContain("2026-10-05,6,");
  });

  it("falls back to Russian for an unknown locale cookie", async () => {
    const body = await rawText(await get("", "dafit-locale=de"));
    expect(body.startsWith(`﻿${dictionaries.ru.ownerStats.csv.sections.summary}\r\n`)).toBe(true);
  });

  it.each([
    ["", 12, 12],
    ["?weeks=26", 26, 12],
    ["?weeks=8", 8, 8],
    ["?weeks=1000", 12, 12],
    ["?weeks=abc", 12, 12],
  ])("reads the period %j as %i weeks", async (search, weeks, cohorts) => {
    await get(search);

    expect(session.rpcs).toContainEqual({ name: "admin_owner_weekly", args: { p_weeks: weeks } });
    expect(session.rpcs).toContainEqual({ name: "admin_owner_cohorts", args: { p_weeks: cohorts } });
  });

  it("answers 404 to a signed-out visitor, like the admin pages", async () => {
    session.userId = null;
    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(session.rpcs).toEqual([]);
  });

  it("answers the same 404 to a user who is not an admin", async () => {
    session.admin = false;
    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(session.rpcs).toEqual([]);
  });

  it.each(["admin_owner_summary", "admin_owner_success", "admin_owner_sources", "admin_owner_weekly", "admin_owner_cohorts"])(
    "answers 500 without data when %s fails",
    async (name) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      session.failing = name;
      const response = await get();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "export_failed" });
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining("42501"));
    },
  );
});

const post = (search = "?weeks=26", origin = "https://fit.example") =>
  POST(
    new NextRequest(`https://fit.example/api/admin/stats${search}`, {
      method: "POST",
      headers: { origin, "sec-fetch-site": origin === "https://fit.example" ? "same-origin" : "cross-site" },
    }),
  );

describe("POST /api/admin/stats (Telegram's download dialog)", () => {
  it("puts the same file into the admin's own csv folder and answers a short signed link", async () => {
    const response = await post();
    const expected = await rawText(await get("?weeks=26"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [upload] = session.uploads;
    expect(upload.bucket).toBe("exports");
    expect(upload.path).toMatch(/^user-42\/csv\/[0-9a-f-]{36}\.csv$/);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await upload.body.arrayBuffer())).toBe(expected);
    expect(session.rpcs).toContainEqual({ name: "admin_owner_weekly", args: { p_weeks: 26 } });
    const fileName = "dafit-stats-2026-10-18.csv";
    expect(session.signed).toEqual([{ path: upload.path, ttl: 300, options: { download: fileName } }]);
    expect(await response.json()).toEqual({ url: `https://storage.example/sign/exports/${upload.path}?token=t`, fileName });
  });

  it.each([
    ["a signed-out visitor", () => (session.userId = null)],
    ["a user who is not an admin", () => (session.admin = false)],
  ])("answers %s the same 404 and stores nothing", async (_who, arrange) => {
    arrange();
    const response = await post();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(session.rpcs).toEqual([]);
    expect(session.uploads).toEqual([]);
  });

  it("answers another site the same 404 before reading the session (ADR 0004)", async () => {
    const response = await post("?weeks=26", "https://evil.example");

    expect(response.status).toBe(404);
    expect(session.roleQueries).toEqual([]);
    expect(session.uploads).toEqual([]);
  });
});

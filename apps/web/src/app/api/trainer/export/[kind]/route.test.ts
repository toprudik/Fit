import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

vi.mock("server-only", () => ({}));

type Query = { table: string; calls: [string, ...unknown[]][] };

/**
 * The trainer's session: who is signed in, whether their plan has trainer.export, their saved zone, the rows
 * each table answers (a table in `failing` answers an error instead) and every query made, with its filters.
 */
const db = vi.hoisted(() => ({
  userId: null as string | null,
  entitled: true as boolean | null,
  entitlementError: false,
  timeZone: "Europe/Moscow" as string | null,
  rows: {} as Record<string, unknown[]>,
  failing: null as string | null,
  queries: [] as Query[],
  rpcs: [] as { name: string; args: unknown }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    rpc: async (name: string, args: unknown) => {
      db.rpcs.push({ name, args });
      return db.entitlementError ? { data: null, error: { code: "XX000" } } : { data: db.entitled, error: null };
    },
    from: (table: string) => {
      const query: Query = { table, calls: [] };
      db.queries.push(query);
      const result = () => (db.failing === table ? { data: null, error: { code: "42501" } } : { data: db.rows[table] ?? [], error: null });
      const builder: Record<string, unknown> = {
        maybeSingle: async () => (table === "user_settings" ? { data: db.timeZone ? { time_zone: db.timeZone } : null, error: null } : result()),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      for (const method of ["select", "eq", "lt", "gte", "or", "order", "in", "range"]) {
        builder[method] = (...args: unknown[]) => {
          query.calls.push([method, ...args]);
          return builder;
        };
      }
      return builder;
    },
  }),
}));

const { GET } = await import("./route");

const en = dictionaries.en;

function get(kind: string, search = "?from=2026-10-01&to=2026-11-01", cookie = "dafit-locale=en") {
  return GET(new NextRequest(`https://fit.example/api/trainer/export/${kind}${search}`, { headers: { cookie } }), {
    params: Promise.resolve({ kind }),
  });
}

/** The body as sent: Response.text() would drop the BOM. */
const rawText = async (response: Response) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
/** The CSV as rows of cells, quoted cells unquoted (no cell in these tests holds a line break). */
function table(csv: string, separator = ","): string[][] {
  return csv
    .replace(/^﻿/, "")
    .split("\r\n")
    .filter(Boolean)
    .map((line) => {
      const cells: string[] = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted && char === '"' && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') quoted = !quoted;
        else if (char === separator && !quoted) {
          cells.push(cell);
          cell = "";
        } else cell += char;
      }
      return [...cells, cell];
    });
}

const queriesOf = (name: string) => db.queries.filter((query) => query.table === name);

/** October in Moscow: local midnights of Oct 1 and Nov 1 are 21:00 UTC the day before. */
const FROM_AT = "2026-09-30T21:00:00.000Z";
const TO_AT = "2026-10-31T21:00:00.000Z";

beforeEach(() => {
  db.userId = "user-42";
  db.entitled = true;
  db.entitlementError = false;
  db.timeZone = "Europe/Moscow";
  db.failing = null;
  db.queries = [];
  db.rpcs = [];
  db.rows = {
    coachings: [
      { id: "pair-1", client_id: "client-1", status: "active", started_at: "2026-09-01T09:00:00Z", ended_at: null },
      { id: "pair-2", client_id: "client-2", status: "ended", started_at: "2026-08-01T09:00:00Z", ended_at: "2026-10-10T09:00:00Z" },
    ],
    coaching_trainer_meta: [{ coaching_id: "pair-2", client_alias: "Morning client" }],
    profiles: [
      { id: "client-1", first_name: "Test", last_name: "Client", display_name: null, username: null },
      { id: "client-2", first_name: "Other", last_name: null, display_name: null, username: null },
    ],
    coaching_stats: [{ coaching_id: "pair-1", attended_count: 7, no_show_count: 1 }],
    coaching_balances: [{ coaching_id: "pair-1", available_sessions: 3, debt_sessions: 0 }],
    sessions: [
      { id: "session-1", starts_at: "2026-10-05T07:00:00Z", kind: "personal", title: null },
      { id: "session-2", starts_at: "2026-10-06T15:30:00Z", kind: "group", title: "Stretching" },
    ],
    bookings: [{ session_id: "session-1", coaching_id: "pair-1", status: "attended" }],
    payments: [
      { coaching_id: "pair-1", amount_minor: 500_050, currency: "RUB", method: "cash", paid_at: "2026-10-02T10:00:00Z", direction: "in", status: "confirmed" },
      { coaching_id: "pair-1", amount_minor: 100_000, currency: "RUB", method: "cash", paid_at: "2026-10-03T10:00:00Z", direction: "refund", status: "voided" },
    ],
    passes: [{ id: "pass-1", coaching_id: "pair-1", starts_on: "2026-10-01" }],
    pass_balances: [
      {
        pass_id: "pass-1",
        title: "8 sessions",
        sessions_total: 8,
        remaining: 5,
        price_minor: 800_000,
        paid_minor: null,
        currency: "RUB",
        effective_expires_at: "2026-11-30T20:59:59Z",
        status: "active",
      },
    ],
  };
});

describe("GET /api/trainer/export/[kind]", () => {
  it("sends the period's payments as a CSV download named after the period", async () => {
    const response = await get("payments");
    const csv = await rawText(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    // The last day in the name is inclusive: [Oct 1, Nov 1) is Oct 1 to Oct 31.
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="dafit-payments-2026-10-01-2026-10-31.csv"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(csv.startsWith("﻿")).toBe(true);
    const c = en.trainerAnalytics.csv.columns;
    expect(table(csv)).toEqual([
      [c.paidAt, c.client, c.amount, c.currency, c.method, c.direction, c.status],
      ["2026-10-02T13:00:00+03:00", "Test Client", "5000.50", "RUB", en.money.payments.methods.cash, "", en.money.payments.status.confirmed],
      ["2026-10-03T13:00:00+03:00", "Test Client", "-1000.00", "RUB", en.money.payments.methods.cash, en.money.payments.refund, en.money.payments.status.voided],
    ]);
    expect(queriesOf("payments")[0].calls).toEqual(
      expect.arrayContaining([
        ["eq", "trainer_id", "user-42"],
        ["gte", "paid_at", FROM_AT],
        ["lt", "paid_at", TO_AT],
      ]),
    );
  });

  it("lists the pairs that were live in the period, with the trainer's alias first", async () => {
    const csv = await rawText(await get("clients"));
    const c = en.trainerAnalytics.csv.columns;
    const status = en.trainerAnalytics.csv.pairStatus;

    expect(table(csv)).toEqual([
      [c.client, c.status, c.startedAt, c.attended, c.noShows, c.availableSessions, c.debtSessions],
      ["Test Client", status.active, "2026-09-01T12:00:00+03:00", "7", "1", "3", "0"],
      ["Morning client", status.ended, "2026-08-01T12:00:00+03:00", "0", "0", "0", "0"],
    ]);
    expect(queriesOf("coachings")[0].calls).toEqual(
      expect.arrayContaining([
        ["eq", "trainer_id", "user-42"],
        ["lt", "started_at", TO_AT],
        ["or", `ended_at.is.null,ended_at.gte.${FROM_AT}`],
      ]),
    );
  });

  it("gives every booking a row and a session without bookings an empty one", async () => {
    const csv = await rawText(await get("sessions"));
    const c = en.trainerAnalytics.csv.columns;

    expect(table(csv)).toEqual([
      [c.startsAt, c.kind, c.session, c.client, c.booking],
      ["2026-10-05T10:00:00+03:00", en.schedule.session, "", "Test Client", en.schedule.clientSessions.status.attended],
      ["2026-10-06T18:30:00+03:00", en.schedule.group, "Stretching", "", ""],
    ]);
    expect(queriesOf("bookings")[0].calls).toContainEqual(["in", "session_id", ["session-1", "session-2"]]);
  });

  it("lists the passes sold in the period with what is left and paid", async () => {
    const csv = await rawText(await get("passes"));
    const c = en.trainerAnalytics.csv.columns;

    expect(table(csv)).toEqual([
      [c.startsOn, c.client, c.pass, c.total, c.remaining, c.price, c.paid, c.currency, c.expiresAt],
      ["2026-10-01", "Test Client", "8 sessions", "8", "5", "8000.00", "", "RUB", "2026-11-30T23:59:59+03:00"],
    ]);
    // Passes are sold on local days, so the day range is used as it is.
    expect(queriesOf("passes")[0].calls).toEqual(
      expect.arrayContaining([
        ["gte", "starts_on", "2026-10-01"],
        ["lt", "starts_on", "2026-11-01"],
      ]),
    );
  });

  it("writes Russian with ';' and a decimal comma by default", async () => {
    const csv = await rawText(await get("payments", undefined, ""));
    const ru = dictionaries.ru;

    expect(table(csv, ";")[0][0]).toBe(ru.trainerAnalytics.csv.columns.paidAt);
    expect(table(csv, ";")[1][2]).toBe("5000,50");
  });

  it("uses the default zone when the trainer has none saved", async () => {
    db.timeZone = null;
    await get("payments");
    expect(queriesOf("payments")[0].calls).toContainEqual(["gte", "paid_at", FROM_AT]);
  });

  it("follows the trainer's own zone", async () => {
    db.timeZone = "Asia/Almaty";
    const csv = await rawText(await get("payments"));

    expect(queriesOf("payments")[0].calls).toContainEqual(["gte", "paid_at", "2026-09-30T19:00:00.000Z"]);
    expect(table(csv)[1][0]).toBe("2026-10-02T15:00:00+05:00");
  });

  it("answers a header only for an empty period", async () => {
    db.rows = { ...db.rows, payments: [] };
    const csv = await rawText(await get("payments"));
    expect(table(csv)).toHaveLength(1);
  });

  it.each([
    ["an unknown kind", "invoices", "?from=2026-10-01&to=2026-11-01"],
    ["no period", "payments", ""],
    ["no end", "payments", "?from=2026-10-01"],
    ["a day that does not exist", "payments", "?from=2026-02-30&to=2026-03-10"],
    ["a day in another format", "payments", "?from=01.10.2026&to=2026-11-01"],
    ["an empty period", "payments", "?from=2026-10-01&to=2026-10-01"],
    ["an end before the start", "payments", "?from=2026-10-10&to=2026-10-01"],
    ["more than 400 days", "payments", "?from=2026-01-01&to=2027-02-06"],
  ])("answers 400 to %s before reading anything", async (_name, kind, search) => {
    const response = await get(kind, search);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
    expect(db.queries).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });

  it("takes a period of exactly 400 days", async () => {
    expect((await get("payments", "?from=2026-01-01&to=2027-02-05")).status).toBe(200);
  });

  it("answers 401 to a signed-out visitor", async () => {
    db.userId = null;
    const response = await get("payments");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(queriesOf("payments")).toEqual([]);
  });

  it("answers 403 when the plan has no CSV export", async () => {
    db.entitled = false;
    const response = await get("payments");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "plan_required" });
    expect(db.rpcs).toEqual([{ name: "has_entitlement", args: { p_user: "user-42", p_feature: "trainer.export" } }]);
    expect(queriesOf("payments")).toEqual([]);
  });

  it("answers 403 when the plan can't be checked", async () => {
    db.entitlementError = true;
    expect((await get("payments")).status).toBe(403);
    expect(queriesOf("payments")).toEqual([]);
  });

  it.each([
    ["clients", "coachings"],
    ["clients", "coaching_stats"],
    ["clients", "coaching_balances"],
    ["sessions", "sessions"],
    ["sessions", "bookings"],
    ["payments", "payments"],
    ["passes", "passes"],
    ["passes", "pass_balances"],
  ])("answers 500 without a file when %s fails on %s", async (kind, failing) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failing = failing;
    const response = await get(kind);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "export_failed" });
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("42501"));
  });
});

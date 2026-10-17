import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { clientNames } from "@/lib/schedule/load";
import { addDays, localToUtc, parseDay } from "@/lib/schedule/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { exportFileName, isExportKind, isoInZone, majorUnits, toCsv, type Cell, type ExportKind } from "@/lib/trainer-analytics/csv";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Range = { from: string; to: string; fromAt: string; toAt: string };
type Context = { supabase: Supabase; userId: string; timeZone: string; locale: Locale; range: Range };

function fail(what: string, error: { code?: string } | null): never {
  throw new Error(`exporting ${what} failed: ${error?.code}`);
}

/** Pairs of the trainer that were live at some point of the period. */
async function clients({ supabase, userId, locale, timeZone, range }: Context): Promise<[string[], Cell[][]]> {
  const t = dictionaries[locale].trainerAnalytics.csv;
  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, status, started_at, ended_at")
    .eq("trainer_id", userId)
    .lt("started_at", range.toAt)
    .or(`ended_at.is.null,ended_at.gte.${range.fromAt}`)
    .order("started_at");
  if (error) fail("clients", error);
  const ids = pairs.map((pair) => pair.id);
  const [names, stats, balances] = await Promise.all([
    clientNames(supabase, ids),
    supabase.from("coaching_stats").select("coaching_id, attended_count, no_show_count").in("coaching_id", ids),
    supabase.from("coaching_balances").select("coaching_id, available_sessions, debt_sessions").in("coaching_id", ids),
  ]);
  if (stats.error) fail("client stats", stats.error);
  if (balances.error) fail("client balances", balances.error);
  const stat = new Map(stats.data.map((row) => [row.coaching_id, row]));
  const balance = new Map(balances.data.map((row) => [row.coaching_id, row]));
  const c = t.columns;
  return [
    [c.client, c.status, c.startedAt, c.attended, c.noShows, c.availableSessions, c.debtSessions],
    pairs.map((pair) => [
      names.get(pair.id),
      t.pairStatus[pair.status],
      pair.started_at ? isoInZone(pair.started_at, timeZone) : null,
      stat.get(pair.id)?.attended_count ?? 0,
      stat.get(pair.id)?.no_show_count ?? 0,
      balance.get(pair.id)?.available_sessions ?? 0,
      balance.get(pair.id)?.debt_sessions ?? 0,
    ]),
  ];
}

/** Every booking of the sessions that started in the period. */
async function sessions({ supabase, userId, locale, timeZone, range }: Context): Promise<[string[], Cell[][]]> {
  const d = dictionaries[locale];
  const c = d.trainerAnalytics.csv.columns;
  const { data: rows, error } = await supabase
    .from("sessions")
    .select("id, starts_at, kind, title")
    .eq("trainer_id", userId)
    .gte("starts_at", range.fromAt)
    .lt("starts_at", range.toAt)
    .order("starts_at");
  if (error) fail("sessions", error);
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("session_id, coaching_id, status")
    .in(
      "session_id",
      rows.map((row) => row.id),
    );
  if (bookingsError) fail("bookings", bookingsError);
  const names = await clientNames(
    supabase,
    bookings.map((booking) => booking.coaching_id),
  );
  const kind = { personal: d.schedule.session, trial: d.schedule.trial, group: d.schedule.group } as const;
  const bySession = Map.groupBy(bookings, (booking) => booking.session_id);
  return [
    [c.startsAt, c.kind, c.session, c.client, c.booking],
    rows.flatMap((row) => {
      const base: Cell[] = [isoInZone(row.starts_at, timeZone), kind[row.kind], row.title];
      const list = bySession.get(row.id) ?? [];
      return list.length === 0
        ? [[...base, null, null]]
        : list.map((booking) => [...base, names.get(booking.coaching_id), d.schedule.clientSessions.status[booking.status]]);
    }),
  ];
}

/** Payments of the period by their date, voided ones included with their status. */
async function payments({ supabase, userId, locale, timeZone, range }: Context): Promise<[string[], Cell[][]]> {
  const d = dictionaries[locale];
  const c = d.trainerAnalytics.csv.columns;
  const { data: rows, error } = await supabase
    .from("payments")
    .select("coaching_id, amount_minor, currency, method, paid_at, direction, status")
    .eq("trainer_id", userId)
    .gte("paid_at", range.fromAt)
    .lt("paid_at", range.toAt)
    .order("paid_at");
  if (error) fail("payments", error);
  const names = await clientNames(
    supabase,
    rows.map((row) => row.coaching_id),
  );
  return [
    [c.paidAt, c.client, c.amount, c.currency, c.method, c.direction, c.status],
    rows.map((row) => [
      isoInZone(row.paid_at, timeZone),
      names.get(row.coaching_id),
      majorUnits(row.direction === "refund" ? -row.amount_minor : row.amount_minor, locale),
      row.currency,
      d.money.payments.methods[row.method],
      row.direction === "refund" ? d.money.payments.refund : null,
      d.money.payments.status[row.status],
    ]),
  ];
}

/** Passes sold in the period, with what is left and what is paid. */
async function passes({ supabase, userId, locale, timeZone, range }: Context): Promise<[string[], Cell[][]]> {
  const c = dictionaries[locale].trainerAnalytics.csv.columns;
  const { data: sold, error } = await supabase
    .from("passes")
    .select("id, coaching_id, starts_on")
    .eq("trainer_id", userId)
    .gte("starts_on", range.from)
    .lt("starts_on", range.to)
    .order("starts_on");
  if (error) fail("passes", error);
  const ids = sold.map((pass) => pass.id);
  const [names, balances] = await Promise.all([
    clientNames(
      supabase,
      sold.map((pass) => pass.coaching_id),
    ),
    supabase.from("pass_balances").select("pass_id, title, sessions_total, remaining, price_minor, paid_minor, currency, effective_expires_at, status").in("pass_id", ids),
  ]);
  if (balances.error) fail("pass balances", balances.error);
  const balance = new Map(balances.data.map((row) => [row.pass_id, row]));
  return [
    [c.startsOn, c.client, c.pass, c.total, c.remaining, c.price, c.paid, c.currency, c.expiresAt],
    sold.map((pass) => {
      const row = balance.get(pass.id);
      return [
        pass.starts_on,
        names.get(pass.coaching_id),
        row?.title,
        row?.sessions_total,
        row?.remaining,
        row?.price_minor === null || row?.price_minor === undefined ? null : majorUnits(row.price_minor, locale),
        row?.paid_minor === null || row?.paid_minor === undefined ? null : majorUnits(row.paid_minor, locale),
        row?.currency,
        row?.effective_expires_at ? isoInZone(row.effective_expires_at, timeZone) : null,
      ];
    }),
  ];
}

const BUILDERS: Record<ExportKind, (context: Context) => Promise<[string[], Cell[][]]>> = { clients, sessions, payments, passes };

/**
 * «Выгрузка в CSV» of «Аналитика» (PRD wave-2 §7 rule 10): one file per kind for local days [from, to) of the
 * trainer's zone. Reads through the trainer's own session, so RLS limits it to their pairs; Pro (trainer.export).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/trainer/export/[kind]">) {
  const { kind } = await params;
  const from = parseDay(request.nextUrl.searchParams.get("from"));
  const to = parseDay(request.nextUrl.searchParams.get("to"));
  if (!isExportKind(kind) || !from || !to || to <= from || to > addDays(from, 400)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [allowed, settings] = await Promise.all([
    supabase.rpc("has_entitlement", { p_user: userId, p_feature: "trainer.export" }),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (allowed.error || allowed.data !== true) return NextResponse.json({ error: "plan_required" }, { status: 403 });

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const timeZone = settings.data?.time_zone ?? DEFAULT_TIME_ZONE;
  const range = { from, to, fromAt: localToUtc(from, 0, timeZone).toISOString(), toAt: localToUtc(to, 0, timeZone).toISOString() };
  try {
    const [header, rows] = await BUILDERS[kind]({ supabase, userId, timeZone, locale, range });
    return new NextResponse(toCsv(header, rows, locale), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(kind, from, addDays(to, -1))}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "exporting failed");
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}

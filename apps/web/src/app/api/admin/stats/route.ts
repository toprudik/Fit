import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { answerWithCsvCopy } from "@/lib/account/csv-copy";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { loadOwnerMetrics } from "@/lib/owner-metrics/load";
import { ownerCsv, ownerCsvName, ownerWeeks } from "@/lib/owner-metrics/metrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Built = { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; userId: string; csv: string; fileName: string };

/** Checks that the caller is an admin, then builds the file; a Response is the answer when that fails. */
async function build(request: NextRequest): Promise<Built | NextResponse> {
  // POST stores a file, so it comes from the app's own pages only (ADR 0004), with the same 404 as the rest.
  if (request.method === "POST" && !isSameOrigin(request)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: admin } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!admin) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  try {
    const data = await loadOwnerMetrics(supabase, ownerWeeks(request.nextUrl.searchParams.get("weeks") ?? undefined));
    const today = new Date().toISOString().slice(0, 10);
    const copy = dictionaries[locale].ownerStats;
    const csv = ownerCsv(data, { ...copy.csv, sources: copy.sources, channelNames: copy.channels.names, noChannel: copy.channels.none }, locale);
    return { supabase, userId, csv, fileName: ownerCsvName(today) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "exporting the owner statistics failed");
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}

/**
 * «Скачать CSV» of /admin/stats: the summary, the channels, the weeks and the cohorts in one file for a deck. Admins only:
 * everyone else gets the same 404 as the admin pages (ADM-12).
 */
export async function GET(request: NextRequest) {
  const built = await build(request);
  if (built instanceof NextResponse) return built;
  return new NextResponse(built.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${built.fileName}"`,
      "cache-control": "private, no-store",
    },
  });
}

/** The same file for Telegram's download dialog in the Mini App: a short signed link to a copy in the admin's own folder. */
export async function POST(request: NextRequest) {
  const built = await build(request);
  if (built instanceof NextResponse) return built;
  return answerWithCsvCopy(built.supabase, built.userId, built.csv, built.fileName);
}

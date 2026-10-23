import "server-only";
import { NextResponse } from "next/server";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { EXPORT_BUCKET } from "./export";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Lifetime of the signed link Telegram downloads the CSV copy by; Telegram fetches it right away. */
const LINK_TTL_SECONDS = 300;

/**
 * A CSV file for Telegram's download dialog, which fetches it without the app's cookies: a copy goes to
 * exports/<user_id>/csv/ with the user's own session, and the answer is a short signed link to it. The privacy
 * route removes the copy within an hour (20261023022417_csv_downloads.sql).
 */
export async function answerWithCsvCopy(supabase: Supabase, userId: string, csv: string, fileName: string): Promise<NextResponse> {
  const storage = supabase.storage.from(EXPORT_BUCKET);
  const path = `${userId}/csv/${crypto.randomUUID()}.csv`;
  const { error: uploadError } = await storage.upload(path, new Blob([csv], { type: "text/csv" }), { contentType: "text/csv" });
  if (uploadError) {
    console.error("uploading a CSV copy failed", uploadError.name);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
  const { data, error } = await storage.createSignedUrl(path, LINK_TTL_SECONDS, { download: fileName });
  if (error || !data) {
    console.error("signing a CSV copy failed", error?.name ?? "unknown");
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl, fileName }, { headers: { "cache-control": "private, no-store" } });
}

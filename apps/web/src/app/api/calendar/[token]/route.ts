import { NextResponse } from "next/server";
import { clientEnv } from "@/env/client";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { buildCalendar, type Feed } from "@/lib/calendar/ics";
import { feedToken } from "@/lib/calendar/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * A calendar feed (PRD 2.7): `GET /api/calendar/<token>.ics`, fetched by Google, Apple or Outlook without a
 * session. The token is the only key: public.calendar_feed (service role) checks its hash, so an unknown or
 * reissued token answers 404 (CAL-3). The secret key is needed because nobody is signed in here.
 */
export async function GET(_request: Request, context: RouteContext<"/api/calendar/[token]">) {
  const { token: raw } = await context.params;
  const token = feedToken(raw);
  if (!token) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createSupabaseAdminClient().rpc("calendar_feed", { p_token: token });
  if (error) {
    console.error("calendar feed failed", error.code);
    return new NextResponse("Unavailable", { status: 503 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return new NextResponse("Not found", { status: 404 });

  const feed = data as unknown as Feed & { locale?: string };
  const locale = isLocale(feed.locale) ? feed.locale : "ru";
  const body = buildCalendar(feed, {
    copy: dictionaries[locale].calendar.ics,
    appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
    now: new Date(),
  });
  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="dafit.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}

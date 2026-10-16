import { NextResponse } from "next/server";
import { preferencesPatch, saveAccountPreferencesRow } from "@/lib/account-preferences";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Saves the language, theme or last zone the user just picked to their account, so it follows them
 * to other devices (ADR 0015). The browser has already written the cookie; signed out, there is no
 * account and the cookie alone keeps the choice.
 */
export async function PATCH(request: Request) {
  // CSRF: JSON content type forces a CORS preflight for cross-site callers; Origin must be ours.
  if (!isSameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = preferencesPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  // Signed out: nothing to save, and no error for the browser to report.
  if (!userId) return new NextResponse(null, { status: 204 });

  const { error } = await saveAccountPreferencesRow(supabase, userId, parsed.data);
  if (error) {
    console.error("saving preferences failed", error.code);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTimeZone } from "@/lib/trainer-wizard/options";

const body = z.object({ timeZone: z.string().max(64).refine(isTimeZone) });

/**
 * Saves the device's time zone to the signed-in user's account (PRD 2.6.7 rule 4): a client sees
 * times, quiet hours and bot messages in the zone of their device. A trainer's zone is part of their
 * profile (rule 1): the wizard suggests the device's zone and the trainer saves it, so it is left
 * alone here. Answers { changed } so the page re-renders its times only when the zone moved.
 */
export async function POST(request: Request) {
  // CSRF: JSON content type forces a CORS preflight for cross-site callers; Origin must be ours.
  if (!isSameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ changed: false });

  const trainer = await supabase.from("trainer_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (trainer.error || trainer.data) return NextResponse.json({ changed: false });

  const { data: rows, error } = await supabase
    .from("user_settings")
    .update({ time_zone: parsed.data.timeZone })
    .eq("user_id", userId)
    .neq("time_zone", parsed.data.timeZone)
    .select("user_id");
  if (error) {
    console.error("saving the device time zone failed", error.code);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ changed: (rows ?? []).length > 0 });
}

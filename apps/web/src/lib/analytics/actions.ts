"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const source = z
  .string()
  .regex(/^[a-z_]{1,40}$/)
  .nullable();

/**
 * Records that the signed-in user opened the app, with the bot message type from ?source= when a bot button
 * opened it (beta metric «открытия из напоминаний», Q26). Signed-out visitors and failures are ignored: the
 * metric must never get in the way of the app.
 */
export async function recordAppOpen(raw: string | null): Promise<void> {
  const parsed = source.safeParse(raw);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return;
  const { error } = await supabase.rpc("record_app_open", { p_source: parsed.success ? (parsed.data ?? undefined) : undefined });
  if (error) console.error("recording an app open failed", error.code);
}

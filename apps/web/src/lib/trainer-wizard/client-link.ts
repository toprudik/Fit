import "server-only";

import { clientEnv } from "@/env/client";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The client link's landing page (screens.md §3.1 /i/[code]); the QR carries the same address. */
export function clientInviteUrl(token: string): string {
  return new URL(`/i/${token}`, clientEnv.NEXT_PUBLIC_APP_URL).toString();
}

/**
 * The client link the result screen shows: the trainer's oldest live one, or a new one when there is
 * none yet (the database generates its token and code). Returns null when it can't be read or made.
 */
export async function ensureClientInvite(supabase: Supabase, user: string): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("client_invites")
    .select("token")
    .eq("trainer_id", user)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("reading the client link failed", readError.code);
    return null;
  }
  if (existing) return existing.token;

  const { data: created, error } = await supabase.from("client_invites").insert({ trainer_id: user }).select("token").single();
  if (error) {
    console.error("creating the client link failed", error.code);
    return null;
  }
  return created.token;
}


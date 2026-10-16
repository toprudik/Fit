import "server-only";

import { clientEnv } from "@/env/client";
import { clientLinkUrl } from "@/lib/client-links/link";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The client link's landing page (/i/<token>); the QR carries the same address. */
export function clientInviteUrl(token: string): string {
  return clientLinkUrl(token, clientEnv.NEXT_PUBLIC_APP_URL);
}

/**
 * The client link the result screen shows: my_client_invite returns the trainer's newest working
 * link, or makes one under a lock on the trainer row, so two requests never create two links.
 * Returns null when the database refused.
 */
export async function ensureClientInvite(supabase: Supabase): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_client_invite").single();
  if (error || !data) {
    console.error("getting the client link failed", error?.code);
    return null;
  }
  return data.token;
}

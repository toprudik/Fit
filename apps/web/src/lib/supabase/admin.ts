import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";

/**
 * Privileged client (secret key, bypasses RLS). Only for server code that genuinely needs it —
 * e.g. provisioning a user during Telegram sign-in. Never use it to serve data to a user.
 */
export function createSupabaseAdminClient() {
  return createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

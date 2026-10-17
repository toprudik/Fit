import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/env/client";
import { telegramEmail } from "@/lib/auth/sign-in-with-telegram";
import { isTelegramAccount } from "@/lib/auth/telegram-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Runs `work` as the DaFit user behind a Telegram account, with that user's own session, so RLS and the RPCs'
 * auth.uid() checks apply exactly as in the app (a delegate acts within their scope, a stranger gets nothing).
 * The Telegram id comes from the bot, which got it from Telegram's signed webhook; the caller checks the bot's
 * secret first. Only an existing, unblocked account qualifies: a tap never creates one. The session is minted
 * like a sign-in (a one-time magic-link token, never mailed), lives in memory only and is revoked afterwards.
 * Returns null when there is no such account.
 */
export async function asTelegramUser<T>(
  telegramId: number,
  work: (supabase: SupabaseClient<Database>, userId: string) => Promise<T>,
): Promise<T | null> {
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("id, blocked_at").eq("telegram_id", telegramId).maybeSingle();
  if (error) throw new Error(`reading the profile failed: ${error.code}`);
  if (!profile || profile.blocked_at) return null;

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: telegramEmail(telegramId) });
  if (link.error || !link.data.properties?.hashed_token) return null;
  if (link.data.user.id !== profile.id || !isTelegramAccount(link.data.user.app_metadata, telegramId)) return null;

  const supabase = createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const session = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (session.error) throw new Error(`Supabase verifyOtp failed: ${session.error.code ?? session.error.status}`);
  try {
    return await work(supabase, profile.id);
  } finally {
    // Local scope revokes this session only; the user's own sign-ins stay.
    await supabase.auth.signOut({ scope: "local" });
  }
}

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { SignupSource } from "./source";

type Entry = Database["public"]["Enums"]["signup_entry"];

/**
 * Keeps where a new account came from, right after Telegram sign-in made it. The table is closed to users,
 * so this is the one place that writes it, with the secret key. The first source stays: a second call for
 * the same account does nothing. A failure only loses the label, never the sign-in.
 */
export async function recordSignupSource(userId: string, source: SignupSource | null, entry: Entry): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("signup_sources")
    .upsert(
      { user_id: userId, source: source?.source ?? null, campaign: source?.campaign ?? null, entry },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (error) console.error("saving the signup source failed", error.code);
}

import { serverEnv } from "@/env/server";
import type { Tables } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountSync } from "./account-sync";

type ProfileName = Pick<Tables<"profiles">, "first_name" | "last_name" | "username">;

/** "Анна Смирнова" from Telegram's first and last name, else the username, else "" (the avatar shows an icon). */
function displayName(profile: ProfileName | null): string {
  if (!profile) return "";
  const fullName = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return fullName || profile.username?.trim() || "";
}

type AccountData = { name: string; photoUrl: string | null; isTrainer: boolean; isAdmin: boolean; botBlocked: boolean; botUrl: string };

async function readAccount(): Promise<AccountData | null> {
  try {
    const supabase = await createSupabaseServerClient();
    // getClaims() verifies the session JWT; the user id comes from it, never from the client.
    const { data: session } = await supabase.auth.getClaims();
    const userId = session?.claims.sub;
    if (!userId) return null;

    // List the columns: telegram_id and last_seen_at are not granted to signed-in users, so select("*")
    // fails. RLS also shows pair partners' rows and trainers, so the id filters stay.
    // bot_blocked_at is not granted either: bot_messages_blocked reads the caller's own mark.
    const [{ data: profile }, { data: trainer }, { data: admin }, { data: botBlocked }] = await Promise.all([
      supabase.from("profiles").select("first_name, last_name, username, photo_url").eq("id", userId).maybeSingle(),
      supabase.from("trainer_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabase.rpc("bot_messages_blocked"),
    ]);
    return {
      name: displayName(profile),
      photoUrl: profile?.photo_url ?? null,
      isTrainer: trainer !== null,
      isAdmin: admin !== null,
      botBlocked: botBlocked === true,
      botUrl: `https://t.me/${serverEnv().TELEGRAM_BOT_USERNAME}`,
    };
  } catch {
    // Supabase unreachable: the shell works signed out rather than failing the page.
    return null;
  }
}

/**
 * Reads who is signed in for this request and passes it to the client store. The root layout
 * renders it inside <Suspense>: it is the only per-request part of otherwise static pages.
 */
export async function AccountLoader() {
  return <AccountSync account={await readAccount()} />;
}

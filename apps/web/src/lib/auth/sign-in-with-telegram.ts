import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TelegramIdentity } from "@/lib/telegram/identity";
import { isTelegramAccount } from "./telegram-account";

/**
 * Supabase identity for a Telegram user. Telegram has no email, so each user gets a
 * deterministic, non-deliverable address that is never shown or mailed.
 * The real key is app_metadata.telegram_id (not editable by the user).
 */
export const telegramEmail = (telegramId: number) => `tg${telegramId}@users.fit.invalid`;

/**
 * An admin blocked this account (ADM-7): it gets no session, whatever Telegram says. `reason` is what the admin
 * wrote; the blocked person sees it at sign-in (user agreement 15).
 */
export class AccountBlockedError extends Error {
  constructor(readonly reason: string | null) {
    super("account blocked");
    this.name = "AccountBlockedError";
  }
}

/**
 * The admin's block of the account, null when there is none. blocked_at and blocked_reason are never granted
 * to users, so this reads them with the secret key; callers show the reason only to the account itself.
 */
export async function readAccountBlock(userId: string): Promise<{ reason: string | null } | null> {
  const { data, error } = await createSupabaseAdminClient().from("profiles").select("blocked_at, blocked_reason").eq("id", userId).maybeSingle();
  if (error) throw new Error(`reading the block failed: ${error.code}`);
  return data?.blocked_at ? { reason: data.blocked_reason?.trim() || null } : null;
}

/**
 * Turns a server-verified Telegram identity into a Supabase session (cookies on the response).
 * `newAccount` is true when this sign-in created the account.
 * Callers MUST verify the identity first (initData HMAC or OIDC id_token). Throws AccountBlockedError for an
 * account an admin blocked, before any session exists.
 *
 * Flow: ensure auth user exists (admin) → mint a one-time magic-link token (admin, never mailed)
 * → redeem it with the cookie-bound client, which writes the session cookies.
 */
export async function signInWithTelegram(identity: TelegramIdentity): Promise<{ userId: string; newAccount: boolean }> {
  const admin = createSupabaseAdminClient();
  const email = telegramEmail(identity.telegramId);
  const metadata = {
    username: identity.username,
    first_name: identity.firstName,
    last_name: identity.lastName,
    avatar_url: identity.photoUrl,
    language_code: identity.languageCode,
  };

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    // Only our own key: Supabase Auth owns app_metadata.provider and rewrites it on sign-in.
    app_metadata: { telegram_id: identity.telegramId },
    user_metadata: metadata,
  });
  if (created.error && created.error.code !== "email_exists") {
    throw new Error(`Supabase createUser failed: ${created.error.code ?? created.error.status}`);
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) {
    throw new Error(`Supabase generateLink failed: ${link.error?.code ?? "no token"}`);
  }
  const userId = link.data.user.id;

  // The account behind this email must be OUR Telegram account for this user. Guards against anyone
  // pre-registering tg<id>@… through another path (public sign-ups must also be disabled in Supabase).
  if (!isTelegramAccount(link.data.user.app_metadata, identity.telegramId)) {
    throw new Error("Supabase user does not belong to this Telegram account");
  }
  const block = await readAccountBlock(userId);
  if (block) throw new AccountBlockedError(block.reason);

  // Keep profile fresh on every sign-in (names/photo change in Telegram). The first insert also creates
  // the user_settings row (database trigger profiles_create_settings), so nothing else is written here.
  const updated = await admin.auth.admin.updateUserById(userId, { user_metadata: metadata });
  if (updated.error) throw new Error(`Supabase updateUser failed: ${updated.error.code ?? updated.error.status}`);
  const profile = await admin.from("profiles").upsert(
    {
      id: userId,
      telegram_id: identity.telegramId,
      username: identity.username,
      first_name: identity.firstName,
      last_name: identity.lastName,
      photo_url: identity.photoUrl,
      language_code: identity.languageCode,
      last_seen_at: new Date().toISOString(),
      // Telegram refused a message earlier; signing in is the sign of life that makes the dispatcher try again.
      bot_blocked_at: null,
    },
    { onConflict: "id" },
  );
  if (profile.error) throw new Error(`profile upsert failed: ${profile.error.code}`);

  const supabase = await createSupabaseServerClient();
  const session = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (session.error) throw new Error(`Supabase verifyOtp failed: ${session.error.code ?? session.error.status}`);

  // createUser succeeds only for an email it hasn't seen: this sign-in created the account.
  return { userId, newAccount: !created.error };
}

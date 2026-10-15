/**
 * Whether a Supabase user is the account of this Telegram user. The key is app_metadata.telegram_id:
 * only the server (secret key) can write app_metadata. app_metadata.provider is not used: Supabase Auth
 * owns it and rewrites it to "email" when the magic-link token is redeemed, so it says nothing about
 * the account after the first sign-in.
 */
export function isTelegramAccount(appMetadata: Record<string, unknown> | undefined, telegramId: number): boolean {
  return appMetadata?.telegram_id === telegramId;
}

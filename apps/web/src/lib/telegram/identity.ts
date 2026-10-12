/** A Telegram user whose identity has been cryptographically verified by the server. */
export type TelegramIdentity = {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  languageCode: string | null;
  /** How the identity was proven. */
  source: "mini-app" | "oidc";
};

/** Numeric bot id is the part of the bot token before the colon. */
export function botIdFromToken(botToken: string): string {
  const id = botToken.split(":")[0];
  if (!/^\d+$/.test(id ?? "")) throw new Error("Malformed bot token");
  return id;
}

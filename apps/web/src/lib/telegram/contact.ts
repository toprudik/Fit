import { requestContactComplete } from "@tma.js/sdk-react";
import { safely, safelyAsync } from "./mini-app";

/**
 * Asks Telegram to share the user's phone number with the bot (Mini App requestContact) and returns
 * Telegram's signed answer as it came, for the server to check. Null outside Telegram, in clients too
 * old for the method, or when the user said no.
 */
export async function askTelegramContact(): Promise<string | null> {
  if (!safely(() => requestContactComplete.isAvailable())) return null;
  const answer = await safelyAsync(() => requestContactComplete());
  return answer?.raw ?? null;
}

import { requestWriteAccess } from "@tma.js/sdk-react";
import { safely, safelyAsync } from "./mini-app";

/**
 * Asks Telegram to let the bot write to the user (Mini App requestWriteAccess, PRD wave-1 §2.1 rule 6).
 * Telegram answers "allowed" at once when the bot can already write. Null outside Telegram, in clients
 * too old for the method, or when the request failed: then nothing is known.
 */
export async function askWriteAccess(): Promise<"allowed" | "denied" | null> {
  if (!safely(() => requestWriteAccess.isAvailable())) return null;
  const status = await safelyAsync(() => requestWriteAccess());
  if (status === undefined) return null;
  return status === "allowed" ? "allowed" : "denied";
}

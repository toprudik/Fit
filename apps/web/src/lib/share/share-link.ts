import { shareMessage, shareURL } from "@tma.js/sdk-react";
import { safely } from "@/lib/telegram/mini-app";
import { prepareShareMessage } from "./actions";

/**
 * "Поделиться" of an invitation (marketing backlog 11). In the Mini App it sends a prepared message, a card with a
 * picture and an "Открыть" button, through Telegram's chat picker; where that is not available (older Telegram,
 * a link the server does not prepare) it falls back to the plain shareURL. Outside Telegram it returns false and
 * the caller uses the system share sheet.
 */
export async function shareInTelegram(link: string, text: string): Promise<boolean> {
  if (safely(() => shareMessage.isAvailable())) {
    const id = await prepareShareMessage(link, text).catch(() => null);
    if (id) {
      try {
        await shareMessage(id);
      } catch {
        // Closing the picker rejects too; nothing to tell the user.
      }
      return true;
    }
  }
  if (safely(() => shareURL.isAvailable())) {
    safely(() => shareURL(link, text));
    return true;
  }
  return false;
}

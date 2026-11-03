import { showcaseTelegram } from "@/lib/showcase/link";

/** The link on a story (Telegram's widget_link, 0–48 characters of name): Telegram posts it for Premium users only. */
export type StoryLink = { url: string; name: string };

/**
 * Where a story card leads, the same place its picture names: the trainer's showcase when the card carries its QR,
 * DaFit's bot otherwise.
 */
export function storyLink(slug: string | null | undefined, botUsername: string, names: { showcase: string; app: string }): StoryLink {
  return slug
    ? { url: showcaseTelegram(slug, botUsername), name: names.showcase.slice(0, 48) }
    : { url: `https://t.me/${botUsername}`, name: names.app.slice(0, 48) };
}

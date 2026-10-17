import type { Goal } from "@/lib/nutrition/target";

/** Templates offered when a trainer creates a group (PRD wave-2 §6 rule 3); the name can be changed later. */
export const GROUP_PRESETS = ["lose", "gain", "maintain"] as const satisfies readonly Goal[];

/** Colours a group can take; the first is the default. */
export const GROUP_COLORS = ["#2F6BFF", "#16A34A", "#F59E0B", "#DC2626", "#9333EA", "#0EA5E9"] as const;

export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 500;
export const BROADCAST_MAX = 2000;
/** Broadcasts a trainer may send a local day (§6.9, assumption). */
export const BROADCASTS_PER_DAY = 5;

export const isGroupColor = (value: unknown): value is (typeof GROUP_COLORS)[number] =>
  (GROUP_COLORS as readonly unknown[]).includes(value);

/** A link button takes an https address without spaces, as the database checks it. */
export function isButtonUrl(value: string): boolean {
  if (value.length > 500 || /\s/.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export type BroadcastButton = { kind: "none" } | { kind: "deep_link" } | { kind: "url"; url: string };

/** What the composer sends, or the field that is wrong. */
export function parseBroadcast(body: string, button: BroadcastButton): { body: string; button: BroadcastButton } | { error: "body" | "url" } {
  const text = body.trim();
  if (text.length < 1 || text.length > BROADCAST_MAX) return { error: "body" };
  if (button.kind === "url" && !isButtonUrl(button.url.trim())) return { error: "url" };
  return { body: text, button: button.kind === "url" ? { kind: "url", url: button.url.trim() } : button };
}

import { INVITE_START_PREFIX, redeemPath } from "@/lib/trainer-invites/code";

/** Telegram allows [A-Za-z0-9_-], at most 512 characters (screens.md §1.7). */
const START_PARAM = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * The screen a Mini App launch with `startapp=<param>` opens (screens.md §1.7), or null to stay on
 * the screen the launch URL opened. Only keys whose screens exist are listed; the rest arrive with
 * their features. Nothing from the parameter is trusted here: the screen checks it on the server.
 */
export function startParamPath(param: string | null | undefined): string | null {
  if (!param || !START_PARAM.test(param)) return null;
  if (param.startsWith(INVITE_START_PREFIX)) return redeemPath(param.slice(INVITE_START_PREFIX.length));
  return null;
}

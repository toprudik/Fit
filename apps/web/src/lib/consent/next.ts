import "server-only";
import { clientEnv } from "@/env/client";
import { safeNext } from "@/lib/auth/oidc-cookie";
import { CONSENT_PATH, PREFERENCES_PATH } from "./beta-terms";

/**
 * The screen to open once onboarding is done: `next` from the URL or the form when it is a page of this
 * app (safeNext), never an onboarding step itself, so the steps can't send each other round in a loop.
 */
export function onboardingNext(value: unknown): string {
  const next = safeNext(typeof value === "string" ? value : null, clientEnv.NEXT_PUBLIC_APP_URL);
  const pathname = next.split(/[?#]/, 1)[0];
  return pathname === CONSENT_PATH || pathname === PREFERENCES_PATH ? "/" : next;
}

/** A path with `next` attached, for the next onboarding step or the login screen. */
export const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(next)}`;

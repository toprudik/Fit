import { CONSENT_PATH } from "@/lib/consent/beta-terms";

/**
 * Account deletion (PRD wave-1 §2.12-7, PRIV-7; data-model §1.6). For 30 days after the request the user may
 * sign in, but the app shows only the deletion screen, where they cancel it, and the export screen. The mark
 * comes with the session token (app_metadata.deletion_pending, written by request_account_deletion), so the
 * proxy needs no query for it.
 */

export const DELETION_PATH = "/settings/delete";
export const EXPORT_PATH = "/settings/export";

/** How long the account stays after the request. */
export const DELETION_DAYS = 30;

/**
 * Screens open during the 30 days: the deletion screen, the export and the login screen, and the beta terms,
 * which come before any screen and would otherwise bounce back and forth with the deletion screen.
 */
const WHILE_DELETING: readonly string[] = [DELETION_PATH, EXPORT_PATH, "/login", CONSENT_PATH];

/** Whether the verified JWT claims carry the deletion mark. */
export function isDeletionPending(claims: { app_metadata?: unknown } | null | undefined): boolean {
  const meta = claims?.app_metadata;
  return typeof meta === "object" && meta !== null && (meta as Record<string, unknown>).deletion_pending === true;
}

/** Where the proxy sends a user whose account is being deleted: the deletion screen. Null for the open screens. */
export function deletionRedirect(pathname: string): string | null {
  return WHILE_DELETING.includes(pathname) ? null : DELETION_PATH;
}

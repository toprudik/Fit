import "server-only";

/**
 * The admin's reason for a block (ADM-7), carried from the OIDC callback to /login, where the blocked person
 * reads it (user agreement 15, terms 22.2). The callback has no session to show it with, and the reason must
 * not go into the URL, where it would end up in history and logs. httpOnly and short-lived; Lax like the OIDC
 * cookie, because both are only used by the website as a top-level page.
 */
export const BLOCKED_COOKIE = "fit_blocked";

export const blockedCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/login",
  maxAge: 600,
};

/** `-` when the admin left no reason; otherwise the reason as base64url, so any text fits a cookie value. */
export function blockedCookieValue(reason: string | null): string {
  return reason ? Buffer.from(reason, "utf8").toString("base64url") : "-";
}

/** The reason back from the cookie: undefined without the cookie, null when there was no reason. */
export function parseBlockedCookie(raw: string | undefined): string | null | undefined {
  if (!raw) return undefined;
  if (raw === "-") return null;
  const reason = Buffer.from(raw, "base64url").toString("utf8").trim();
  return reason ? reason.slice(0, 500) : null;
}

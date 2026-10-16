import { negotiateLocale, type Locale } from "@/i18n/config";
import { CONSENT_PATH } from "@/lib/consent/beta-terms";
import { DEFAULT_ZONE, isZone, zoneFromPath, type Zone } from "./zones";

export type RouteInput = {
  pathname: string;
  search: string;
  /** Saved language (LOCALE_COOKIE). */
  localeCookie: string | null | undefined;
  /** Last opened zone (ZONE_COOKIE). */
  zoneCookie: string | null | undefined;
  acceptLanguage: string | null | undefined;
  /**
   * A browser page load (Sec-Fetch-Dest: document, or iframe in Telegram Web). Only those remember the zone: router
   * prefetches must not, and Next strips its own prefetch headers before the proxy sees them.
   * In-app navigations between zones are remembered by the shell in the browser.
   */
  isDocument: boolean;
};

export type RouteDecision =
  | { kind: "pass" }
  | { kind: "redirect"; location: string }
  /** Serve /<locale><pathname>; rememberZone is set when the visit switches the last zone. */
  | { kind: "rewrite"; pathname: string; locale: Locale; rememberZone: Zone | null };

/** Files in apps/web/public. Any other path is a page, so a mistyped URL still gets the app's 404. */
export const PUBLIC_FILES: readonly string[] = ["/favicon.ico", "/icon.svg", "/apple-icon.png", "/robots.txt"];

/** Route handlers, framework internals and public files are not pages: no locale rewrite for them. */
function isPagePath(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname.startsWith("/_next/") || pathname.startsWith("/__")) {
    return false;
  }
  return !PUBLIC_FILES.includes(pathname);
}

/**
 * Pure routing rules behind src/proxy.ts. Page URLs carry no locale (screens.md routes and bot deep
 * links stay as they are); the proxy rewrites them to /<locale>/… so the root layout gets `lang`.
 */
export function routeRequest(input: RouteInput): RouteDecision {
  const { pathname } = input;
  if (!isPagePath(pathname)) return { kind: "pass" };

  if (pathname === "/") {
    const zone = isZone(input.zoneCookie) ? input.zoneCookie : DEFAULT_ZONE;
    return { kind: "redirect", location: `/${zone}${input.search}` };
  }

  const locale = negotiateLocale({ saved: input.localeCookie, acceptLanguage: input.acceptLanguage });
  const zone = zoneFromPath(pathname);
  const rememberZone = zone && input.isDocument && zone !== input.zoneCookie ? zone : null;
  return { kind: "rewrite", pathname: `/${locale}${pathname}`, locale, rememberZone };
}

/** The admin section (screens.md §2.4): only admins get its pages; everyone else gets the 404 (ADM-12). */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Where the proxy sends a non-admin who opens the admin section: an unknown page, so the app's 404. */
export function adminDeniedPath(locale: Locale): string {
  return `/${locale}/admin-not-found`;
}

/** Screens a signed-in user opens before accepting the beta terms: the terms themselves and the login screen. */
const BEFORE_CONSENT: readonly string[] = [CONSENT_PATH, "/login"];

/**
 * Where the proxy sends a signed-in user who has not accepted the beta terms in force (PRD wave-1 §2.1
 * rule 3, AUTH-4): the terms screen, with the screen they asked for in `next`, so a link's parameter
 * survives the acceptance (rule 5). Null for the screens open before it.
 */
export function consentRedirect(pathname: string, search: string): string | null {
  if (BEFORE_CONSENT.includes(pathname)) return null;
  return `${CONSENT_PATH}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

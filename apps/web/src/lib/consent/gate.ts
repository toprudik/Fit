/**
 * API routes a signed-in user reaches only with the required consents in force: the proxy answers 403 before the
 * route runs. Pages and their Server Actions go to the consents screen instead (consentRedirect). Theme and
 * language stay open, since the consents screen itself may save them; machine callers have no user session.
 */
export function isConsentGatedApi(pathname: string): boolean {
  return pathname.startsWith("/api/") && pathname !== "/api/settings/preferences";
}

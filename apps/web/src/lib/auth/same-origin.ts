import "server-only";
import { clientEnv } from "@/env/client";

/**
 * CSRF guard for state-changing endpoints (sign-in, sign-out): the request must come from our own origin.
 * Browsers always send Origin on POST; Sec-Fetch-Site is a second signal when present.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(clientEnv.NEXT_PUBLIC_APP_URL).origin;
}

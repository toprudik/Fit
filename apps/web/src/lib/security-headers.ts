/**
 * Response headers on every route (next.config.ts). The CSP stays without script-src: Cache Components prerender
 * pages, so there is no per-request nonce for Next's inline scripts and the theme pre-paint script, and a hash list
 * would break on every Next.js update. What it does pin costs nothing and closes the usual injection follow-ups:
 * no plugins (object-src), no <base> pointing scripts elsewhere (base-uri), forms post only to us (form-action:
 * Server Actions and /auth/sign-out), and only Telegram may frame the app (frame-ancestors, ADR 0004).
 */
export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  // Production is https only (ADR 0002). Browsers ignore HSTS over plain http, so `next dev` is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // The barcode scanner opens the camera on our own pages (components/nutrition/barcode-scanner.tsx); nothing
  // else may, and nobody uses the microphone or the browser's location.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
] as const;

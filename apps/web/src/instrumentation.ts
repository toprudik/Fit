import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast at server boot if secrets are missing or malformed.
    const { serverEnv } = await import("@/env/server");
    serverEnv();
  }
  // Error reporting (ADR 0017), on only with a DSN.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn && (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge")) {
    const [Sentry, { sentryOptions }] = await Promise.all([
      import("@sentry/nextjs"),
      import("@/lib/monitoring/sentry"),
    ]);
    Sentry.init(sentryOptions(dsn));
  }
}

/** Errors of Server Components, route handlers, actions and the proxy; a no-op until Sentry is initialised. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};

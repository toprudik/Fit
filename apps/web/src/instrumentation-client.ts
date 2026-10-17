// Error reporting in the browser and the Mini App (ADR 0017), on only with a DSN. Loaded lazily, so a build
// without one ships no Sentry code to run.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/monitoring/sentry")]).then(([Sentry, { sentryOptions }]) =>
    Sentry.init(sentryOptions(dsn)),
  );
}

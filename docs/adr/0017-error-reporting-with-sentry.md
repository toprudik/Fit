# 17. Error reporting with Sentry, off by default and without personal data

- Status: accepted
- Date: 2026-10-17

## Context

The plan for week 5 asks for error monitoring before the beta: today a server error shows up only in Vercel's logs, and a crash in the browser or the Mini App isn't recorded anywhere. DaFit holds clients' health, body and food records, and the repository is public, so the reporting must not carry personal data and must not need a secret in the repository.

## Decision

- The web app reports errors to Sentry with `@sentry/nextjs`, pinned to an exact version.
- Reporting is on only when `NEXT_PUBLIC_SENTRY_DSN` is set for the environment. Without it nothing loads in the browser and nothing is sent from the server. `.env.example` lists the name with an empty value. A DSN is not a secret: it only lets a client send events to that project, so it is a public variable.
- `instrumentation.ts` starts Sentry on the server (Node.js and edge) and exports `onRequestError`, so errors of Server Components, route handlers, server actions and the proxy are reported. `instrumentation-client.ts` loads the SDK lazily in the browser.
- Only errors are sent: no performance tracing (`tracesSampleRate: 0`), no session replay, no breadcrumbs.
- `lib/monitoring/sentry.ts` strips every event before it leaves: `sendDefaultPii: false`, no user, no request body, cookies, headers or query string, no `extra`. In the route, uuids, numbers and long tokens are replaced with `:id`, so `/api/calendar/<token>.ics` becomes `/api/calendar/:id.ics`.
- Source maps are not uploaded for now (`withSentryConfig` and an auth token are not used), so stacks of client errors point into minified code. Uploading them is a later step that needs a server-only `SENTRY_AUTH_TOKEN`.

## Consequences

- An owner creates a Sentry project and sets the DSN in Vercel for Production (and Preview if wanted); until then the app behaves exactly as before.
- An exception's own message still goes to Sentry. Code must not put personal data into error messages, and the Sentry project should keep its server-side data scrubbing on.
- The free Sentry plan's monthly event quota is enough for the beta; with tracing off, only errors count.

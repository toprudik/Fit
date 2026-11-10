import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Error reporting to Sentry (ADR 0017). Off unless NEXT_PUBLIC_SENTRY_DSN is set. DaFit holds clients' health and
 * food records, so an event carries the error, its stack and the route only: no user, no request body, cookies,
 * headers or query, no breadcrumbs, and ids or tokens in the path are masked.
 */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
  };
}

/** Path segments that can identify a person or open their data: uuids, numbers, long tokens. */
const SECRET_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i;

/** The path of a URL with identifying segments replaced by ":id", without origin, query or fragment. */
export function scrubUrl(url: string): string {
  try {
    return maskPath(new URL(url, "http://localhost").pathname);
  } catch {
    return "";
  }
}

/** Masks identifying segments of a route as it is, such as a transaction name "GET /client/trainers/<id>". */
function maskPath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      // A file extension stays, the name before it is checked: calendar feeds are /api/calendar/<token>.ics.
      const [, name, extension = ""] = /^(.*?)(\.[a-z0-9]{1,5})?$/i.exec(segment) ?? [];
      return name && SECRET_SEGMENT.test(name) ? `:id${extension}` : segment;
    })
    .join("/");
}

/**
 * A promise rejected with a bare `{ code, message }` object and caught by nobody. DaFit's code and its libraries
 * reject only with Error objects; this shape is what wallet extensions (MetaMask, TronLink and the like) reject with
 * inside every page they inject into (EIP-1193 provider errors, such as code 4001 "User rejected the request").
 * It has no stack, so Sentry can't tell it apart by file, and an alert about it says nothing about DaFit.
 */
export function isForeignRejection(reason: unknown): boolean {
  if (typeof reason !== "object" || reason === null || reason instanceof Error) return false;
  const proto: unknown = Object.getPrototypeOf(reason);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(reason);
  const { code, message } = reason as { code?: unknown; message?: unknown };
  return (
    keys.every((key) => key === "code" || key === "message" || key === "data" || key === "stack") &&
    (typeof code === "number" || typeof code === "string") &&
    typeof message === "string"
  );
}

export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  if (isForeignRejection(hint?.originalException)) return null;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.contexts) delete event.contexts.state;
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? scrubUrl(event.request.url) : undefined,
    };
  }
  if (event.transaction) event.transaction = maskPath(event.transaction.split(/[?#]/)[0]);
  return event;
}

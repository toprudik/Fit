import { TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/i18n/dictionaries";

/**
 * What an error boundary shows (PRD wave-1 §2.13 rule 1): try the screen again, or tell the team through
 * "Обратная связь". The feedback link is a plain one: after a crash a full page load is the safer way out.
 */
export function ErrorScreen({ t, onRetry, feedbackHref }: { t: Dictionary["errorPage"]; onRetry: () => void; feedbackHref: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      <EmptyState
        icon={TriangleAlert}
        title={t.title}
        description={t.text}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button onClick={onRetry}>{t.retry}</Button>
            <Button variant="ghost" asChild>
              <a href={feedbackHref}>{t.feedback}</a>
            </Button>
          </div>
        }
      />
    </main>
  );
}

/** "/feedback?from=<this screen>"; plain "/feedback" for the screen itself and when there is none. */
export function feedbackHrefFor(pathname: string): string {
  return pathname && pathname !== "/feedback" ? `/feedback?from=${encodeURIComponent(pathname)}` : "/feedback";
}

const noSubscription = () => () => {};

/** The feedback link for the screen that failed. Hydrates as plain "/feedback": the pathname must not shape the first render (ADR 0015). */
export function useFeedbackHref(): string {
  const pathname = useSyncExternalStore(noSubscription, () => window.location.pathname, () => "");
  return feedbackHrefFor(pathname);
}

/** A value the browser knows and the server does not, read the same way. */
export function useClientValue<T>(read: () => T, fallback: T): T {
  return useSyncExternalStore(noSubscription, read, () => fallback);
}

/** Sends the error to Sentry when it is on; the boundary keeps it from the global handlers. */
export function reportError(error: Error) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}

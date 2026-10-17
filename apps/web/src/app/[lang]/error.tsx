"use client";

import { useEffect } from "react";
import { ErrorScreen, reportError, useFeedbackHref } from "@/components/errors/error-screen";
import { useI18n } from "@/i18n/client";

/**
 * A screen that crashed (PRD wave-1 §2.13 rule 1). Replaces everything under the root layout, the zone shell
 * included, so the way out never depends on the part that failed.
 */
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useI18n();
  const feedbackHref = useFeedbackHref();

  useEffect(() => reportError(error), [error]);

  return (
    <>
      <title>{`${t.errorPage.title} | ${t.meta.appName}`}</title>
      <ErrorScreen t={t.errorPage} onRetry={retry} feedbackHref={feedbackHref} />
    </>
  );
}

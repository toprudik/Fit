import { Suspense } from "react";
import { HealthConsentScreen } from "@/components/consent/health-consent-gate";
import { getDictionary } from "@/i18n/server";

/** Steps and sleep: these screens open only with the health data consent (право 3). */
export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <HealthConsentScreen next="/client/diary/activity" title={t.activity.title} backHref="/client/diary">
      {children}
    </HealthConsentScreen>
  );
}

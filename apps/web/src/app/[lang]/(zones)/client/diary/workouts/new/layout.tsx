import { Suspense } from "react";
import { HealthConsentScreen } from "@/components/consent/health-consent-gate";
import { getDictionary } from "@/i18n/server";

/** The client's own workouts: these screens open only with the health data consent (право 3). */
export default function NewWorkoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <HealthConsentScreen next="/client/diary/workouts/new" title={t.workouts.editor.newTitle} backHref="/client/diary">
      {children}
    </HealthConsentScreen>
  );
}

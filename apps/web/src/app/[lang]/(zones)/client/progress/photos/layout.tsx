import { Suspense } from "react";
import { HealthConsentScreen } from "@/components/consent/health-consent-gate";
import { getDictionary } from "@/i18n/server";

/** Health data: these screens open only with the health data consent (право 3). */
export default function PhotosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <HealthConsentScreen next="/client/progress/photos" title={t.progress.photos.title} backHref="/client/progress">
      {children}
    </HealthConsentScreen>
  );
}

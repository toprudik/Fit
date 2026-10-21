import { Suspense } from "react";
import { HealthConsentScreen } from "@/components/consent/health-consent-gate";
import { getDictionary } from "@/i18n/server";
import { clientIntakePath, clientPairPath } from "@/lib/intake/paths";

/** The intake has health answers (PAR-Q): it opens only with the health data consent (право 3). */
export default function IntakeLayout(props: LayoutProps<"/[lang]/client/trainers/[coachingId]/intake">) {
  return (
    <Suspense fallback={null}>
      <Gate coachingId={props.params.then((p) => p.coachingId)}>{props.children}</Gate>
    </Suspense>
  );
}

async function Gate({ coachingId, children }: { coachingId: Promise<string>; children: React.ReactNode }) {
  const [t, id] = await Promise.all([getDictionary(), coachingId]);
  return (
    <HealthConsentScreen next={clientIntakePath(id)} title={t.intake.form.title} backHref={clientPairPath(id)}>
      {children}
    </HealthConsentScreen>
  );
}

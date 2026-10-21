import { Suspense } from "react";
import { HealthConsentScreen } from "@/components/consent/health-consent-gate";
import { getDictionary } from "@/i18n/server";

/** The client's own workouts: a log and its editor open only with the health data consent (право 3). */
export default function WorkoutLogLayout(props: LayoutProps<"/[lang]/client/diary/workouts/[logId]">) {
  return (
    <Suspense fallback={null}>
      <Gate logId={props.params.then((p) => p.logId)}>{props.children}</Gate>
    </Suspense>
  );
}

async function Gate({ logId, children }: { logId: Promise<string>; children: React.ReactNode }) {
  const [t, id] = await Promise.all([getDictionary(), logId]);
  return (
    <HealthConsentScreen
      next={`/client/diary/workouts/${encodeURIComponent(id)}`}
      title={t.workouts.logs.untitled}
      backHref="/client/diary"
    >
      {children}
    </HealthConsentScreen>
  );
}

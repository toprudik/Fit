import type { Metadata } from "next";
import { CalendarX } from "lucide-react";
import { Suspense } from "react";
import { SubstituteIntake } from "@/components/intake/substitute-intake";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadSubstituteParticipant } from "@/lib/workouts/substitute";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.intake.trainer.title };
}

async function Intake({ params }: { params: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]/intake">["params"] }) {
  const [t, { sessionId, bookingId }] = await Promise.all([getDictionary(), params]);
  const participant = await loadSubstituteParticipant(sessionId, bookingId);
  if (!participant) return <EmptyState icon={CalendarX} title={t.team.session.notFound} description={t.team.session.notFoundText} />;
  return <SubstituteIntake clientId={participant.clientId} timeZone={participant.timeZone} />;
}

/** The intake of a participant, for the substitute while the session lasts (PRD wave-3 §1 "Подмена" rule 4). */
export default async function SubstituteIntakePage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]/intake">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.intake.trainer.title} back={{ fallbackHref: "/trainer/team" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <Intake params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}

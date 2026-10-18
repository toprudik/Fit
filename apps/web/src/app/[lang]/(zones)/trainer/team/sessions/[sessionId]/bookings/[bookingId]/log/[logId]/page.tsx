import type { Metadata } from "next";
import { LogDetailPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.logs.untitled };
}

/** A log of the session the substitute runs (PRD wave-3 §1 "Подмена" rule 4). */
export default async function SubstituteLogPage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]/log/[logId]">) {
  const { sessionId, bookingId } = await props.params;
  return <LogDetailPage place={{ side: "substitute", sessionId, bookingId }} logId={props.params.then((p) => p.logId)} />;
}

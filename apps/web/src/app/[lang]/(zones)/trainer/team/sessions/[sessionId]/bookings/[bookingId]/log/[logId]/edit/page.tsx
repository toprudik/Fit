import type { Metadata } from "next";
import { EditLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.editTitle };
}

/** The substitute edits the log it wrote, until the session ends (PRD wave-3 §1 "Подмена" rule 4). */
export default async function SubstituteEditLogPage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]/log/[logId]/edit">) {
  const { sessionId, bookingId } = await props.params;
  return <EditLogPage place={{ side: "substitute", sessionId, bookingId }} logId={props.params.then((p) => p.logId)} />;
}

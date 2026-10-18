import type { Metadata } from "next";
import { NewLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.newTitle };
}

/** The substitute logs the session it runs for one participant (PRD wave-3 §1 "Подмена" rule 4). */
export default async function SubstituteNewLogPage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]/log/new">) {
  const { sessionId, bookingId } = await props.params;
  return <NewLogPage place={{ side: "substitute", sessionId, bookingId }} booking={Promise.resolve(bookingId)} />;
}

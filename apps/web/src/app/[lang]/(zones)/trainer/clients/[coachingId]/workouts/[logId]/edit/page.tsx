import type { Metadata } from "next";
import { EditLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.editTitle };
}

/** The trainer edits a log they wrote, while the pair is live (PRD wave-1 §2.10-10). */
export default async function TrainerEditLogPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts/[logId]/edit">) {
  const { coachingId } = await props.params;
  return <EditLogPage place={{ side: "trainer", coachingId }} logId={props.params.then((p) => p.logId)} />;
}

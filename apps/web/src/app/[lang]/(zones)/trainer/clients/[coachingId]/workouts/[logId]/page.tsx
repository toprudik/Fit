import type { Metadata } from "next";
import { LogDetailPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.logs.untitled };
}

/** One log of the client, as the trainer sees it (PRD wave-1 §2.10-4, WORK-4). */
export default async function TrainerLogPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts/[logId]">) {
  const { coachingId } = await props.params;
  return <LogDetailPage place={{ side: "trainer", coachingId }} logId={props.params.then((p) => p.logId)} />;
}

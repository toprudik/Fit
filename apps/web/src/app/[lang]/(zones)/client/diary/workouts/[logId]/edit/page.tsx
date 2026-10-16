import type { Metadata } from "next";
import { EditLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.editTitle };
}

/** The client edits a log they wrote; a trainer's log stays as the trainer wrote it (PRD wave-1 §2.10-10). */
export default function ClientEditLogPage(props: PageProps<"/[lang]/client/diary/workouts/[logId]/edit">) {
  return <EditLogPage place={{ side: "client" }} logId={props.params.then((p) => p.logId)} />;
}

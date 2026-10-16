import type { Metadata } from "next";
import { LogDetailPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.logs.untitled };
}

/** One log in the client's diary, with records marked (PRD wave-1 §2.10-4, WORK-4). */
export default function ClientLogPage(props: PageProps<"/[lang]/client/diary/workouts/[logId]">) {
  return <LogDetailPage place={{ side: "client" }} logId={props.params.then((p) => p.logId)} />;
}

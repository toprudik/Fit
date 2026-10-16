import type { Metadata } from "next";
import { NewLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.newTitle };
}

/** The client writes a workout of their own (PRD wave-1 §2.10-4). */
export default function ClientNewLogPage() {
  return <NewLogPage place={{ side: "client" }} booking={Promise.resolve(undefined)} />;
}

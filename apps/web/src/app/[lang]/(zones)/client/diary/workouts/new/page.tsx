import type { Metadata } from "next";
import { NewLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.newTitle };
}

/** The client writes a workout of their own (PRD wave-1 §2.10-4), or the sets of a homework (wave-2 §10.2). */
export default function ClientNewLogPage({ searchParams }: PageProps<"/[lang]/client/diary/workouts/new">) {
  const homework = searchParams.then((params) => (typeof params.homework === "string" ? params.homework : undefined));
  return <NewLogPage place={{ side: "client" }} booking={Promise.resolve(undefined)} homework={homework} />;
}

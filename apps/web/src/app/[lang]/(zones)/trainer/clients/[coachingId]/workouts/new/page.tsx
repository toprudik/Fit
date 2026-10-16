import type { Metadata } from "next";
import { NewLogPage } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.editor.newTitle };
}

/** The trainer writes a log for the client; "?booking=" ties it to a session of the pair (PRD wave-1 §2.10-4). */
export default async function TrainerNewLogPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts/new">) {
  const { coachingId } = await props.params;
  const booking = props.searchParams.then((search) => (typeof search.booking === "string" ? search.booking : undefined));
  return <NewLogPage place={{ side: "trainer", coachingId }} booking={booking} />;
}

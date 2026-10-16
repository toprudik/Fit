import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// The shell reads the route segments (AppShell), and a pair id is known only at request time, so the
// page renders on request instead of from a prerendered shell.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.tabs.notes };
}

/** Client card, "Заметки": the trainer's notes, hidden from the client unless shown (PAIR-2). */
export default function TrainerPairNotesPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/notes">) {
  return <TrainerPairPage params={props.params} tab="notes" />;
}

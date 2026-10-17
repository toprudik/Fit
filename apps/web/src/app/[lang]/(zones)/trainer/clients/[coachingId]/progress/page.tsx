import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time (see the notes tab).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.progress.tab };
}

/** Client card, "Прогресс": the client's measurements while shared, and the pair's milestones (PRD wave-1 §2.11). */
export default function TrainerPairProgressPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/progress">) {
  return <TrainerPairPage params={props.params} tab="progress" />;
}

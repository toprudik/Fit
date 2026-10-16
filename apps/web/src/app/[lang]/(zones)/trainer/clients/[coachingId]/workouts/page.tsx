import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time (see the notes tab).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.tabs.workouts };
}

/** Client card, "Тренировки": the client's workout logs the trainer can see (PRD wave-1 §2.10-4, 2.10-10). */
export default function TrainerPairWorkoutsPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts">) {
  return <TrainerPairPage params={props.params} tab="workouts" />;
}

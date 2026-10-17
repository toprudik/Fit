import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time (see the notes tab).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.nutrition.tab };
}

/** Client card, "Питание": the client's goal and the trainer's target while nutrition is shared (wave-2 §1–2). */
export default function TrainerPairNutritionPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/nutrition">) {
  return <TrainerPairPage params={props.params} tab="nutrition" />;
}

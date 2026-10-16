import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time, as on the other sections of the card.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.tabs.passes };
}

/** Client card, "Абонементы": passes, freezes and history; selling, extending and cancelling (PRD 2.8). */
export default function TrainerPairPassesPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/passes">) {
  return <TrainerPairPage params={props.params} tab="passes" />;
}

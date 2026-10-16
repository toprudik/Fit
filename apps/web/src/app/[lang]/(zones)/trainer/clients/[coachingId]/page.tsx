import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// The shell reads the route segments (AppShell), and a pair id is known only at request time, so the
// page renders on request instead of from a prerendered shell.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.clients };
}

/** Client card, "Обзор" (screens.md "Карточка пары: Обзор"). */
export default function TrainerPairOverviewPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]">) {
  return <TrainerPairPage params={props.params} tab="overview" />;
}

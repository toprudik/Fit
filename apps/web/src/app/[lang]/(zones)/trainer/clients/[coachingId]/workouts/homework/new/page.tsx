import type { Metadata } from "next";
import { NewHomeworkPage } from "@/components/homework/homework-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.homework.newTitle };
}

/** "Задать домашку" for the pair's client (PRD wave-2 §10-1). */
export default function TrainerNewHomeworkPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts/homework/new">) {
  return <NewHomeworkPage coachingId={props.params.then((params) => params.coachingId)} />;
}

import type { Metadata } from "next";
import { HomeworkDetailPage } from "@/components/homework/homework-screens";
import { getDictionary } from "@/i18n/server";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.homework.editTitle };
}

/** One homework of the pair: its deadlines, the client's marks, editing and "В архив" (PRD wave-2 §10). */
export default function TrainerHomeworkPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/workouts/homework/[homeworkId]">) {
  return (
    <HomeworkDetailPage
      coachingId={props.params.then((params) => params.coachingId)}
      homeworkId={props.params.then((params) => params.homeworkId)}
    />
  );
}

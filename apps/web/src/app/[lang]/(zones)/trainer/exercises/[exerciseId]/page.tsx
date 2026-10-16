import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ExerciseCard } from "@/components/workouts/exercise-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadExercise } from "@/lib/workouts/load";

// An exercise id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.library.title };
}

async function ExerciseContent({ params }: { params: PageProps<"/[lang]/trainer/exercises/[exerciseId]">["params"] }) {
  const [{ exerciseId }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const exercise = await loadExercise(exerciseId, locale);
  if (!exercise) {
    return (
      <Screen header={<ScreenHeader title={t.workouts.library.title} back={{ fallbackHref: "/trainer/exercises" }} />}>
        <EmptyState icon={Dumbbell} title={t.workouts.card.notFoundTitle} description={t.workouts.card.notFoundText} />
      </Screen>
    );
  }
  return (
    <Screen header={<ScreenHeader title={exercise.name} back={{ fallbackHref: "/trainer/exercises" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <ExerciseCard t={t} exercise={exercise} />
      </div>
    </Screen>
  );
}

/** The card of one exercise from the library (PRD wave-1 §2.10-1, 2.10-2). */
export default async function TrainerExercisePage(props: PageProps<"/[lang]/trainer/exercises/[exerciseId]">) {
  const t = await getDictionary();
  return (
    <Suspense
      fallback={
        <Screen header={<ScreenHeader title={t.workouts.library.title} back={{ fallbackHref: "/trainer/exercises" }} />}>
          <SkeletonRows rows={4} label={t.common.loading} />
        </Screen>
      }
    >
      <ExerciseContent params={props.params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ExerciseForm } from "@/components/workouts/exercise-form";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadExercise } from "@/lib/workouts/load";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.form.editTitle };
}

async function EditContent({ params }: { params: PageProps<"/[lang]/trainer/exercises/[exerciseId]/edit">["params"] }) {
  const [{ exerciseId }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const exercise = await loadExercise(exerciseId, locale);
  if (!exercise?.own) {
    return <EmptyState icon={Dumbbell} title={t.workouts.card.notFoundTitle} description={t.workouts.card.notFoundText} />;
  }
  return (
    <ExerciseForm
      id={exercise.id}
      initial={{
        name: exercise.name,
        category: exercise.category ?? "",
        muscles: exercise.musclesPrimary,
        equipment: exercise.equipment,
        description: exercise.description ?? "",
        videoUrl: exercise.videoUrl ?? "",
      }}
    />
  );
}

/** Editing an own exercise (PRD wave-1 §2.10-1). */
export default async function EditExercisePage(props: PageProps<"/[lang]/trainer/exercises/[exerciseId]/edit">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.form.editTitle} back={{ fallbackHref: "/trainer/exercises" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <EditContent params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}

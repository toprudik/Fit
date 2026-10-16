import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ExerciseForm } from "@/components/workouts/exercise-form";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { isCategory } from "@/lib/workouts/catalog";
import { loadExercise } from "@/lib/workouts/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.form.newTitle };
}

/** A new exercise, filled from the one in `?from=` when it is a copy (PRD 2.10-2: the wger credit is kept). */
async function NewContent({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/exercises/new">["searchParams"] }) {
  const [params, t, locale] = await Promise.all([searchParams, getDictionary(), getLocale()]);
  const from = typeof params.from === "string" ? await loadExercise(params.from, locale) : null;
  const copy = t.workouts.form;
  return (
    <>
      <p className="px-1 text-callout text-ink-2">{from ? interpolate(copy.basedOn, { name: from.name }) : copy.visibility}</p>
      <ExerciseForm
        basedOn={from?.id}
        initial={{
          name: from?.name ?? "",
          category: from?.category && isCategory(from.category) ? from.category : "",
          muscles: from?.musclesPrimary ?? [],
          equipment: from?.equipment ?? [],
          description: from?.description ?? "",
          videoUrl: from?.videoUrl ?? "",
        }}
      />
    </>
  );
}

/** "Своё упражнение" (PRD wave-1 §2.10-1): seen by the trainer and their clients only (WORK-2). */
export default async function NewExercisePage(props: PageProps<"/[lang]/trainer/exercises/new">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.form.newTitle} back={{ fallbackHref: "/trainer/exercises" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <NewContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

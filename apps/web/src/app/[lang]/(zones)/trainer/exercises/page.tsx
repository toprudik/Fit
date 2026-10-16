import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { AddExerciseButton, ExerciseLibrary } from "@/components/workouts/exercise-library";
import { getDictionary } from "@/i18n/server";
import { libraryQuery } from "@/lib/workouts/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.library.title };
}

async function LibraryFromParams({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/exercises">["searchParams"] }) {
  return <ExerciseLibrary query={libraryQuery(await searchParams)} />;
}

/** "Ещё → Упражнения": the wger library and the trainer's own exercises (PRD wave-1 §2.10-1..3). */
export default async function TrainerExercisesPage(props: PageProps<"/[lang]/trainer/exercises">) {
  const t = await getDictionary();
  const copy = t.workouts.library;
  return (
    <Screen
      header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} actions={<AddExerciseButton label={copy.add} />} />}
    >
      <div className="flex w-full max-w-2xl flex-col gap-4 pt-4 md:pt-0">
        <p className="px-1 text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <LibraryFromParams searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

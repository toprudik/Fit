import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { AddTemplateButton, TemplateList } from "@/components/workouts/template-list";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.templates.title };
}

/** "Ещё → Шаблоны тренировок" (PRD wave-1 §2.10-7). */
export default async function TrainerTemplatesPage() {
  const t = await getDictionary();
  const copy = t.workouts.templates;
  return (
    <Screen
      header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} actions={<AddTemplateButton label={copy.new} />} />}
    >
      <div className="flex w-full max-w-2xl flex-col gap-4 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <TemplateList />
        </Suspense>
      </div>
    </Screen>
  );
}

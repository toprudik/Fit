import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ArchiveTemplate, TemplateEditor } from "@/components/workouts/template-editor";
import { getDictionary, getLocale } from "@/i18n/server";
import { draftFromTemplate } from "@/lib/workouts/template";
import { loadTemplate } from "@/lib/workouts/templates";
import { weightUnit } from "@/lib/workouts/units";

// A template id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.templates.editTitle };
}

async function TemplateContent({ params }: { params: PageProps<"/[lang]/trainer/templates/[templateId]">["params"] }) {
  const [{ templateId }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const template = await loadTemplate(templateId, locale);
  if (!template) {
    return <EmptyState icon={ClipboardList} title={t.workouts.templates.notFoundTitle} description={t.workouts.templates.notFoundText} />;
  }
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <TemplateEditor id={template.id} initial={draftFromTemplate(template, weightUnit(locale), locale === "ru" ? "," : ".")} />
      <ArchiveTemplate id={template.id} archived={template.archived} />
    </div>
  );
}

/** One workout template, edited in place; editing it never changes logs filled from it (WORK-5). */
export default async function TemplatePage(props: PageProps<"/[lang]/trainer/templates/[templateId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.templates.editTitle} back={{ fallbackHref: "/trainer/templates" }} />}>
      <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
        <TemplateContent params={props.params} />
      </Suspense>
    </Screen>
  );
}

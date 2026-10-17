import type { Metadata } from "next";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TemplateEditor } from "@/components/workouts/template-editor";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.templates.new };
}

/** A new workout template (PRD wave-1 §2.10-7). */
export default async function NewTemplatePage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.templates.new} back={{ fallbackHref: "/trainer/templates" }} />}>
      <TemplateEditor initial={{ title: "", notes: "", items: [] }} />
    </Screen>
  );
}

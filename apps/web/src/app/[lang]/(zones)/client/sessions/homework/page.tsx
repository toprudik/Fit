import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientHomework } from "@/components/homework/client-homework";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.homework.title };
}

/** "Домашние задания" of the client (screens.md /client/sessions/homework, PRD wave-2 §10). */
export default async function ClientHomeworkPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.homework.title} back={{ fallbackHref: "/client/sessions" }} />}>
      <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
        <ClientHomework />
      </Suspense>
    </Screen>
  );
}

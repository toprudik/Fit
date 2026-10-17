import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientBadges } from "@/components/gamification/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.gamification.title };
}

/** "Серии и значки": the client's streaks, the weekly goal and the badge catalogue (PRD wave-3 §2.1–2.2). */
export default async function BadgesPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.gamification.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <ClientBadges />
        </Suspense>
      </div>
    </Screen>
  );
}

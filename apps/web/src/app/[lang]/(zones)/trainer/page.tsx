import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TodayDate } from "@/components/shell/today-date";
import { TodayMilestones } from "@/components/pairs/today-milestones";
import { EmptyState } from "@/components/ui/empty-state";
import { VerificationBanner } from "@/components/verification/verification-banner";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.today };
}

export default async function TrainerTodayPage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.today;
  const locale = await getLocale();
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.today} subtitle={<TodayDate />} />}>
      <Suspense fallback={null}>
        <VerificationBanner />
      </Suspense>
      <Suspense fallback={null}>
        <TodayMilestones t={t} locale={locale} />
      </Suspense>
      <EmptyState icon={CalendarCheck} title={copy.emptyTitle} description={copy.emptyText} />
    </Screen>
  );
}

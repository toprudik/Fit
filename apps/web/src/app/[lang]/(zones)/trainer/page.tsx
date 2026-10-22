import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TodayDate } from "@/components/shell/today-date";
import { TodayMilestones } from "@/components/pairs/today-milestones";
import { TrainerTodayView } from "@/components/today/trainer-today";
import { EmptyState } from "@/components/ui/empty-state";
import { TrainerTodaySkeleton } from "@/components/shell/tab-skeletons";
import { VerificationBanner } from "@/components/verification/verification-banner";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadTrainerMoney } from "@/lib/passes/load";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { loadTrainerToday } from "@/lib/today/trainer-today";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.today };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

/** Reads the session, so it sits behind Suspense. */
async function Today() {
  const [t, owner] = await Promise.all([getDictionary(), loadScheduleOwner()]);
  const copy = t.screens.trainer.today;
  if (!owner) return <EmptyState icon={CalendarCheck} title={copy.emptyTitle} description={copy.emptyText} />;
  const [today, money] = await Promise.all([loadTrainerToday(owner, now()), loadTrainerMoney()]);
  return <TrainerTodayView t={t} today={today} attention={{ debts: money?.debts.length ?? 0, ending: money?.ending.length ?? 0 }} />;
}

export default async function TrainerTodayPage() {
  const t = await getDictionary();
  const locale = await getLocale();
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.today} subtitle={<TodayDate />} />}>
      <Suspense fallback={null}>
        <VerificationBanner />
      </Suspense>
      <Suspense fallback={<TrainerTodaySkeleton label={t.common.loading} />}>
        <Today />
      </Suspense>
      <Suspense fallback={null}>
        <TodayMilestones t={t} locale={locale} />
      </Suspense>
    </Screen>
  );
}

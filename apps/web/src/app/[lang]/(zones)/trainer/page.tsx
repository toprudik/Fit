import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TodayDate } from "@/components/shell/today-date";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.today };
}

export default async function TrainerTodayPage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.today;
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.today} subtitle={<TodayDate />} />}>
      <EmptyState icon={CalendarCheck} title={copy.emptyTitle} description={copy.emptyText} />
    </Screen>
  );
}

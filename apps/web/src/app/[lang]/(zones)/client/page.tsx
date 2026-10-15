import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TodayDate } from "@/components/shell/today-date";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.home };
}

export default async function ClientHomePage() {
  const t = await getDictionary();
  const copy = t.screens.client.home;
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.home} subtitle={<TodayDate />} />}>
      <EmptyState icon={CalendarClock} title={copy.emptyTitle} description={copy.emptyText} className="flex-1 justify-center" />
    </Screen>
  );
}

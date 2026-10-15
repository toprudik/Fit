import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.schedule };
}

export default async function TrainerSchedulePage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.schedule;
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.schedule} />}>
      <EmptyState icon={CalendarDays} title={copy.emptyTitle} description={copy.emptyText} />
    </Screen>
  );
}

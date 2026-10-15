import type { Metadata } from "next";
import { ChartLine } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.progress };
}

export default async function ClientProgressPage() {
  const t = await getDictionary();
  const copy = t.screens.client.progress;
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.progress} />}>
      <EmptyState icon={ChartLine} title={copy.emptyTitle} description={copy.emptyText} className="flex-1 justify-center" />
    </Screen>
  );
}

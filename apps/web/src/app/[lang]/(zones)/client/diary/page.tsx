import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.diary };
}

export default async function ClientDiaryPage() {
  const t = await getDictionary();
  const copy = t.screens.client.diary;
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.diary} />}>
      <EmptyState icon={Dumbbell} title={copy.emptyTitle} description={copy.emptyText} />
    </Screen>
  );
}

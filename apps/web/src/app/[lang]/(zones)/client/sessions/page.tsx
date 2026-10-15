import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.sessions };
}

export default async function ClientSessionsPage() {
  const t = await getDictionary();
  const copy = t.screens.client.sessions;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.client.sessions} />}>
          <EmptyState icon={CalendarDays} title={copy.emptyTitle} description={copy.emptyText} />
        </Screen>
      }
      detail={<DetailPlaceholder icon={CalendarDays} text={copy.detail} />}
    />
  );
}

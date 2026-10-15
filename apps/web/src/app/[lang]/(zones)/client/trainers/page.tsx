import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.trainers };
}

export default async function ClientTrainersPage() {
  const t = await getDictionary();
  const copy = t.screens.client.trainers;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.client.trainers} />}>
          <EmptyState icon={UserRound} title={copy.emptyTitle} description={copy.emptyText} className="flex-1 justify-center" />
        </Screen>
      }
      detail={<DetailPlaceholder icon={UserRound} text={copy.detail} />}
    />
  );
}

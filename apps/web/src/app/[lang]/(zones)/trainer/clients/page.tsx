import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.clients };
}

export default async function TrainerClientsPage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.clients;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.clients} />}>
          <EmptyState icon={Users} title={copy.emptyTitle} description={copy.emptyText} className="flex-1 justify-center" />
        </Screen>
      }
      detail={<DetailPlaceholder icon={Users} text={copy.detail} />}
    />
  );
}

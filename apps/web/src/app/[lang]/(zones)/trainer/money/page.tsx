import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.money };
}

export default async function TrainerMoneyPage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.money;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.money} />}>
          <EmptyState icon={Wallet} title={copy.emptyTitle} description={copy.emptyText} className="flex-1 justify-center" />
        </Screen>
      }
      detail={<DetailPlaceholder icon={Wallet} text={copy.detail} />}
    />
  );
}

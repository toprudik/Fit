import type { Metadata } from "next";
import { Tags, Wallet } from "lucide-react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
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
          <div className="flex flex-col gap-6 pt-4 md:pt-0">
            <ListGroup>
              <ListRow icon={Tags} iconTone="accent" title={copy.packages} subtitle={copy.packagesText} href="/trainer/money/packages" />
            </ListGroup>
            <EmptyState icon={Wallet} title={copy.emptyTitle} description={copy.emptyText} />
          </div>
        </Screen>
      }
      detail={<DetailPlaceholder icon={Wallet} text={copy.detail} />}
    />
  );
}

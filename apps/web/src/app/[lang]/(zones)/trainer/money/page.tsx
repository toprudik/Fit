import type { Metadata } from "next";
import { Suspense } from "react";
import { Tags, Wallet } from "lucide-react";
import { MoneyOverview } from "@/components/passes/money-overview";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { TrainerMoneySkeleton } from "@/components/shell/tab-skeletons";
import { getDictionary } from "@/i18n/server";
import { loadTrainerMoney } from "@/lib/passes/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.money };
}

/** Reads the session, so it sits behind Suspense. */
async function Overview() {
  const [t, money] = await Promise.all([getDictionary(), loadTrainerMoney()]);
  const copy = t.screens.trainer.money;
  if (!money) return <EmptyState icon={Wallet} title={copy.emptyTitle} description={copy.emptyText} />;
  return <MoneyOverview money={money} />;
}

export default async function TrainerMoneyPage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.money;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.money} />}>
          <div className="flex flex-col gap-6 pt-4 md:pt-0">
            <Suspense fallback={<TrainerMoneySkeleton label={t.common.loading} />}>
              <Overview />
            </Suspense>
            <ListGroup>
              <ListRow icon={Tags} iconTone="accent" title={copy.packages} subtitle={copy.packagesText} href="/trainer/money/packages" />
            </ListGroup>
          </div>
        </Screen>
      }
      detail={<DetailPlaceholder icon={Wallet} text={copy.detail} />}
    />
  );
}

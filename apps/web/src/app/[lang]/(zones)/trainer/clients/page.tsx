import type { Metadata } from "next";
import { Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PairList } from "@/components/client-links/pair-list";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
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
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <PairList
              side="trainer"
              empty={
                <EmptyState
                  icon={Users}
                  title={copy.emptyTitle}
                  description={copy.emptyText}
                  action={
                    <Button asChild>
                      <Link href="/trainer/links">{copy.emptyAction}</Link>
                    </Button>
                  }
                />
              }
            />
          </Suspense>
        </Screen>
      }
      detail={<DetailPlaceholder icon={Users} text={copy.detail} />}
    />
  );
}

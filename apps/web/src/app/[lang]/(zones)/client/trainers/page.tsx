import type { Metadata } from "next";
import { UserRound } from "lucide-react";
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
  return { title: t.tabs.client.trainers };
}

export default async function ClientTrainersPage() {
  const t = await getDictionary();
  const copy = t.screens.client.trainers;
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.client.trainers} />}>
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <PairList
              side="client"
              after={
                <Button asChild variant="ghost" className="mt-4 self-start">
                  <Link href="/join">{copy.add}</Link>
                </Button>
              }
              empty={
                <EmptyState
                  icon={UserRound}
                  title={copy.emptyTitle}
                  description={copy.emptyText}
                  action={
                    <Button asChild>
                      <Link href="/join">{copy.emptyAction}</Link>
                    </Button>
                  }
                />
              }
            />
          </Suspense>
        </Screen>
      }
      detail={<DetailPlaceholder icon={UserRound} text={copy.detail} />}
    />
  );
}

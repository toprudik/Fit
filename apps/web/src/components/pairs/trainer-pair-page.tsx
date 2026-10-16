import { Suspense } from "react";
import { MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { AddClientButton, ClientList } from "./client-list";
import { TrainerPair } from "./trainer-pair";

async function PairFromParams({ params, tab }: { params: Promise<{ coachingId: string }>; tab: "overview" | "notes" }) {
  const { coachingId } = await params;
  return <TrainerPair coachingId={coachingId} tab={tab} />;
}

async function ListFromParams({ params }: { params: Promise<{ coachingId: string }> }) {
  const { coachingId } = await params;
  return <ClientList filter="all" query="" selectedId={coachingId} />;
}

/**
 * /trainer/clients/[coachingId] and its sections: the card as a pushed screen on a phone, next to the
 * client list from 1280px (desktop-clients.png).
 */
export async function TrainerPairPage({ params, tab }: { params: Promise<{ coachingId: string }>; tab: "overview" | "notes" }) {
  const t = await getDictionary();
  return (
    <MasterDetail
      show="detail"
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.clients} actions={<AddClientButton label={t.pairs.cards.add} />} />}>
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <ListFromParams params={params} />
          </Suspense>
        </Screen>
      }
      detail={
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 px-4 pt-20 md:px-6 md:pt-6 xl:px-8">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          }
        >
          <PairFromParams params={params} tab={tab} />
        </Suspense>
      }
    />
  );
}

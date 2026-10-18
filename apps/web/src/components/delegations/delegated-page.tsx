import { Users } from "lucide-react";
import { Suspense } from "react";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { AssistedCard, ClientsSwitch, DelegatedList } from "./assisted";

async function ListFromParams({ params }: { params?: Promise<{ coachingId: string }> }) {
  const selectedId = params ? (await params).coachingId : undefined;
  return <DelegatedList selectedId={selectedId} />;
}

async function CardFromParams({ params }: { params: Promise<{ coachingId: string }> }) {
  const { coachingId } = await params;
  return <AssistedCard coachingId={coachingId} />;
}

/**
 * /trainer/clients/delegated and its client cards: the list of delegated clients, and a card as a pushed
 * screen on a phone, next to the list from 1280px, like «Мои клиенты».
 */
export async function DelegatedPage({ params }: { params?: Promise<{ coachingId: string }> }) {
  const t = await getDictionary();
  return (
    <MasterDetail
      show={params ? "detail" : "list"}
      list={
        <Screen header={<ScreenHeader title={t.delegatedZone.title} back={{ fallbackHref: "/trainer/clients" }} />}>
          {/* Outside the list's Suspense, so switching does not flash the chips. */}
          <ClientsSwitch t={t} current="delegated" />
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <ListFromParams params={params} />
          </Suspense>
        </Screen>
      }
      detail={
        params ? (
          <Suspense
            fallback={
              <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 px-4 pt-20 md:px-6 md:pt-6 xl:px-8">
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="h-32 w-full" />
              </div>
            }
          >
            <CardFromParams params={params} />
          </Suspense>
        ) : (
          <DetailPlaceholder icon={Users} text={t.screens.trainer.clients.detail} />
        )
      }
    />
  );
}

import { Suspense } from "react";
import { MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { AddClientButton, ClientList } from "./client-list";

/**
 * A pushed screen of "Клиенты" (a new card, a claim): on its own on a phone, next to the client list from
 * 1280px, like the client card.
 */
export async function ClientsDetail({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <MasterDetail
      show="detail"
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.clients} actions={<AddClientButton label={t.pairs.cards.add} />} />}>
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <ClientList filter="all" query="" />
          </Suspense>
        </Screen>
      }
      detail={
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 px-4 pt-20 md:px-6 md:pt-6 xl:px-8">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          }
        >
          {children}
        </Suspense>
      }
    />
  );
}

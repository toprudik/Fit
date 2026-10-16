import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientPair } from "@/components/pairs/client-pair";
import { MasterDetail } from "@/components/shell/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { TrainersList } from "@/components/pairs/trainers-list";

// The shell reads the route segments (AppShell), and a pair id is known only at request time, so the
// page renders on request instead of from a prerendered shell.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.trainers };
}

async function PairFromParams({ params }: { params: PageProps<"/[lang]/client/trainers/[coachingId]">["params"] }) {
  const { coachingId } = await params;
  return <ClientPair coachingId={coachingId} />;
}

/** The client's card of one trainer, pushed on a phone and next to the trainers list from 1280px. */
export default async function ClientPairPage(props: PageProps<"/[lang]/client/trainers/[coachingId]">) {
  const t = await getDictionary();
  return (
    <MasterDetail
      show="detail"
      list={<TrainersList />}
      detail={
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 px-4 pt-20 md:px-6 md:pt-6 xl:px-8">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          }
        >
          <PairFromParams params={props.params} />
        </Suspense>
      }
    />
  );
}

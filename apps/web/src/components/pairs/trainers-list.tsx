import { UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PairList } from "./pair-list";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

/** The client's trainers, each opening its pair card; "Добавить тренера" leads to the code screen. */
export async function TrainersList() {
  const t = await getDictionary();
  const copy = t.screens.client.trainers;
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.trainers} />}>
      <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
        <PairList
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
  );
}

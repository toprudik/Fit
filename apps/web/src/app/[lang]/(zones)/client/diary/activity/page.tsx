import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientActivityDay } from "@/components/activity/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isDay } from "@/lib/passes/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.activity.title };
}

async function Day({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  return <ClientActivityDay day={isDay(search.day) ? search.day : null} />;
}

/** "Активность": steps, water and sleep of a day, `?day=` for another day, and the last week (wave-2 §4). */
export default async function ActivityPage(props: PageProps<"/[lang]/client/diary/activity">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.activity.title} back={{ fallbackHref: "/client/diary" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Day searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { NutritionClients } from "@/components/nutrition/adherence";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isAdherencePeriod } from "@/lib/nutrition/adherence";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adherence.title };
}

async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  return <NutritionClients days={isAdherencePeriod(search.days) ? (Number(search.days) as 7 | 30 | 90) : 7} />;
}

/** «Питание клиентов» (wave-2 §5.5): `?days=30|90` for a longer period. */
export default async function NutritionClientsPage(props: PageProps<"/[lang]/trainer/nutrition">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adherence.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Clients searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

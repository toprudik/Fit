import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientPasses } from "@/components/passes/client-passes";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.money.client.title };
}

/** The client's passes at every trainer (screens.md "Абонементы", PRD 2.8 client story). */
export default async function ClientPassesPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.money.client.title} back={{ fallbackHref: "/client" }} />}>
      <div className="pt-3 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ClientPasses />
        </Suspense>
      </div>
    </Screen>
  );
}

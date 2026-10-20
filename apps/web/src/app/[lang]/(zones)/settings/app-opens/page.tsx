import type { Metadata } from "next";
import { Activity } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppOpensSwitch } from "@/components/analytics/app-opens-switch";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadAppOpensCounted } from "@/lib/analytics/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.appOpens.title };
}

async function Settings() {
  const t = await getDictionary();
  const counted = await loadAppOpensCounted();
  if (counted === null) {
    return (
      <EmptyState
        icon={Activity}
        title={t.appOpens.title}
        description={t.appOpens.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/settings/app-opens")}`}>{t.appOpens.signIn}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">{t.appOpens.intro}</p>
      <div className="rounded-lg bg-surface-1 p-4">
        <AppOpensSwitch counted={counted} />
      </div>
    </div>
  );
}

/** "Учёт открытий": anyone can switch off the first-party app-opening count (legal item Б12, app_opens). */
export default async function AppOpensPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.appOpens.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <Settings />
        </Suspense>
      </div>
    </Screen>
  );
}

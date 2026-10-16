import type { Metadata } from "next";
import { CalendarClock, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { TodayDate } from "@/components/shell/today-date";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.home };
}

/** Whether the signed-in user trains with anyone: a live pair on the client side. */
async function hasTrainer(): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { count, error } = await supabase
    .from("coachings")
    .select("id", { count: "exact", head: true })
    .eq("client_id", userId)
    .in("status", ["trial", "active"]);
  if (error) throw new Error(`loading pairs failed: ${error.code}`);
  return (count ?? 0) > 0;
}

/**
 * The client zone's first screen. Someone who trains with no one yet, a trainer opening the client zone
 * included, gets the way to a trainer: their code on /join (screens.md §1.6).
 */
async function HomeContent() {
  const [t, trains] = await Promise.all([getDictionary(), hasTrainer()]);
  const copy = t.screens.client.home;
  if (trains === false) {
    return (
      <EmptyState
        icon={UserRound}
        title={copy.noTrainerTitle}
        description={copy.noTrainerText}
        action={
          <Button asChild>
            <Link href="/join">{copy.noTrainerAction}</Link>
          </Button>
        }
      />
    );
  }
  return <EmptyState icon={CalendarClock} title={copy.emptyTitle} description={copy.emptyText} />;
}

export default async function ClientHomePage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.home} subtitle={<TodayDate />} />}>
      <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
        <HomeContent />
      </Suspense>
    </Screen>
  );
}

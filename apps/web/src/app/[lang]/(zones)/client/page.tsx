import type { Metadata } from "next";
import { CalendarClock, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ClientHomeSkeleton } from "@/components/shell/tab-skeletons";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TodayDate } from "@/components/shell/today-date";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientTodayGoals } from "@/components/today/client-goals";
import { ClientHomeView } from "@/components/today/client-home";
import { getDictionary, getLocale } from "@/i18n/server";
import { segmentBookings } from "@/lib/bookings/book";
import { loadClientBookings } from "@/lib/bookings/load";
import { loadClientPasses } from "@/lib/passes/load";
import { loadScheduleOwner } from "@/lib/schedule/load";
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

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

/**
 * The client zone's first screen: the next session, the passes and today's goals (screens.md §3.1). Someone who trains with no
 * one yet, a trainer opening the client zone included, gets the way to a trainer: their code on /join (screens.md §1.6).
 */
async function HomeContent() {
  const [t, locale, trains] = await Promise.all([getDictionary(), getLocale(), hasTrainer()]);
  const copy = t.screens.client.home;
  if (trains === false) {
    return (
      <EmptyState
        icon={UserRound}
        title={copy.noTrainerTitle}
        description={copy.noTrainerText}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button asChild>
              <Link href="/join">{copy.noTrainerAction}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/client/invite-trainer">{copy.inviteTrainerAction}</Link>
            </Button>
          </div>
        }
      />
    );
  }
  const owner = await loadScheduleOwner();
  if (!owner) return <EmptyState icon={CalendarClock} title={copy.emptyTitle} description={copy.emptyText} />;
  const [bookings, money] = await Promise.all([loadClientBookings(owner), loadClientPasses()]);
  const { upcoming, requests } = segmentBookings(bookings, now());
  return (
    <ClientHomeView
      t={t}
      locale={locale}
      home={{ timeZone: owner.timeZone, next: upcoming[0] ?? null, requests: requests.length, money: money ?? [] }}
    >
      {/* Same place as the goals group of the screen's skeleton, so the goals arrive without a jump. */}
      <Suspense fallback={<SkeletonRows header rows={2} label={t.common.loading} />}>
        <ClientTodayGoals />
      </Suspense>
    </ClientHomeView>
  );
}

export default async function ClientHomePage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.home} subtitle={<TodayDate />} />}>
      <Suspense fallback={<ClientHomeSkeleton label={t.common.loading} />}>
        <HomeContent />
      </Suspense>
    </Screen>
  );
}

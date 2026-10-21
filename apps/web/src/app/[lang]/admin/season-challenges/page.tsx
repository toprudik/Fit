import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Suspense } from "react";
import { CancelSeasonChallenge, SeasonChallengeForm } from "@/components/admin/season-challenge-form";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { monthLabel } from "@/lib/season-challenge/season";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminSeasonChallenges.title };
}

async function Challenges() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.adminSeasonChallenges;
  const { supabase, timeZone } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_season_challenges");
  if (error) throw new Error(`loading the season challenges failed: ${error.code}`);
  const thisMonth = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone }).format(new Date());

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="season-new" className="flex flex-col gap-3">
        <h2 id="season-new" className="px-1 text-headline">
          {copy.newTitle}
        </h2>
        <p className="px-1 text-callout text-ink-2">{copy.lead}</p>
        <SeasonChallengeForm defaultMonth={thisMonth} />
      </section>
      {data.length === 0 ? (
        <EmptyState icon={Trophy} title={copy.emptyTitle} description={copy.emptyText} />
      ) : (
        <section aria-labelledby="season-list" className="flex flex-col gap-2">
          <h2 id="season-list" className="px-1 text-footnote text-ink-2">
            {copy.listTitle}
          </h2>
          <ul className="flex flex-col gap-3">
            {data.map((row) => {
              const state = row.cancelled_at ? "cancelled" : row.finished_at ? "finished" : "running";
              return (
                <li key={row.id} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body">{row.title}</p>
                    <Badge tone={state === "running" ? "success" : "neutral"}>{copy.states[state]}</Badge>
                  </div>
                  <p className="text-subhead text-ink-2">
                    {monthLabel(locale, row.month)} · {interpolate(copy.stats, { participants: row.participants, done: row.done })}
                  </p>
                  {state === "running" ? <CancelSeasonChallenge id={row.id} /> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * «Челленджи DaFit» (marketing 12): the admin starts the challenge of a month for all clients, who join by choice;
 * the list shows each one with how many joined and how many went through the month without a miss.
 */
export default async function AdminSeasonChallengesPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminSeasonChallenges.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Challenges />
        </Suspense>
      </div>
    </Screen>
  );
}

import type { Metadata } from "next";
import { Award } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DaRing } from "@/components/brand/da-ring";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDay } from "@/lib/pairs/format";
import { loadTrainerMilestones } from "@/lib/trainer-milestones/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerMilestones.title };
}

async function Milestones() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerMilestones()]);
  const copy = t.trainerMilestones;
  if (data === "signed-out") {
    return (
      <EmptyState
        icon={Award}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/milestones")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (!data) return <EmptyState icon={Award} title={copy.title} description={copy.notTrainer} />;
  const reached = data.rows.filter((row) => row.achievedAt);
  const ahead = data.rows.filter((row) => !row.achievedAt);
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-callout text-ink-2">{copy.lead}</p>
      {reached.length > 0 ? (
        <ListGroup header={copy.reached}>
          {reached.map((row) => (
            <ListRow
              key={row.kind}
              leading={<DaRing state="done" size={28} />}
              title={copy.items[row.kind].title}
              subtitle={formatDay(locale, row.achievedAt as string, data.timeZone)}
            />
          ))}
        </ListGroup>
      ) : null}
      {ahead.length > 0 ? (
        <ListGroup header={copy.ahead}>
          {ahead.map((row) => (
            <ListRow
              key={row.kind}
              leading={<DaRing state="progress" value={row.progress?.share ?? 0} size={28} />}
              title={copy.items[row.kind].title}
              subtitle={
                row.progress
                  ? `${copy.items[row.kind].text} ${interpolate(copy.progress, { current: row.progress.current, target: row.progress.target })}`
                  : copy.items[row.kind].text
              }
            />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}

/**
 * «Мои вехи» (marketing 14): the trainer's reached milestones with their dates, then the ones ahead with the way
 * to them. The bot message about a new one is switched off on /settings/notifications.
 */
export default async function TrainerMilestonesPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerMilestones.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          <Milestones />
        </Suspense>
      </div>
    </Screen>
  );
}

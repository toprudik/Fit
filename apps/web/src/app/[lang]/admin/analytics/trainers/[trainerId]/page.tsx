import type { Metadata } from "next";
import { UserX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadTrainer } from "@/lib/admin/analytics";
import { analyticsPeriod, moneyByCurrency, share } from "@/lib/admin/analytics-format";
import { personName } from "@/lib/admin/people";
import { formatMoney } from "@/lib/money/format";
import { STATUS_TONE } from "@/lib/verification/status";

// A trainer id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminAnalytics.trainer.title };
}

type Props = PageProps<"/[lang]/admin/analytics/trainers/[trainerId]">;

/** Start of the week `weeksAgo` weeks back, for the per-week rows (the last row is the current 7 days). */
function weekStart(weeksAgo: number): Date {
  return new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
}

async function TrainerAnalytics({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [t, locale, { trainerId }, query] = await Promise.all([getDictionary(), getLocale(), params, searchParams]);
  const copy = t.adminAnalytics;
  const days = analyticsPeriod(query.days);
  const id = z.uuid().safeParse(trainerId);
  const trainer = id.success ? await loadTrainer(id.data, days) : null;
  if (!trainer) {
    return (
      <EmptyState
        icon={UserX}
        title={copy.trainer.notFoundTitle}
        description={copy.trainer.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/analytics">{copy.trainer.back}</Link>
          </Button>
        }
      />
    );
  }

  const intl = INTL_LOCALE[locale];
  const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: "long", timeStyle: "short", timeZone: trainer.timeZone });
  const day = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", timeZone: trainer.timeZone });
  const money = (value: typeof trainer.earned) => {
    const amounts = moneyByCurrency(value);
    return amounts.length === 0 ? "0" : amounts.map(({ currency, minor }) => formatMoney(locale, minor, currency)).join(", ");
  };
  const marked = trainer.attended + trainer.no_shows;
  const attendance = share(trainer.attended, marked);
  const yesNo = (value: boolean) => (value ? copy.trainer.yes : copy.trainer.no);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 px-1">
        <h2 className="text-title-2">{personName(trainer, copy.noName)}</h2>
        <div>
          <Badge tone={STATUS_TONE[trainer.verification_status]}>{copy.trainers.status[trainer.verification_status]}</Badge>
        </div>
      </div>

      <ListGroup header={`${copy.trainer.summary}: ${copy.periods[String(days) as "7" | "30" | "90"]}`} headingLevel={2}>
        <ListRow title={copy.trainer.clients} value={trainer.clients} />
        <ListRow title={copy.trainer.held} value={trainer.held_sessions} />
        <ListRow
          title={copy.trainer.attendance}
          value={
            attendance === null ? copy.partEmpty : interpolate(copy.part, { share: attendance, part: trainer.attended, total: marked })
          }
        />
        <ListRow title={copy.trainer.noShows} value={trainer.no_shows} />
        <ListRow title={copy.trainer.earned} value={money(trainer.earned)} />
        <ListRow title={copy.trainer.received} value={money(trainer.received)} />
        <ListRow title={copy.trainer.endingPasses} value={trainer.ending_passes} />
        <ListRow title={copy.trainer.opens} value={trainer.opens} />
        <ListRow
          title={copy.trainer.lastActive}
          subtitle={trainer.last_active ? dateTime.format(new Date(trainer.last_active)) : copy.clients.never}
        />
      </ListGroup>

      <ListGroup header={copy.trainer.weeks} headingLevel={2}>
        {trainer.weeks.map((count, index) => (
          <ListRow
            key={index}
            title={interpolate(copy.trainer.week, { date: day.format(weekStart(trainer.weeks.length - index)) })}
            value={count}
          />
        ))}
      </ListGroup>

      <ListGroup header={copy.trainer.features} footer={copy.trainer.auditNote} headingLevel={2}>
        <ListRow title={copy.trainer.passes} value={yesNo(trainer.uses_passes)} />
        <ListRow title={copy.trainer.repeats} value={yesNo(trainer.uses_repeats)} />
        <ListRow title={copy.trainer.groups} value={yesNo(trainer.uses_groups)} />
        <ListRow title={copy.trainer.templates} value={yesNo(trainer.uses_workout_templates)} />
      </ListGroup>
    </div>
  );
}

/** One trainer in «Аналитика» (PRD wave-2 §8 rule 3); every opening is written to the audit log (§8.3). */
export default async function AdminTrainerAnalyticsPage(props: Props) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminAnalytics.trainer.title} back={{ fallbackHref: "/admin/analytics" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={8} label={t.common.loading} />}>
          <TrainerAnalytics params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

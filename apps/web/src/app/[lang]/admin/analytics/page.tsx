import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadClients, loadPlatform, loadTrainers } from "@/lib/admin/analytics";
import { ANALYTICS_PERIODS, analyticsPeriod, share, type AnalyticsPeriod } from "@/lib/admin/analytics-format";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { STATUS_TONE } from "@/lib/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminAnalytics.title };
}

type SearchParams = PageProps<"/[lang]/admin/analytics">["searchParams"];

/** "33% (1 из 3)", or "0 из 0" when there is nothing to divide. */
function partText(copy: Dictionary["adminAnalytics"], part: number, total: number): string {
  const percent = share(part, total);
  return percent === null ? copy.partEmpty : interpolate(copy.part, { share: percent, part, total });
}

async function Analytics({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminAnalytics;
  const days = analyticsPeriod(params.days);
  const [{ platform, beta }, trainers, clients, { timeZone }] = await Promise.all([
    loadPlatform(days),
    loadTrainers(days),
    loadClients(days),
    requireAdmin(),
  ]);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short", timeZone });
  const featureClients = platform.clients;

  return (
    <div className="flex flex-col gap-8">
      <ChipRow label={copy.period}>
        {ANALYTICS_PERIODS.map((period) => (
          <Chip key={period} href={`/admin/analytics?days=${period}`} selected={period === days}>
            {copy.periods[String(period) as `${AnalyticsPeriod}`]}
          </Chip>
        ))}
      </ChipRow>

      <ListGroup header={copy.beta.header} footer={copy.beta.footer} headingLevel={2}>
        <ListRow
          title={copy.beta.onSchedule}
          value={interpolate(copy.beta.onScheduleValue, { count: beta.trainers_on_schedule, total: beta.trainers_total })}
        />
        <ListRow title={copy.beta.withoutEdits} value={partText(copy, beta.held_without_edits, beta.held_sessions)} />
        <ListRow
          title={copy.beta.fromBot}
          value={interpolate(copy.beta.fromBotValue, { count: beta.opens_from_bot, prev: beta.opens_from_bot_prev })}
        />
      </ListGroup>

      <ListGroup header={copy.funnel.header} headingLevel={2}>
        <ListRow title={copy.funnel.invites} value={platform.invites_created} />
        <ListRow title={copy.funnel.registered} value={platform.trainers_registered} />
        <ListRow title={copy.funnel.verified} value={platform.trainers_verified} />
        <ListRow title={copy.funnel.withClient} value={platform.trainers_with_client} />
        <ListRow title={copy.funnel.withSession} value={platform.trainers_with_session} />
      </ListGroup>

      <ListGroup header={copy.platform.header} headingLevel={2}>
        <ListRow title={copy.platform.clients} value={platform.clients} />
        <ListRow title={copy.platform.cards} value={platform.cards} />
        <ListRow title={copy.platform.active7} value={platform.active_7} />
        <ListRow title={copy.platform.active30} value={platform.active_30} />
        <ListRow title={copy.platform.sessions} value={platform.sessions} />
        <ListRow title={copy.platform.held} value={platform.held_sessions} />
        <ListRow title={copy.platform.withoutEdits} value={partText(copy, platform.held_without_edits, platform.held_sessions)} />
        <ListRow title={copy.platform.bookings} value={platform.bookings} />
        <ListRow title={copy.platform.cancellations} value={platform.cancellations} />
        <ListRow title={copy.platform.noShows} value={platform.no_shows} />
        <ListRow title={copy.platform.opens} value={platform.opens} />
        <ListRow title={copy.platform.fromBot} value={partText(copy, platform.opens_from_bot, platform.opens)} />
      </ListGroup>

      <ListGroup header={copy.features.header} footer={copy.features.footer} headingLevel={2}>
        <ListRow title={copy.features.workouts} value={partText(copy, platform.clients_logging_workouts, featureClients)} />
        <ListRow title={copy.features.measurements} value={partText(copy, platform.clients_with_measurements, featureClients)} />
        <ListRow title={copy.features.photos} value={partText(copy, platform.clients_with_photos, featureClients)} />
      </ListGroup>

      <ListGroup header={copy.trainers.header} headingLevel={2}>
        {trainers.length === 0 ? <ListRow title={copy.trainers.empty} /> : null}
        {trainers.map((trainer) => (
          <ListRow
            key={trainer.trainer_id}
            href={`/admin/analytics/trainers/${trainer.trainer_id}?days=${days}`}
            title={personName(trainer, copy.noName)}
            subtitle={interpolate(copy.trainers.subtitle, { clients: trainer.clients, held: trainer.held_sessions })}
            trailing={
              <Badge tone={STATUS_TONE[trainer.verification_status]} className="max-sm:hidden">
                {copy.trainers.status[trainer.verification_status]}
              </Badge>
            }
          />
        ))}
      </ListGroup>

      <ListGroup header={copy.clients.header} footer={copy.clients.footer} headingLevel={2}>
        {clients.length === 0 ? <ListRow title={copy.clients.empty} /> : null}
        {clients.map((client) => {
          const flags = [
            client.logs_workouts && copy.clients.flags.workouts,
            client.takes_measurements && copy.clients.flags.measurements,
            client.adds_photos && copy.clients.flags.photos,
          ].filter((flag): flag is string => Boolean(flag));
          return (
            <ListRow
              key={client.client_id}
              title={personName(client, copy.noName)}
              subtitle={[
                interpolate(copy.clients.subtitle, { pairs: client.pairs, attended: client.attended }),
                client.last_active
                  ? interpolate(copy.clients.lastActive, { date: date.format(new Date(client.last_active)) })
                  : copy.clients.never,
                ...flags,
              ].join(", ")}
            />
          );
        })}
      </ListGroup>
    </div>
  );
}

/**
 * «Аналитика» (PRD wave-2 §8, screens.md §3.5): the beta metrics of Q26, the trainer funnel, the platform for a
 * period, what clients use, trainers and clients. Counts and yes/no flags only, never a client's data.
 */
export default async function AdminAnalyticsPage(props: PageProps<"/[lang]/admin/analytics">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminAnalytics.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={8} label={t.common.loading} />}>
          <Analytics searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

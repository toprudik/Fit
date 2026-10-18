import { Download } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { moneyByCurrency, share } from "@/lib/admin/analytics-format";
import { requireAdmin } from "@/lib/admin/require-admin";
import { formatMoney } from "@/lib/money/format";
import { loadOwnerMetrics } from "@/lib/owner-metrics/load";
import {
  OWNER_WEEKS,
  SUCCESS_GOALS,
  growth,
  growthText,
  lastFullWeeks,
  ownerWeeks,
  retentionShares,
  successSignal,
  type OwnerWeeks,
} from "@/lib/owner-metrics/metrics";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.ownerStats.title };
}

type SearchParams = PageProps<"/[lang]/admin/stats">["searchParams"];

/** "4 000 ₽, 12,50 €", or 0 in the viewer's format when nothing came in. */
function money(locale: Locale, value: Json): string {
  const amounts = moneyByCurrency(value);
  if (amounts.length === 0) return formatNumber(locale, 0);
  return amounts.map(({ currency, minor }) => formatMoney(locale, minor, currency)).join(", ");
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-1 px-4 py-3">
      <span className="text-footnote text-ink-2">{label}</span>
      <span className="truncate text-title-2 font-bold tabular-nums">{value}</span>
      {note ? <span className="text-caption-1 text-ink-2 tabular-nums">{note}</span> : null}
    </div>
  );
}

const cellClass = "px-3 py-2 text-right tabular-nums whitespace-nowrap first:text-left first:pl-0";

function Table({ caption, head, rows, footer }: { caption: string; head: string[]; rows: React.ReactNode[][]; footer: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-4 text-footnote text-ink-2">{caption}</h2>
      {/* Scrolls sideways on a phone, so it takes focus for the keyboard (axe scrollable-region-focusable). */}
      <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg bg-surface-1 px-4">
        <table className="w-full border-collapse text-subhead">
          <thead>
            <tr className="border-b border-line text-footnote text-ink-2">
              {head.map((label) => (
                <th key={label} scope="col" className={cn(cellClass, "font-medium")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-line last:border-0">
                {row.map((cell, column) => (
                  <td key={column} className={cellClass}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 text-footnote text-ink-2">{footer}</p>
    </section>
  );
}

function sources(copy: Dictionary["ownerStats"], value: Json): { label: string; count: number }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([source, count]) => ({ label: copy.sources[source as keyof typeof copy.sources] ?? source, count }))
    .sort((a, b) => b.count - a.count);
}

async function Stats({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params, { supabase }] = await Promise.all([getDictionary(), getLocale(), searchParams, requireAdmin()]);
  const copy = t.ownerStats;
  const weeks = ownerWeeks(params.weeks);
  const { summary, success, weekly, cohorts } = await loadOwnerMetrics(supabase, weeks);
  const n = (value: number) => formatNumber(locale, value);
  const percent = (part: number, total: number) => {
    const value = share(part, total);
    return value === null ? "" : `${value}%`;
  };
  const full = lastFullWeeks(weekly);
  const growthNote = (pick: (week: (typeof weekly)[number]) => number) => {
    const text = full ? growthText(growth(pick(full.current), pick(full.previous))) : "";
    return text ? interpolate(copy.highlights.growth, { value: text }) : undefined;
  };
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const day = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));
  const longest = Math.max(0, ...cohorts.map((cohort) => cohort.retained.length));
  const joins = sources(copy, summary.joins_by_source);
  const ofTotal = (part: number, total: number) =>
    [interpolate(copy.success.ofTotal, { part: n(part), total: n(total) }), percent(part, total)].filter(Boolean).join(", ");
  const goalLine = (part: number, total: number, goal: number) =>
    interpolate(successSignal(part, total, goal).reached ? copy.success.reached : copy.success.goal, { value: `${goal}%` });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChipRow label={copy.period}>
          {OWNER_WEEKS.map((option) => (
            <Chip key={option} href={`/admin/stats?weeks=${option}`} selected={option === weeks}>
              {copy.periods[String(option) as `${OwnerWeeks}`]}
            </Chip>
          ))}
        </ChipRow>
        <a href={`/api/admin/stats?weeks=${weeks}`} download className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "self-start")}>
          <Download aria-hidden size={18} />
          {copy.download}
        </a>
      </div>

      <section className="flex flex-col gap-1.5">
        <h2 className="px-4 text-footnote text-ink-2">{copy.highlights.header}</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Tile label={copy.highlights.users} value={n(summary.users)} />
          <Tile label={copy.highlights.trainers} value={n(summary.trainers)} />
          <Tile label={copy.highlights.clients} value={n(summary.clients)} />
          <Tile label={copy.highlights.mau} value={n(summary.mau)} note={growthNote((week) => week.active_users)} />
          <Tile
            label={copy.highlights.newUsers}
            value={n(full?.current.new_users ?? 0)}
            note={growthNote((week) => week.new_users)}
          />
          <Tile label={copy.highlights.turnover30} value={money(locale, summary.turnover_30)} />
        </div>
      </section>

      <ListGroup header={copy.success.header} footer={copy.success.footer} headingLevel={2}>
        <ListRow
          title={copy.success.streak}
          subtitle={goalLine(success.clients_with_streak, success.clients, SUCCESS_GOALS.streak)}
          value={ofTotal(success.clients_with_streak, success.clients)}
        />
        <ListRow
          title={copy.success.offerLive}
          subtitle={goalLine(success.trainers_offer_live, success.trainers, SUCCESS_GOALS.offers)}
          value={ofTotal(success.trainers_offer_live, success.trainers)}
        />
        <ListRow title={copy.success.offerEver} value={ofTotal(success.trainers_offer_ever, success.trainers)} />
      </ListGroup>

      <ListGroup header={copy.audience.header} headingLevel={2}>
        <ListRow title={copy.audience.users} value={n(summary.users)} />
        <ListRow title={copy.audience.trainers} value={n(summary.trainers)} />
        <ListRow title={copy.audience.trainersVerified} value={n(summary.trainers_verified)} />
        <ListRow title={copy.audience.clients} value={n(summary.clients)} />
        <ListRow title={copy.audience.cards} value={n(summary.cards)} />
        <ListRow title={copy.audience.pairs} value={n(summary.pairs)} />
      </ListGroup>

      <ListGroup header={copy.activity.header} footer={copy.activity.footer} headingLevel={2}>
        <ListRow title={copy.activity.dau} value={n(summary.dau)} />
        <ListRow title={copy.activity.wau} value={n(summary.wau)} />
        <ListRow title={copy.activity.mau} value={n(summary.mau)} />
        <ListRow title={copy.activity.stickiness} value={percent(summary.dau, summary.mau) || n(0)} />
        <ListRow title={copy.activity.trainers7} value={n(summary.trainers_active_7)} />
        <ListRow title={copy.activity.trainers30} value={n(summary.trainers_active_30)} />
        <ListRow title={copy.activity.clients7} value={n(summary.clients_active_7)} />
        <ListRow title={copy.activity.clients30} value={n(summary.clients_active_30)} />
      </ListGroup>

      <ListGroup header={copy.sessions.header} footer={copy.sessions.footer} headingLevel={2}>
        <ListRow title={copy.sessions.held} value={n(summary.held_sessions)} />
        <ListRow title={copy.sessions.attended} value={n(summary.attended)} />
        <ListRow title={copy.sessions.bookings} value={n(summary.bookings)} />
        <ListRow title={copy.sessions.passes} value={n(summary.passes_sold)} />
        <ListRow title={copy.sessions.turnover} value={money(locale, summary.turnover)} />
        <ListRow title={copy.sessions.turnover30} value={money(locale, summary.turnover_30)} />
      </ListGroup>

      <ListGroup header={copy.invites.header} headingLevel={2}>
        <ListRow title={copy.invites.trainerInvites} value={n(summary.trainer_invites_created)} />
        <ListRow
          title={copy.invites.trainerInvitesRedeemed}
          value={[n(summary.trainer_invites_redeemed), percent(summary.trainer_invites_redeemed, summary.trainer_invites_created)]
            .filter(Boolean)
            .join(", ")}
        />
        <ListRow title={copy.invites.trainerReferrals} value={n(summary.trainer_referrals)} />
        <ListRow title={copy.invites.clientReferrals} value={n(summary.client_referrals)} />
        <ListRow title={copy.invites.clientReferralsQualified} value={n(summary.client_referrals_qualified)} />
      </ListGroup>

      <ListGroup header={copy.invites.joins} headingLevel={2}>
        {joins.length === 0 ? <ListRow title={copy.invites.noJoins} /> : null}
        {joins.map((join) => (
          <ListRow key={join.label} title={join.label} value={n(join.count)} />
        ))}
      </ListGroup>

      <Table
        caption={copy.weekly.header}
        footer={copy.weekly.footer}
        head={[
          copy.weekly.week,
          copy.weekly.newUsers,
          copy.weekly.active,
          copy.weekly.newTrainers,
          copy.weekly.newPairs,
          copy.weekly.held,
          copy.weekly.turnover,
        ]}
        rows={weekly.toReversed().map((week) => [
          day(week.week_start),
          n(week.new_users),
          n(week.active_users),
          n(week.new_trainers),
          n(week.new_pairs),
          n(week.held_sessions),
          money(locale, week.turnover),
        ])}
      />

      <Table
        caption={copy.cohorts.header}
        footer={copy.cohorts.footer}
        head={[copy.cohorts.week, copy.cohorts.size, ...Array.from({ length: longest }, (_, k) => String(k))]}
        rows={cohorts.toReversed().map((cohort) => [
          day(cohort.cohort_week),
          n(cohort.size),
          ...Array.from({ length: longest }, (_, k) => {
            const value = retentionShares(cohort)[k];
            return value === undefined || value === null ? "" : `${value}%`;
          }),
        ])}
      />
    </div>
  );
}

/**
 * «Статистика» for the owner and investors: the platform in counts and totals as of now, week by week and as
 * sign-up cohorts, with the whole page as a CSV. Never a person's name, contact or money.
 */
export default async function AdminStatsPage(props: PageProps<"/[lang]/admin/stats">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.ownerStats.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-3xl flex-col gap-6 pt-4 md:pt-0">
        <p className="px-4 text-subhead text-ink-2 md:px-0">{t.ownerStats.lead}</p>
        <Suspense fallback={<SkeletonRows rows={8} label={t.common.loading} />}>
          <Stats searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

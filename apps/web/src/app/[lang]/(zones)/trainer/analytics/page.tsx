import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, FileDown, Salad } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { DismissChurn } from "@/components/trainer-analytics/dismiss-churn";
import { PriceSimulator } from "@/components/trainer-analytics/price-simulator";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatMoney } from "@/lib/money/format";
import { loadNutritionClients } from "@/lib/nutrition/adherence-load";
import { addDays } from "@/lib/schedule/time";
import { EXPORT_KINDS } from "@/lib/trainer-analytics/csv";
import { loadTrainerAnalytics, type FinanceRow, type TrainerAnalytics } from "@/lib/trainer-analytics/load";
import { change, PERIOD_KINDS, periodKind, periodOffset, type PeriodKind } from "@/lib/trainer-analytics/period";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerAnalytics.title };
}

type Copy = Dictionary["trainerAnalytics"];
type Data = NonNullable<TrainerAnalytics["data"]>;

/** "+20% к прошлому периоду", or nothing when there is no previous number to compare with. */
function versus(copy: Copy, current: number, previous: number): string | undefined {
  const percent = change(current, previous);
  if (percent === null) return undefined;
  return interpolate(copy.vsPrevious, { change: `${percent > 0 ? "+" : ""}${percent}%` });
}

/** One line per currency: amounts in different currencies are never added (§7 rule 4). */
function amounts(locale: Locale, rows: { currency: string; minor: number }[], none: string): string {
  const shown = rows.filter((row) => row.minor !== 0);
  return shown.length === 0 ? none : shown.map((row) => formatMoney(locale, row.minor, row.currency)).join(", ");
}

function PeriodNav({ copy, locale, kind, offset, analytics }: { copy: Copy; locale: Locale; kind: PeriodKind; offset: number; analytics: TrainerAnalytics }) {
  const range = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatRange(
    new Date(`${analytics.period.from}T12:00:00Z`),
    new Date(`${addDays(analytics.period.to, -1)}T12:00:00Z`),
  );
  const link = (to: number) => `/trainer/analytics?period=${kind}${to === 0 ? "" : `&offset=${to}`}`;
  const arrow = "inline-flex size-11 items-center justify-center rounded-full text-accent";
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={link(offset - 1)} aria-label={copy.previous} className={arrow}>
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <p className="text-headline tabular-nums">{range}</p>
      {analytics.isCurrent ? (
        <span className="size-11" />
      ) : (
        <Link href={link(offset + 1)} aria-label={copy.next} className={arrow}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      )}
    </div>
  );
}

function Attendance({ copy, data }: { copy: Copy; data: Data }) {
  const { current, before } = data;
  const marked = current.attended + current.no_shows;
  return (
    <ListGroup header={copy.attendance.header} headingLevel={2}>
      <ListRow title={copy.attendance.held} subtitle={versus(copy, current.held_sessions, before.held_sessions)} value={current.held_sessions} />
      <ListRow
        title={copy.attendance.rate}
        value={
          marked === 0
            ? copy.attendance.rateEmpty
            : interpolate(copy.attendance.rateValue, { share: Math.round((current.attended / marked) * 100), part: current.attended, total: marked })
        }
      />
      <ListRow title={copy.attendance.clients} subtitle={versus(copy, current.active_clients, before.active_clients)} value={current.active_clients} />
    </ListGroup>
  );
}

function Cancels({ copy, data }: { copy: Copy; data: Data }) {
  const { current, before } = data;
  return (
    <ListGroup header={copy.cancels.header} headingLevel={2}>
      <ListRow title={copy.cancels.client} subtitle={versus(copy, current.client_cancels, before.client_cancels)} value={current.client_cancels} />
      <ListRow title={copy.cancels.late} subtitle={versus(copy, current.late_cancels, before.late_cancels)} value={current.late_cancels} />
      <ListRow title={copy.cancels.noShows} subtitle={versus(copy, current.no_shows, before.no_shows)} value={current.no_shows} />
      <ListRow title={copy.cancels.trainer} subtitle={versus(copy, current.trainer_cancels, before.trainer_cancels)} value={current.trainer_cancels} />
    </ListGroup>
  );
}

function Money({ copy, locale, rows }: { copy: Copy; locale: Locale; rows: FinanceRow[] }) {
  const earned = rows.map((row) => ({ currency: row.currency, minor: row.earned_minor }));
  const received = rows.map((row) => ({ currency: row.currency, minor: row.received_minor }));
  const average = rows.filter((row) => row.charges > 0).map((row) => ({ currency: row.currency, minor: Math.round(row.earned_minor / row.charges) }));
  return (
    <ListGroup header={copy.money.header} footer={copy.money.footer} headingLevel={2}>
      <ListRow title={copy.money.earned} value={amounts(locale, earned, copy.money.none)} />
      <ListRow title={copy.money.received} value={amounts(locale, received, copy.money.none)} />
      <ListRow title={copy.money.average} value={amounts(locale, average, copy.money.none)} />
    </ListGroup>
  );
}

function Debts({ copy, locale, data }: { copy: Copy; locale: Locale; data: Data }) {
  const debt = Object.entries(data.current.debt).map(([currency, minor]) => ({ currency, minor }));
  return (
    <ListGroup header={copy.debts.header} headingLevel={2}>
      <ListRow title={copy.debts.clients} value={data.current.debt_clients} />
      <ListRow title={copy.debts.amount} value={amounts(locale, debt, copy.money.none)} />
    </ListGroup>
  );
}

function Ending({ copy, locale, timeZone, data }: { copy: Copy; locale: Locale; timeZone: string; data: Data }) {
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone });
  return (
    <ListGroup header={copy.ending.header} footer={copy.ending.footer} headingLevel={2}>
      {data.ending.length === 0 ? <ListRow title={copy.ending.empty} /> : null}
      {data.ending.map((pass) => (
        <ListRow
          key={`${pass.coaching_id}-${pass.title}-${pass.remaining}`}
          href={`/trainer/clients/${pass.coaching_id}`}
          title={pass.name}
          subtitle={[
            pass.title,
            interpolate(copy.ending.left, { count: pass.remaining }),
            pass.effective_expires_at ? interpolate(copy.ending.until, { date: date.format(new Date(pass.effective_expires_at)) }) : null,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      ))}
    </ListGroup>
  );
}

function Churn({ copy, data }: { copy: Copy; data: Data }) {
  const reason = (code: string, days: number | null) => {
    if (code === "no_sessions") return days === null ? copy.churn.reasons.no_sessions_never : interpolate(copy.churn.reasons.no_sessions, { days });
    return code === "pass_ended" ? copy.churn.reasons.pass_ended : copy.churn.reasons.cancels;
  };
  return (
    <ListGroup header={copy.churn.header} footer={copy.churn.footer} headingLevel={2}>
      {data.churn.length === 0 ? <ListRow title={copy.churn.empty} /> : null}
      {data.churn.map((client) => (
        <ListRow
          key={client.coaching_id}
          title={<Link href={`/trainer/clients/${client.coaching_id}`}>{client.name}</Link>}
          subtitle={client.reasons.map((code) => reason(code, client.days_absent)).join(", ")}
          trailing={<DismissChurn coachingId={client.coaching_id} name={client.name} />}
        />
      ))}
    </ListGroup>
  );
}

/** How many lowest-adherence clients the block names. */
const LOWEST_SHOWN = 3;

/** «Питание» (§7, wave-2 §5): average adherence over 7 days and the clients furthest from their target. */
async function Nutrition({ copy }: { copy: Copy }) {
  const clients = await loadNutritionClients(7);
  if (!clients) return null;
  const judged = clients.filter((client) => client.adherence.share !== null);
  const average = judged.length ? Math.round(judged.reduce((sum, client) => sum + (client.adherence.share ?? 0), 0) / judged.length) : null;
  const lowest = [...judged].sort((a, b) => (a.adherence.share ?? 0) - (b.adherence.share ?? 0)).slice(0, LOWEST_SHOWN);
  return (
    <ListGroup header={copy.nutrition.header} footer={clients.length ? copy.nutrition.footer : undefined} headingLevel={2}>
      {clients.length === 0 ? (
        <ListRow title={copy.nutrition.empty} />
      ) : (
        <>
          <ListRow
            title={copy.nutrition.average}
            value={average === null ? copy.nutrition.averageEmpty : interpolate(copy.nutrition.averageValue, { share: average })}
          />
          {lowest.map((client) => (
            <ListRow
              key={client.coachingId}
              title={client.name}
              value={interpolate(copy.nutrition.clientValue, { share: client.adherence.share ?? 0 })}
              href={`/trainer/clients/${client.coachingId}`}
            />
          ))}
        </>
      )}
      <ListRow icon={Salad} title={copy.nutrition.all} href="/trainer/nutrition" />
    </ListGroup>
  );
}

function Hints({ copy, finance }: { copy: Copy; finance: NonNullable<Data["finance"]> }) {
  const text = (hint: (typeof finance.hints)[number]) => {
    const template = copy.hints[hint.kind as keyof Omit<Copy["hints"], "header" | "empty">];
    return template ? interpolate(template, { a: hint.a ?? "", b: hint.b ?? "", value: hint.value }) : null;
  };
  const shown = finance.hints.map(text).filter((line): line is string => Boolean(line));
  return (
    <ListGroup header={copy.hints.header} headingLevel={2}>
      {shown.length === 0 ? <ListRow title={copy.hints.empty} /> : null}
      {shown.map((line) => (
        <ListRow key={line} title={<span className="whitespace-normal">{line}</span>} />
      ))}
    </ListGroup>
  );
}

function Exports({ copy, analytics }: { copy: Copy; analytics: TrainerAnalytics }) {
  const query = `from=${analytics.period.from}&to=${analytics.period.to}`;
  return (
    <ListGroup header={copy.csv.header} footer={copy.csv.footer} headingLevel={2}>
      {EXPORT_KINDS.map((kind) => (
        <ListRow
          key={kind}
          icon={FileDown}
          title={<a href={`/api/trainer/export/${kind}?${query}`} download className="after:absolute after:inset-0">{copy.csv[kind]}</a>}
          className="relative"
        />
      ))}
    </ListGroup>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/analytics">["searchParams"] }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.trainerAnalytics;
  const kind = periodKind(params.period);
  const offset = periodOffset(params.offset);
  const analytics = await loadTrainerAnalytics(kind, offset);
  if (!analytics) return null;
  const { access, data } = analytics;

  if (!data) {
    return <TierLock plan="trainer_pro" title={copy.lockTitle} description={copy.lockText} feature="trainer.analytics" requested={access.requested} />;
  }

  const base = data.finance
    ? data.finance.base.filter((row) => row.earned_minor > 0).map((row) => ({ currency: row.currency, monthlyMinor: Math.round(row.earned_minor / 3) }))
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <ChipRow label={copy.period}>
          {PERIOD_KINDS.map((option) => (
            <Chip key={option} href={`/trainer/analytics?period=${option}`} selected={option === kind}>
              {copy.periods[option]}
            </Chip>
          ))}
        </ChipRow>
        <PeriodNav copy={copy} locale={locale} kind={kind} offset={offset} analytics={analytics} />
      </div>
      <Attendance copy={copy} data={data} />
      <Cancels copy={copy} data={data} />
      {data.finance ? (
        <Money copy={copy} locale={locale} rows={data.finance.current} />
      ) : (
        <TierLock plan="trainer_pro" title={copy.money.lockTitle} description={copy.money.lockText} feature="trainer.finance" requested={access.requested} />
      )}
      <Debts copy={copy} locale={locale} data={data} />
      <Ending copy={copy} locale={locale} timeZone={analytics.timeZone} data={data} />
      <Churn copy={copy} data={data} />
      <Nutrition copy={copy} />
      {data.finance ? (
        <>
          <PriceSimulator base={base} />
          <Hints copy={copy} finance={data.finance} />
        </>
      ) : null}
      {access.export ? (
        <Exports copy={copy} analytics={analytics} />
      ) : (
        <TierLock plan="trainer_pro" title={copy.csv.lockTitle} description={copy.csv.lockText} feature="trainer.export" requested={access.requested} />
      )}
    </div>
  );
}

/** «Аналитика» тренера (PRD wave-2 §7, screens.md /trainer/analytics), from «Ещё». A Pro feature. */
export default async function TrainerAnalyticsPage(props: PageProps<"/[lang]/trainer/analytics">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerAnalytics.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className={cn("flex w-full max-w-2xl flex-col pt-4 md:pt-0")}>
        <Suspense fallback={<SkeletonRows rows={8} label={t.common.loading} />}>
          <Analytics searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}

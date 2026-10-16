"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import type { PassView } from "@/lib/passes/load";
import { formatLocalDay, paymentState, type HistoryEntry, type PassStatus, type PaymentState } from "@/lib/passes/present";
import { formatNoteTime } from "@/lib/pairs/format";

const STATUS_TONE: Record<PassStatus, "success" | "accent" | "warning" | "neutral" | "danger"> = {
  active: "success",
  frozen: "accent",
  expired: "warning",
  exhausted: "neutral",
  cancelled: "neutral",
};

const PAYMENT_TONE: Record<PaymentState, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  partial: "warning",
  unpaid: "danger",
  free: "neutral",
};

/** "Осталось 8 из 10", or "Истёк, не использовано 3" for an expired pass (PRD 2.8-8). */
export function passLeft(t: Dictionary, pass: Pick<PassView, "status" | "remaining" | "sessionsTotal">): string {
  const copy = t.money.passes;
  return pass.status === "expired" && pass.remaining > 0
    ? interpolate(copy.leftExpired, { remaining: pass.remaining })
    : interpolate(copy.left, { remaining: pass.remaining, total: pass.sessionsTotal });
}

/** The lines under a pass title: what is left, the dates, the price and payments, the freeze extension. */
export function passLines(t: Dictionary, locale: Locale, pass: PassView): string[] {
  const copy = t.money.passes;
  return [
    passLeft(t, pass),
    interpolate(copy.startsOn, { date: formatLocalDay(locale, pass.startsOn) }),
    pass.lastDay ? interpolate(copy.until, { date: formatLocalDay(locale, pass.lastDay) }) : copy.noExpiry,
    pass.priceMinor > 0
      ? interpolate(copy.paid, {
          price: formatMoney(locale, pass.priceMinor, pass.currency),
          paid: formatMoney(locale, pass.paidMinor, pass.currency),
        })
      : null,
    pass.freezeDays > 0 ? plural(locale, pass.freezeDays, copy.frozenDays) : null,
    pass.status === "cancelled" && pass.cancelReason ? interpolate(copy.cancelledReason, { reason: pass.cancelReason }) : null,
  ].filter((line): line is string => Boolean(line));
}

/** A pass as both sides see it: title, status and payment state, and its lines. */
export function PassSummary({ pass, children }: { pass: PassView; children?: React.ReactNode }) {
  const { t, locale } = useI18n();
  const copy = t.money.passes;
  const payment = paymentState(pass.priceMinor, pass.paidMinor);
  return (
    <article className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-headline break-words">{pass.title}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[pass.status]}>{copy.status[pass.status]}</Badge>
          {pass.status !== "cancelled" ? <Badge tone={PAYMENT_TONE[payment]}>{copy.payment[payment]}</Badge> : null}
        </div>
      </div>
      <ul className="flex flex-col gap-0.5 text-subhead text-ink-2 tabular-nums">
        {passLines(t, locale, pass).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {children}
    </article>
  );
}

/** What a history row says: the charge reason, a waiver, a settled debt ... */
export function historyLabel(t: Dictionary, entry: HistoryEntry): string {
  const copy = t.money.passes.history;
  if (entry.type === "charge") return copy.charge[entry.reason ?? "manual"];
  return copy[entry.type];
}

/** The pass history (screens.md "история списаний с причинами"), newest first. */
export function PassHistory({ entries, timeZone, headingLevel = 3 }: { entries: HistoryEntry[]; timeZone: string; headingLevel?: 2 | 3 }) {
  const { t, locale } = useI18n();
  const copy = t.money.passes.history;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="flex flex-col gap-1.5">
      <Heading className="px-4 text-footnote text-ink-2">{copy.title}</Heading>
      {entries.length === 0 ? (
        <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <span className="flex min-w-0 flex-col">
                <span className="text-body">{historyLabel(t, entry)}</span>
                <span className="text-footnote text-ink-2">
                  {[formatNoteTime(locale, entry.at, timeZone), entry.note].filter(Boolean).join(", ")}
                </span>
              </span>
              <span className="shrink-0 text-body text-ink-2 tabular-nums">{entry.delta > 0 ? `+${entry.delta}` : String(entry.delta)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

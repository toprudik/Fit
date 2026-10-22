"use client";

import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/money/format";
import { formatNoteTime } from "@/lib/pairs/format";
import type { MoneyChange, MoneyDetail } from "@/lib/passes/money-changes-present";
import { formatLocalDay } from "@/lib/passes/present";

function detailText(t: Dictionary, locale: Locale, detail: MoneyDetail): string {
  const copy = t.money.passes.changes;
  switch (detail.kind) {
    case "expires":
      if (!detail.to) return copy.noExpiry;
      return detail.from
        ? interpolate(copy.expiresMoved, { from: formatLocalDay(locale, detail.from), to: formatLocalDay(locale, detail.to) })
        : interpolate(copy.expires, { to: formatLocalDay(locale, detail.to) });
    case "title":
      return interpolate(copy.title, { title: detail.to });
    case "sessions":
      return interpolate(copy.sessions, { from: detail.from, to: detail.to });
    case "amount":
      return formatMoney(locale, detail.minor, detail.currency);
    case "note":
      return copy.note;
  }
}

/** «Изменения» of a pass (PRD wave-1 SCHED-22): sales, edits, freezes and payments with who, when and why, newest first. */
export function MoneyChanges({ changes, timeZone, headingLevel = 3 }: { changes: MoneyChange[]; timeZone: string; headingLevel?: 2 | 3 }) {
  const { t, locale } = useI18n();
  if (changes.length === 0) return null;
  const copy = t.money.passes.changes;
  const roles = t.schedule.booking.history.roles;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="flex flex-col gap-1.5">
      <Heading className="px-4 text-footnote text-ink-2">{copy.header}</Heading>
      <ul className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
        {[...changes].reverse().map((change) => {
          const who = change.role === "system" ? roles.system : (change.actor ?? roles[change.role]);
          return (
            <li key={change.id} className="flex flex-col border-t border-line px-4 py-3 first:border-t-0">
              <span className="text-body">{copy.actions[change.label]}</span>
              {change.details.length ? (
                <span className="text-subhead">{change.details.map((detail) => detailText(t, locale, detail)).join(", ")}</span>
              ) : null}
              <span className="text-footnote text-ink-2">
                {[who, formatNoteTime(locale, change.at, timeZone), change.reason ? `${copy.reason}: ${change.reason}` : null]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

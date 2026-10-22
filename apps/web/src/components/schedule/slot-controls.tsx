"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { closeDays, reopenDays, setSlotOpen, type CloseDaysResult } from "@/lib/schedule/actions";

type LeftSession = Extract<CloseDaysResult, { status: "done" }>["sessions"][number];

/**
 * "Закрыть дни" (PRD 2.6.1-5): a vacation or sick leave. The free slots of those days go; sessions stay,
 * and the ones left are listed so the trainer decides about them.
 */
export function CloseDaysForm({ today, timeZone }: { today: string; timeZone: string }) {
  const { t, locale } = useI18n();
  const copy = t.schedule.slotsPage;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<LeftSession[]>([]);
  const [pending, startTransition] = useTransition();
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!from || !to || to < from || from < today) return setError(copy.invalidRange);
    startTransition(async () => {
      const result = await closeDays({ from, to });
      if (result.status === "done") {
        setLeft(result.sessions);
        toast.success(copy.closedToast);
      } else {
        setError(result.status === "invalid" ? copy.invalidRange : copy.failed);
      }
    });
  };

  return (
    <section aria-labelledby="close-days" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <h2 id="close-days" className="text-title-3">
          {copy.closeHeader}
        </h2>
        <p className="text-callout text-ink-2">{copy.closeText}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          <DateField label={copy.from} min={today} value={from} onChange={setFrom} required />
          <DateField label={copy.to} min={from || today} value={to} onChange={setTo} required />
        </div>
        {error ? (
          <p role="alert" className="text-subhead text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" loading={pending}>
          {copy.close}
        </Button>
      </form>
      {left.length > 0 ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg bg-warning-soft p-4">
          <p className="text-callout text-ink">{copy.sessionsLeft}</p>
          <ul className="flex flex-col gap-1 text-callout text-ink">
            {left.map((session) => (
              <li key={session.id}>
                {when.format(new Date(session.startsAt))}
                {session.title ? `, ${session.title}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** "Открыть" on closed days: the template fills them back. */
export function ReopenButton({ slotId, label }: { slotId: string; label: string }) {
  const { t } = useI18n();
  const copy = t.schedule.slotsPage;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={label}
      onClick={() =>
        startTransition(async () => {
          const result = await reopenDays({ slotId });
          if (result.status === "done") toast.success(copy.reopened);
          else toast.error(copy.failed);
        })
      }
    >
      {copy.reopen}
    </Button>
  );
}

/** Closes one free slot or opens it again. */
export function SlotToggle({ slotId, open, label }: { slotId: string; open: boolean; label: string }) {
  const { t } = useI18n();
  const copy = t.schedule.slotsPage;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={`${open ? copy.closeSlot : copy.openSlot} ${label}`}
      onClick={() =>
        startTransition(async () => {
          const result = await setSlotOpen({ slotId, open: !open });
          if (result.status !== "done") toast.error(copy.failed);
        })
      }
    >
      {open ? copy.closeSlot : copy.openSlot}
    </Button>
  );
}

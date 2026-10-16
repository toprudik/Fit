"use client";

import { CalendarX, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { INTL_LOCALE } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { bookSlot, previewBooking, type PreviewResult } from "@/lib/bookings/actions";
import { findOverlap, groupByDay } from "@/lib/bookings/book";
import type { BookableSlot, BusyTime } from "@/lib/bookings/load";
import { localToUtc } from "@/lib/schedule/time";

type BookPickerProps = {
  timeZone: string;
  /** Local days of the strip, today first. */
  days: string[];
  slots: BookableSlot[];
  busy: BusyTime[];
  /** "Разовое занятие стоит 2 000 ₽.", or null without a drop-in price. */
  dropInText: string | null;
  paymentLinks: { title: string; url: string }[];
};

/**
 * "Запись на занятие" (screens.md /client/book): a strip of days, the free slots of the chosen day and a confirm
 * sheet that says what pays for the session (PRD 2.6.4): a pass, allowed debt, or a request to the trainer.
 */
export function BookPicker({ timeZone, days, slots, busy, dropInText, paymentLinks }: BookPickerProps) {
  const { t, locale } = useI18n();
  const copy = t.schedule.book;
  const router = useRouter();
  const byDay = useMemo(() => groupByDay(slots, timeZone), [slots, timeZone]);
  const [day, setDay] = useState(() => days.find((candidate) => byDay.has(candidate)) ?? days[0]);
  const [slot, setSlot] = useState<BookableSlot | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  const intl = INTL_LOCALE[locale];
  const chipFormat = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone });
  const timeFormat = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone });
  const range = (item: { startsAt: string; endsAt: string }) =>
    `${timeFormat.format(new Date(item.startsAt))}–${timeFormat.format(new Date(item.endsAt))}`;
  const where = (item: BookableSlot) => (item.mode === "online" ? copy.online : (item.place ?? copy.offline));

  const open = (next: BookableSlot) => {
    setSlot(next);
    setPreview(null);
    startTransition(async () => setPreview(await previewBooking(next.id)));
  };

  const confirm = () => {
    if (!slot) return;
    startTransition(async () => {
      const result = await bookSlot(slot.id);
      if (result.status === "done") {
        setSlot(null);
        toast.success(result.confirmed ? copy.booked : copy.requested);
        router.push(`/client/bookings/${result.bookingId}`);
        return;
      }
      setPreview(result);
    });
  };

  const daySlots = byDay.get(day) ?? [];
  const overlap = slot ? findOverlap(slot, busy) : null;
  const ready = preview?.status === "done";

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.days}>
        {days.map((candidate) => (
          <Chip key={candidate} selected={candidate === day} onClick={() => setDay(candidate)}>
            {chipFormat.format(localToUtc(candidate, 12 * 60, "UTC"))}
          </Chip>
        ))}
      </ChipRow>

      {daySlots.length > 0 ? (
        <ListGroup header={dayFormat.format(localToUtc(day, 12 * 60, timeZone))}>
          {daySlots.map((item) => (
            <ListRow
              key={item.id}
              icon={Clock}
              title={<span className="tabular-nums">{range(item)}</span>}
              subtitle={where(item)}
              onClick={() => open(item)}
            />
          ))}
        </ListGroup>
      ) : (
        <div className="flex items-center gap-3 px-1 py-6 text-body text-ink-2">
          <CalendarX aria-hidden size={20} />
          {copy.noSlotsDay}
        </div>
      )}

      <Sheet
        open={slot !== null}
        onOpenChange={(next) => (next ? null : setSlot(null))}
        title={copy.confirmTitle}
        description={slot ? `${dayFormat.format(new Date(slot.startsAt))}, ${range(slot)}, ${where(slot)}` : undefined}
        actions={
          <>
            <Button type="button" block loading={pending} disabled={!ready} onClick={confirm}>
              {ready && !preview.confirmed ? copy.sendRequest : copy.book}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setSlot(null)}>
              {copy.keep}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body">
          {preview === null ? (
            <div className="flex items-center gap-2 text-ink-2">
              <Spinner />
              {copy.checking}
            </div>
          ) : preview.status === "error" ? (
            <p role="alert" className="text-subhead text-danger">
              {copy.errors[preview.error === "slot_unavailable" || preview.error === "too_late" ? preview.error : "failed"]}
            </p>
          ) : preview.confirmed ? (
            <p>
              {preview.passTitle
                ? interpolate(copy.passLine, { title: preview.passTitle, count: preview.sessionsLeft ?? 0 })
                : copy.debtLine}
            </p>
          ) : (
            <>
              <p>{copy.requestLine}</p>
              {dropInText ? <p className="text-ink-2">{dropInText}</p> : null}
              {paymentLinks.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                  {interpolate(copy.pay, { title: link.title })}
                </a>
              ))}
            </>
          )}
          {overlap ? (
            <p className="rounded-sm bg-warning-soft p-3 text-subhead text-ink">{interpolate(copy.overlap, { name: overlap.trainer })}</p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

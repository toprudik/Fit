"use client";

import { CalendarX, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SignedOutActions } from "@/components/client-links/signed-out-actions";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { INTL_LOCALE } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { bookTrial, type BookingError } from "@/lib/bookings/actions";
import { groupByDay } from "@/lib/bookings/book";
import type { BookableSlot } from "@/lib/bookings/load";
import { localToUtc } from "@/lib/schedule/time";
import { hapticSuccess } from "@/lib/telegram/mini-app";

type TrialPickerProps = {
  token: string;
  timeZone: string;
  slots: BookableSlot[];
  /** Without a session, a picked time asks to sign in first and comes back here. */
  signIn: { telegramHref: string; loginHref: string } | null;
};

/**
 * "Выбор слота" on the trial landing (screens.md §3.1, PRD wave-1 §2.3-5): days with free trial time, the times
 * of the chosen day, and a sheet that sends the trial request. The trainer always answers it.
 */
export function TrialPicker({ token, timeZone, slots, signIn }: TrialPickerProps) {
  const { t, locale } = useI18n();
  const copy = t.schedule.trialBooking;
  const router = useRouter();
  const byDay = useMemo(() => groupByDay(slots, timeZone), [slots, timeZone]);
  const days = useMemo(() => [...byDay.keys()], [byDay]);
  const [day, setDay] = useState(() => days[0]);
  const [slot, setSlot] = useState<BookableSlot | null>(null);
  const [error, setError] = useState<BookingError | null>(null);
  const [pending, startTransition] = useTransition();

  const intl = INTL_LOCALE[locale];
  const chipFormat = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone });
  const timeFormat = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone });
  const range = (item: BookableSlot) => `${timeFormat.format(new Date(item.startsAt))}–${timeFormat.format(new Date(item.endsAt))}`;
  const where = (item: BookableSlot) => (item.mode === "online" ? t.schedule.book.online : (item.place ?? t.schedule.book.offline));

  const send = () => {
    if (!slot) return;
    startTransition(async () => {
      const result = await bookTrial(token, slot.id);
      if (result.status === "done") {
        setSlot(null);
        hapticSuccess();
        toast.success(copy.requested);
        router.push(`/client/bookings/${result.bookingId}`);
        return;
      }
      setError(result.error);
    });
  };

  const daySlots = byDay.get(day) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-headline">{copy.pick}</h2>
      <ChipRow label={t.schedule.book.days}>
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
              onClick={() => {
                setError(null);
                setSlot(item);
              }}
            />
          ))}
        </ListGroup>
      ) : (
        <div className="flex items-center gap-3 px-1 py-6 text-body text-ink-2">
          <CalendarX aria-hidden size={20} />
          {t.schedule.book.noSlotsDay}
        </div>
      )}

      <Sheet
        open={slot !== null}
        onOpenChange={(next) => (next ? null : setSlot(null))}
        title={copy.confirmTitle}
        description={slot ? `${dayFormat.format(new Date(slot.startsAt))}, ${range(slot)}, ${where(slot)}` : undefined}
        actions={
          signIn ? (
            <SignedOutActions telegramHref={signIn.telegramHref} loginHref={signIn.loginHref} />
          ) : (
            <>
              <Button type="button" block loading={pending} onClick={send}>
                {copy.send}
              </Button>
              <Button type="button" variant="secondary" block onClick={() => setSlot(null)}>
                {copy.keep}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3 text-body">
          <p>{signIn ? copy.signInLine : copy.requestLine}</p>
          {error ? (
            <p role="alert" className="text-subhead text-danger">
              {
                copy.errors[
                  error === "request_not_found" || error === "invalid_reason" || error === "session_full" || error === "already_booked"
                    ? "failed"
                    : error
                ]
              }
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

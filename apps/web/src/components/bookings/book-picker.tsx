"use client";

import { CalendarX, Clock, Users } from "lucide-react";
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
import {
  bookGroupSession,
  bookSlot,
  joinWaitlist,
  previewBooking,
  previewGroupBooking,
  type BookingError,
  type PreviewResult,
} from "@/lib/bookings/actions";
import { findOverlap, groupByDay } from "@/lib/bookings/book";
import { previewReschedule, rescheduleBooking } from "@/lib/bookings/changes";
import type { BookableGroup, BookableSlot, BusyTime } from "@/lib/bookings/load";
import { localToUtc } from "@/lib/schedule/time";

type BookPickerProps = {
  timeZone: string;
  /** Local days of the strip, today first. */
  days: string[];
  slots: BookableSlot[];
  /** Open group sessions of the trainer, listed among the slots of their day. */
  groups: BookableGroup[];
  busy: BusyTime[];
  /** "Разовое занятие стоит 2 000 ₽.", or null without a drop-in price. */
  dropInText: string | null;
  paymentLinks: { title: string; url: string }[];
  /** Set on /client/bookings/[bookingId]/reschedule: the chosen slot replaces this booking (PRD 2.6.5). */
  moveBookingId?: string;
};

type Item = ({ type: "slot" } & BookableSlot) | ({ type: "group" } & BookableGroup);

/**
 * "Запись на занятие" (screens.md /client/book): a strip of days, the free slots and group sessions of the chosen
 * day and a confirm sheet that says what pays for the session (PRD 2.6.4): a pass, allowed debt, or a request to
 * the trainer. A group shows its free seats; a full one cannot be picked (SCHED-15).
 */
export function BookPicker({ timeZone, days, slots, groups, busy, dropInText, paymentLinks, moveBookingId }: BookPickerProps) {
  const { t, locale } = useI18n();
  const copy = t.schedule.book;
  const router = useRouter();
  const groupCopy = t.schedule.groupSession;
  const byDay = useMemo(() => {
    const items: Item[] = [
      ...slots.map((slot) => ({ type: "slot" as const, ...slot })),
      ...groups.map((group) => ({ type: "group" as const, ...group })),
    ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return groupByDay(items, timeZone);
  }, [slots, groups, timeZone]);
  const [day, setDay] = useState(() => days.find((candidate) => byDay.has(candidate)) ?? days[0]);
  const [slot, setSlot] = useState<Item | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [queueFor, setQueueFor] = useState<BookableGroup | null>(null);
  const [queueError, setQueueError] = useState<BookingError | null>(null);
  const waitCopy = t.schedule.waitlist;
  const [pending, startTransition] = useTransition();

  const intl = INTL_LOCALE[locale];
  const chipFormat = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone });
  const timeFormat = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone });
  const range = (item: { startsAt: string; endsAt: string }) =>
    `${timeFormat.format(new Date(item.startsAt))}–${timeFormat.format(new Date(item.endsAt))}`;
  const where = (item: BookableSlot) => (item.mode === "online" ? copy.online : (item.place ?? copy.offline));

  const open = (next: Item) => {
    setSlot(next);
    setPreview(null);
    startTransition(async () =>
      setPreview(
        await (next.type === "group"
          ? previewGroupBooking(next.id)
          : moveBookingId
            ? previewReschedule(moveBookingId, next.id)
            : previewBooking(next.id)),
      ),
    );
  };

  const confirm = () => {
    if (!slot) return;
    startTransition(async () => {
      const result =
        slot.type === "group"
          ? await bookGroupSession(slot.id)
          : moveBookingId
            ? await rescheduleBooking(moveBookingId, slot.id)
            : await bookSlot(slot.id);
      if (result.status === "done") {
        setSlot(null);
        if (moveBookingId) toast.success(result.confirmed ? copy.moved : copy.moveRequested);
        else toast.success(result.confirmed ? copy.booked : copy.requested);
        router.push(`/client/bookings/${result.bookingId}`);
        return;
      }
      setPreview(result);
    });
  };

  const joinQueue = () => {
    if (!queueFor) return;
    startTransition(async () => {
      const result = await joinWaitlist(queueFor.id);
      if (result.status === "done") {
        setQueueFor(null);
        toast.success(interpolate(waitCopy.joined, { place: result.place }));
        router.push(`/client/waitlist/${result.entryId}`);
        return;
      }
      setQueueError(result.error);
    });
  };

  const groupState = (item: Extract<Item, { type: "group" }>) => {
    if (item.myBookingId) return { text: groupCopy.youAreIn, href: `/client/bookings/${item.myBookingId}` };
    if (item.waitlist?.status === "offered") return { text: waitCopy.offeredRow, href: `/client/waitlist/${item.waitlist.id}` };
    if (item.waitlist) {
      return { text: interpolate(waitCopy.placeRow, { place: item.waitlist.place ?? 1 }), href: `/client/waitlist/${item.waitlist.id}` };
    }
    if (item.taken >= item.capacity) {
      return {
        text: waitCopy.fullRow,
        onClick: () => {
          setQueueError(null);
          setQueueFor(item);
        },
      };
    }
    return {
      text: interpolate(groupCopy.seatsLeft, { count: item.capacity - item.taken, capacity: item.capacity }),
      onClick: () => open(item),
    };
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
          {daySlots.map((item) => {
            if (item.type === "slot") {
              return (
                <ListRow
                  key={item.id}
                  icon={Clock}
                  title={<span className="tabular-nums">{range(item)}</span>}
                  subtitle={where(item)}
                  onClick={() => open(item)}
                />
              );
            }
            const state = groupState(item);
            return (
              <ListRow
                key={item.id}
                icon={Users}
                title={
                  <>
                    <span className="tabular-nums">{range(item)}</span>, {item.title}
                  </>
                }
                subtitle={`${where(item)}, ${state.text}`}
                href={state.href}
                onClick={state.onClick}
              />
            );
          })}
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
        title={
          slot?.type === "group" ? interpolate(groupCopy.confirmTitle, { title: slot.title }) : moveBookingId ? copy.moveTitle : copy.confirmTitle
        }
        description={slot ? `${dayFormat.format(new Date(slot.startsAt))}, ${range(slot)}, ${where(slot)}` : undefined}
        actions={
          <>
            <Button type="button" block loading={pending} disabled={!ready} onClick={confirm}>
              {ready && !preview.confirmed ? copy.sendRequest : moveBookingId ? copy.move : copy.book}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setSlot(null)}>
              {moveBookingId ? copy.moveKeep : copy.keep}
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
              {preview.error === "session_full" || preview.error === "already_booked"
                ? groupCopy.bookErrors[preview.error]
                : copy.errors[preview.error === "slot_unavailable" || preview.error === "too_late" ? preview.error : "failed"]}
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

      <Sheet
        open={queueFor !== null}
        onOpenChange={(next) => (next ? null : setQueueFor(null))}
        title={queueFor ? interpolate(waitCopy.joinTitle, { title: queueFor.title }) : waitCopy.joinTitle}
        description={queueFor ? `${dayFormat.format(new Date(queueFor.startsAt))}, ${range(queueFor)}, ${where(queueFor)}` : undefined}
        actions={
          <>
            <Button type="button" block loading={pending} onClick={joinQueue}>
              {waitCopy.join}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setQueueFor(null)}>
              {waitCopy.notNow}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body">
          <p>{waitCopy.joinText}</p>
          {queueError ? (
            <p role="alert" className="text-subhead text-danger">
              {queueError in waitCopy.errors ? waitCopy.errors[queueError as keyof typeof waitCopy.errors] : waitCopy.errors.failed}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

"use client";

import { CalendarX, Clock, ExternalLink, Hourglass, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
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
  joinSlotWaitlist,
  joinWaitlist,
  previewBooking,
  previewGroupBooking,
  type BookingError,
  type PreviewResult,
} from "@/lib/bookings/actions";
import { findOverlap, groupByDay } from "@/lib/bookings/book";
import { previewReschedule, rescheduleBooking } from "@/lib/bookings/changes";
import type { BookableGroup, BookableSlot, BusyTime } from "@/lib/bookings/load";
import type { QueueSlot } from "@/lib/bookings/slot-waitlist";
import { localToUtc } from "@/lib/schedule/time";
import { trainerClock } from "@/lib/schedule/trainer-clock";
import { openExternalLink } from "@/lib/telegram/mini-app";
import type { PaymentLinkKind } from "@/lib/trainer-wizard/options";
import { cn } from "@/lib/utils";

type BookPickerProps = {
  timeZone: string;
  /** The trainer's time zone: when their clock differs, the confirmation adds their time (SCHED-19). */
  trainerTimeZone?: string | null;
  /** Local days of the strip, today first. */
  days: string[];
  slots: BookableSlot[];
  /** Open group sessions of the trainer, listed among the slots of their day. */
  groups: BookableGroup[];
  /** Slots someone else booked, which the client can queue for (PRD wave-2 §9). */
  queueSlots?: QueueSlot[];
  busy: BusyTime[];
  /** "Разовое занятие стоит 2 000 ₽.", or null without a drop-in price. */
  dropInText: string | null;
  paymentLinks: { url: string; kind: PaymentLinkKind }[];
  /** Set on /client/bookings/[bookingId]/reschedule: the chosen slot replaces this booking (PRD 2.6.5). */
  moveBookingId?: string;
};

type Item = ({ type: "slot" } & BookableSlot) | ({ type: "group" } & BookableGroup) | ({ type: "queue" } & QueueSlot);

/**
 * "Запись на занятие" (screens.md /client/book): a strip of days, the free slots and group sessions of the chosen
 * day and a confirm sheet that says what pays for the session (PRD 2.6.4): a pass, allowed debt, or a request to
 * the trainer. A group shows its free seats; a full one cannot be picked (SCHED-15). A full group or a slot someone
 * else booked offers the waitlist instead (PRD wave-2 §9).
 */
export function BookPicker({
  timeZone,
  trainerTimeZone,
  days,
  slots,
  groups,
  queueSlots = [],
  busy,
  dropInText,
  paymentLinks,
  moveBookingId,
}: BookPickerProps) {
  const { t, locale } = useI18n();
  const copy = t.schedule.book;
  const router = useRouter();
  const groupCopy = t.schedule.groupSession;
  const byDay = useMemo(() => {
    // A free slot held by someone's waitlist offer is listed for the queue, not for booking.
    const queued = new Set(queueSlots.map((slot) => slot.id));
    const items: Item[] = [
      ...slots.filter((slot) => !queued.has(slot.id)).map((slot) => ({ type: "slot" as const, ...slot })),
      ...groups.map((group) => ({ type: "group" as const, ...group })),
      ...(moveBookingId ? [] : queueSlots.map((slot) => ({ type: "queue" as const, ...slot }))),
    ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return groupByDay(items, timeZone);
  }, [slots, groups, queueSlots, moveBookingId, timeZone]);
  const [day, setDay] = useState(() => days.find((candidate) => byDay.has(candidate)) ?? days[0]);
  const [slot, setSlot] = useState<Exclude<Item, { type: "queue" }> | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [queueFor, setQueueFor] = useState<Extract<Item, { type: "group" | "queue" }> | null>(null);
  const [queueError, setQueueError] = useState<BookingError | null>(null);
  const waitCopy = t.schedule.waitlist;
  const [pending, startTransition] = useTransition();

  const intl = INTL_LOCALE[locale];
  const chipFormat = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone });
  const timeFormat = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone });
  const range = (item: { startsAt: string; endsAt: string }) =>
    `${timeFormat.format(new Date(item.startsAt))}–${timeFormat.format(new Date(item.endsAt))}`;
  const trainerTime = (item: { startsAt: string; endsAt: string }) => {
    const clock = trainerClock(item, timeZone, trainerTimeZone, intl);
    return clock ? `, ${interpolate(t.schedule.trainerTime, { time: clock })}` : "";
  };
  const where = (item: BookableSlot) => (item.mode === "online" ? copy.online : (item.place ?? copy.offline));

  const open = (next: Exclude<Item, { type: "queue" }>) => {
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
        else if (result.already) toast.success(copy.errors.own_slot);
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
      const result = queueFor.type === "queue" ? await joinSlotWaitlist(queueFor.id) : await joinWaitlist(queueFor.id);
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
            if (item.type === "queue") {
              return (
                <ListRow
                  key={item.id}
                  icon={Hourglass}
                  title={<span className="tabular-nums">{range(item)}</span>}
                  subtitle={`${where(item)}${trainerTime(item)}, ${item.myEntryId ? waitCopy.inQueueRow : waitCopy.bookedRow}`}
                  href={item.myEntryId ? `/client/waitlist/${item.myEntryId}` : undefined}
                  onClick={
                    item.myEntryId
                      ? undefined
                      : () => {
                          setQueueError(null);
                          setQueueFor(item);
                        }
                  }
                />
              );
            }
            if (item.type === "slot") {
              return (
                <ListRow
                  key={item.id}
                  icon={Clock}
                  title={<span className="tabular-nums">{range(item)}</span>}
                  subtitle={`${where(item)}${trainerTime(item)}`}
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
                subtitle={`${where(item)}${trainerTime(item)}, ${state.text}`}
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
        description={slot ? `${dayFormat.format(new Date(slot.startsAt))}, ${range(slot)}${trainerTime(slot)}, ${where(slot)}` : undefined}
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
                : copy.errors[
                    preview.error === "slot_unavailable" ||
                    preview.error === "own_slot" ||
                    preview.error === "too_late" ||
                    preview.error === "debt_limit"
                      ? preview.error
                      : "failed"
                  ]}
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
              {/* The link's own title is the trainer's note to self («Тест-оплата QA»), so the client sees its kind (QA 23.10). */}
              {paymentLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (openExternalLink(link.url)) event.preventDefault();
                  }}
                  className={cn(buttonVariants({ variant: "secondary", block: true }))}
                >
                  <ExternalLink aria-hidden size={18} strokeWidth={1.75} />
                  {copy.payKinds[link.kind]}
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
        title={
          queueFor?.type === "group" ? interpolate(waitCopy.joinTitle, { title: queueFor.title }) : waitCopy.joinSlotTitle
        }
        description={
          queueFor ? `${dayFormat.format(new Date(queueFor.startsAt))}, ${range(queueFor)}${trainerTime(queueFor)}, ${where(queueFor)}` : undefined
        }
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
